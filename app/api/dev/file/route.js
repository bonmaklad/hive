import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseAuth';

export const runtime = 'nodejs';

function safeText(value, limit = 200) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function isMissing(value) {
    const v = typeof value === 'string' ? value.trim() : '';
    if (!v) return true;
    if (v.toLowerCase() === 'undefined') return true;
    if (v.toLowerCase() === 'null') return true;
    return false;
}

async function getAdminClient() {
    try {
        return createSupabaseAdminClient();
    } catch (e) {
        throw new Error(
            e?.message ||
                'Server Supabase admin key is missing/invalid. Set `SUPABASE_SERVICE_KEY` (service_role key) on the Next.js server.'
        );
    }
}

async function requireSiteAccess({ request, siteId }) {
    const { user, error: authError } = await getUserFromRequest(request);
    if (!user) return { ok: false, status: 401, error: authError || 'Unauthorized' };

    const admin = await getAdminClient();

    const { data: site, error: siteError } = await admin
        .from('sites')
        .select('id, owner_id')
        .eq('id', siteId)
        .maybeSingle();

    if (siteError) return { ok: false, status: 500, error: siteError.message };
    if (!site) return { ok: false, status: 404, error: 'Site not found.' };

    if (site.owner_id === user.id) return { ok: true, admin, user, site, isAdmin: false };

    const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('id, is_admin')
        .eq('id', user.id)
        .maybeSingle();

    if (profileError) return { ok: false, status: 500, error: profileError.message };
    if (!profile?.is_admin) return { ok: false, status: 403, error: 'Not allowed.' };

    return { ok: true, admin, user, site, isAdmin: true };
}

function getHiveServerConfig() {
    const baseUrl = safeText(process.env.HIVESERVER_URL, 500).replace(/\/$/, '');
    const token = safeText(process.env.HIVESERVER_TOKEN, 500);

    return {
        baseUrl: isMissing(baseUrl) ? '' : baseUrl,
        token: isMissing(token) ? '' : token
    };
}

async function callHiveServer({ path, payload }) {
    const cfg = getHiveServerConfig();
    if (!cfg.baseUrl) {
        return {
            ok: false,
            status: 501,
            error: 'Dev server not configured.',
            detail: 'Set `HIVESERVER_URL` and `HIVESERVER_TOKEN` on the Next.js server.'
        };
    }
    if (!cfg.token) {
        return {
            ok: false,
            status: 501,
            error: 'Dev server token not configured.',
            detail: 'Set `HIVESERVER_TOKEN` on the Next.js server.'
        };
    }

    const url = `${cfg.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                accept: 'application/json',
                authorization: `Bearer ${cfg.token}`
            },
            body: JSON.stringify(payload || {})
        });
    } catch (e) {
        return { ok: false, status: 502, error: 'Dev server unreachable.', detail: e?.message || String(e) };
    }

    let body = null;
    try {
        body = await res.json();
    } catch {
        body = { error: await res.text().catch(() => '') };
    }

    if (!res.ok) {
        return {
            ok: false,
            status: res.status,
            error: body?.error || `Dev server error (${res.status}).`,
            detail: body?.detail || null,
            body
        };
    }

    return { ok: true, status: res.status, data: body };
}

export async function GET(request) {
    const url = new URL(request.url);
    const siteId = safeText(url.searchParams.get('siteId') || url.searchParams.get('site_id'), 80);
    const filePath = safeText(url.searchParams.get('path'), 2000);
    if (!siteId) return NextResponse.json({ error: 'site_id is required' }, { status: 400 });
    if (!filePath) return NextResponse.json({ error: 'path is required' }, { status: 400 });

    const guard = await requireSiteAccess({ request, siteId });
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const res = await callHiveServer({
        path: '/v1/dev-files/read',
        payload: { site_id: siteId, path: filePath }
    });

    if (!res.ok) {
        return NextResponse.json(res.body || { error: res.error, detail: res.detail || null }, { status: res.status });
    }

    return NextResponse.json({ content: res.data?.content || '', hash: res.data?.hash || null });
}

export async function POST(request) {
    const payload = await request.json().catch(() => ({}));
    const siteId = safeText(payload?.siteId || payload?.site_id, 80);
    const filePath = safeText(payload?.path, 2000);
    const content = payload?.content;
    const hash = safeText(payload?.hash, 200);
    if (!siteId) return NextResponse.json({ error: 'site_id is required' }, { status: 400 });
    if (!filePath) return NextResponse.json({ error: 'path is required' }, { status: 400 });
    if (typeof content !== 'string') return NextResponse.json({ error: 'content must be a string' }, { status: 400 });

    const guard = await requireSiteAccess({ request, siteId });
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const res = await callHiveServer({
        path: '/v1/dev-files/write',
        payload: { site_id: siteId, path: filePath, content, hash }
    });

    if (!res.ok) {
        return NextResponse.json(res.body || { error: res.error, detail: res.detail || null }, { status: res.status });
    }

    return NextResponse.json({ ok: true, hash: res.data?.hash || null });
}
