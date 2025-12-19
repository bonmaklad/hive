import jwt from 'jsonwebtoken';

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers || {})
    }
  });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const installationId = url.searchParams.get('installation_id');
    const perPage = url.searchParams.get('per_page') || '100';
    const page = url.searchParams.get('page') || '1';

    if (!installationId) {
      return json({ error: 'installation_id is required' }, { status: 400 });
    }

    const appId = process.env.GITHUB_APP_ID || process.env.NEXT_PUBLIC_GITHUB_APP_ID;
    let privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

    if (!appId || !privateKey) {
      return json(
        {
          error: 'GitHub App not configured',
          detail:
            'Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY in your environment to enable repository listing.'
        },
        { status: 501 }
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

    let token;
    try {
      token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
    } catch (e) {
      return json({ error: 'Failed to sign JWT', detail: String(e?.message || e) }, { status: 500 });
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
