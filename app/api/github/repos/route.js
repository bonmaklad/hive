import jwt from 'jsonwebtoken';
import { readFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { getUserFromRequest } from '../../_lib/supabaseAuth';

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers || {})
    }
  });
}

function looksLikePem(key) {
  return typeof key === 'string' && key.includes('-----BEGIN') && key.includes('-----END');
}

function looksLikeBase64(key) {
  if (typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (!trimmed) return false;
  if (trimmed.includes('-----BEGIN')) return false;
  if (trimmed.length < 200) return false;
  return /^[a-z0-9+/=\s]+$/i.test(trimmed);
}

function normalizePrivateKey(raw) {
  if (typeof raw !== 'string') return { key: '', meta: { kind: 'missing' } };

  let key = raw.trim();
  if (!key) return { key: '', meta: { kind: 'empty' } };

  // JSON wrapper support (common when storing secrets as {"private_key":"..."}).
  if (key.startsWith('{') && key.endsWith('}')) {
    try {
      const parsed = JSON.parse(key);
      const candidate =
        parsed?.private_key ||
        parsed?.privateKey ||
        parsed?.key ||
        parsed?.pem ||
        parsed?.data?.private_key ||
        null;
      if (typeof candidate === 'string') {
        key = candidate.trim();
      }
    } catch {
      // ignore
    }
  }

  if (key.includes('\\n')) key = key.replace(/\\n/g, '\n');
  if (key.startsWith('"') || key.startsWith("'")) key = key.replace(/^['"]|['"]$/g, '').trim();

  // Storage objects are sometimes stored base64-encoded.
  if (!looksLikePem(key) && looksLikeBase64(key)) {
    try {
      const decoded = Buffer.from(key.replace(/\s/g, ''), 'base64').toString('utf8').trim();
      if (looksLikePem(decoded)) key = decoded;
    } catch {
      // ignore
    }
  }

  const meta = {
    kind: 'string',
    length: key.length,
    hasBegin: key.includes('-----BEGIN'),
    hasEnd: key.includes('-----END'),
    looksLikePem: looksLikePem(key)
  };

  return { key, meta };
}

async function tryReadFile(path) {
  if (typeof path !== 'string') return null;
  const p = path.trim();
  if (!p) return null;
  try {
    await access(p);
    return await readFile(p, 'utf8');
  } catch {
    return null;
  }
}

export async function GET(request) {
  try {
    const { user, error: authError } = await getUserFromRequest(request);
    if (!user) {
      return json({ error: authError || 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const installationId = url.searchParams.get('installation_id');
    const perPage = url.searchParams.get('per_page') || '100';
    const page = url.searchParams.get('page') || '1';

    if (!installationId) {
      return json({ error: 'installation_id is required' }, { status: 400 });
	    }

	    const appId = process.env.GITHUB_APP_ID || process.env.NEXT_PUBLIC_GITHUB_APP_ID;
	    let privateKey = process.env.GITHUB_APP_PRIVATE_KEY || null;
	    let keySource = privateKey ? 'env:GITHUB_APP_PRIVATE_KEY' : '';
	    let envKeyInvalidMeta = null;

	    // If someone mistakenly set GITHUB_APP_PRIVATE_KEY to a file path, try reading it.
	    if (privateKey && !looksLikePem(privateKey)) {
	      const normalizedEnv = normalizePrivateKey(privateKey);
	      if (looksLikePem(normalizedEnv.key)) {
	        privateKey = normalizedEnv.key;
	      } else {
	        const fromPath = await tryReadFile(privateKey);
	        if (fromPath) {
	          privateKey = fromPath;
	          keySource = 'file:GITHUB_APP_PRIVATE_KEY';
	        } else {
	          envKeyInvalidMeta = { source: 'env:GITHUB_APP_PRIVATE_KEY', ...normalizedEnv.meta };
	          privateKey = null;
	          keySource = '';
	        }
	      }
	    }

    // Read from file path if provided
    if (!privateKey && process.env.GITHUB_APP_PRIVATE_KEY_PATH) {
      try {
        privateKey = await readFile(process.env.GITHUB_APP_PRIVATE_KEY_PATH, 'utf8');
        keySource = 'file:GITHUB_APP_PRIVATE_KEY_PATH';
      } catch (e) {
        // ignore and try other sources
      }
    }
    // Optional: fetch from Supabase Storage using Service Role (server-only)
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SERVICE_ROLE_KEY;

    if (!privateKey && serviceRoleKey) {
      const bucket = process.env.GITHUB_APP_PRIVATE_KEY_STORAGE_BUCKET;
      const objectPath = process.env.GITHUB_APP_PRIVATE_KEY_STORAGE_OBJECT;
      const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      if (bucket && objectPath && supaUrl) {
        try {
          const admin = createSupabaseAdmin(supaUrl, serviceRoleKey, {
            auth: { persistSession: false }
          });
          const { data: blob, error: dlError } = await admin.storage.from(bucket).download(objectPath);
          if (!dlError && blob) {
            // In Node 18+, Blob is supported
            const buf = Buffer.from(await blob.arrayBuffer());
            privateKey = buf.toString('utf8');
            keySource = 'supabase-storage';
          }
        } catch {
          // ignore; will be caught below if still missing
        }
      }
    }
    // Allow providing the key as base64 to avoid newline/quoting issues
    if (!privateKey && process.env.GITHUB_APP_PRIVATE_KEY_BASE64) {
      try {
        privateKey = Buffer.from(process.env.GITHUB_APP_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
        keySource = 'env:GITHUB_APP_PRIVATE_KEY_BASE64';
      } catch {
        // fall through; will be caught below when attempting to sign
      }
    }

	    if (!appId || !privateKey) {
	      return json(
	        {
	          error: 'GitHub App not configured',
	          detail:
	            'Set GITHUB_APP_ID and configure a GitHub App private key to enable repository listing.',
	          meta: envKeyInvalidMeta ? { env_key_invalid: envKeyInvalidMeta } : undefined
	        },
	        { status: 501 }
	      );
	    }

    const normalized = normalizePrivateKey(privateKey);
    privateKey = normalized.key;

    if (!looksLikePem(privateKey)) {
      return json(
        {
          error: 'GitHub App private key invalid',
          detail:
            'The configured key is not a PEM private key. It should include the -----BEGIN ... PRIVATE KEY----- header and footer.',
          meta: {
            source: keySource || 'unknown',
            ...normalized.meta
          },
          hint:
            'If you stored the key in Supabase Storage, ensure the object contents are the raw PEM (not a file path). If it is base64 encoded, store raw PEM or provide GITHUB_APP_PRIVATE_KEY_BASE64. If you have a local file path, set GITHUB_APP_PRIVATE_KEY_PATH.'
        },
        { status: 500 }
      );
    }

    // Create a JWT for the GitHub App
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iat: now - 60, // backdate 60s
      exp: now + 600, // valid for 10 minutes
      iss: appId
    };

    // Support private key provided with escaped newlines
    if (privateKey && privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }
    // Ensure PEM has proper header/footer; if it looks quoted, strip surrounding quotes
    if (privateKey && (privateKey.startsWith('"') || privateKey.startsWith("'"))) {
      privateKey = privateKey.replace(/^['"]|['"]$/g, '');
    }
    if (privateKey && !privateKey.includes('BEGIN') && privateKey.includes('-----')) {
      // leave as-is; some env providers may still be fine
    }

    let token;
    try {
      token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
    } catch (e) {
      return json({
        error: 'Failed to sign JWT',
        detail: String(e?.message || e),
        meta: {
          source: keySource || 'unknown',
          ...normalized.meta
        },
        hint:
          'Ensure GITHUB_APP_PRIVATE_KEY is the full PEM (including -----BEGIN PRIVATE KEY----- / -----END PRIVATE KEY-----). If using a single line, use \\n for newlines, or set GITHUB_APP_PRIVATE_KEY_BASE64.'
      }, { status: 500 });
    }

    // Exchange for an installation access token
    const installTokenRes = await fetch(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'hive-deploy'
        }
      }
    );

    if (!installTokenRes.ok) {
      const text = await installTokenRes.text();
      return json(
        {
          error: 'Failed to get installation access token',
          status: installTokenRes.status,
          body: text
        },
        { status: 502 }
      );
    }

    const installTokenBody = await installTokenRes.json();
    const accessToken = installTokenBody?.token;
    if (!accessToken) {
      return json({ error: 'No installation token returned' }, { status: 502 });
    }

    // List repositories for the installation
    const reposRes = await fetch(
      `https://api.github.com/installation/repositories?per_page=${perPage}&page=${page}`,
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'hive-deploy'
        }
      }
    );

    if (!reposRes.ok) {
      const text = await reposRes.text();
      return json(
        {
          error: 'Failed to list repositories',
          status: reposRes.status,
          body: text
        },
        { status: 502 }
      );
    }

    const reposBody = await reposRes.json();
    const repos = (reposBody?.repositories || []).map(r => ({
      id: r.id,
      full_name: r.full_name,
      private: r.private,
      fork: r.fork,
      default_branch: r.default_branch,
      html_url: r.html_url,
      name: r.name,
      owner: r.owner?.login
    }));

    return json({ repositories: repos });
  } catch (err) {
    return json({ error: 'Unexpected error', detail: String(err?.message || err) }, { status: 500 });
  }
}
