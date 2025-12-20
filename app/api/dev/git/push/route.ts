import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../../_lib/supabaseAuth';
import { callHiveServerWithFallback } from '../../_lib/devMode';

export const runtime = 'nodejs';

function safeText(value: unknown, limit = 200) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function isMissing(value: unknown) {
    const v = typeof value === 'string' ? value.trim() : '';
    if (!v) return true;
    if (v.toLowerCase() === 'undefined') return true;
    if (v.toLowerCase() === 'null') return true;
    return false;
}

async function requireSiteAccess({ request, siteId }: { request: Request; siteId: string }) {
    const { user, error: authError } = await getUserFromRequest(request);
    if (!user) return { ok: false as const, status: 401, error: authError || 'Unauthorized' };

    const admin = createSupabaseAdminClient();

    const { data: site, error: siteError } = await admin.from('sites').select('id, owner_id').eq('id', siteId).maybeSingle();
    if (siteError) return { ok: false as const, status: 500, error: siteError.message };
    if (!site) return { ok: false as const, status: 404, error: 'Site not found.' };

    if (site.owner_id === user.id) return { ok: true as const, admin, user, site, isAdmin: false };

    const { data: profile, error: profileError } = await admin.from('profiles').select('id, is_admin').eq('id', user.id).maybeSingle();
    if (profileError) return { ok: false as const, status: 500, error: profileError.message };
    if (!profile?.is_admin) return { ok: false as const, status: 403, error: 'Not allowed.' };

    return { ok: true as const, admin, user, site, isAdmin: true };
}

function getHiveServerConfig() {
    const baseUrl = safeText(process.env.HIVESERVER_URL, 500).replace(/\/$/, '');
    const token = safeText(process.env.HIVESERVER_TOKEN, 500);
    return { baseUrl: isMissing(baseUrl) ? '' : baseUrl, token: isMissing(token) ? '' : token };
}

export async function POST(request: Request) {
    const payload = await request.json().catch(() => ({}));
    const siteId = safeText(payload?.siteId || payload?.site_id, 80);
    const message = safeText(payload?.message, 240);

    if (!siteId) return NextResponse.json({ error: 'siteId is required' }, { status: 400 });

    const guard = await requireSiteAccess({ request, siteId });
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const cfg = getHiveServerConfig();
    if (!cfg.baseUrl || !cfg.token) {
        return NextResponse.json(
            { error: 'Dev server not configured.', detail: 'Set `HIVESERVER_URL` and `HIVESERVER_TOKEN` on the Next.js server.' },
            { status: 501 }
        );
    }

    const res = await callHiveServerWithFallback({
        primary: { path: '/dev/git/push', payload: { siteId, message } },
        fallback: { path: '/v1/dev-git/push', payload: { site_id: siteId, message } }
    });

    if (!res.ok) return NextResponse.json(res.body || { error: res.error, detail: res.detail || null }, { status: res.status });
    return NextResponse.json(res.data);
}
