import { NextResponse } from 'next/server';
import {
    getOrCreateSession,
    isMissingTableError,
    requireSiteAccess,
    runDevSessionAction,
    safeText
} from '../_lib/devMode';

export const runtime = 'nodejs';

function isMissing(value) {
    const v = typeof value === 'string' ? value.trim() : '';
    if (!v) return true;
    if (v.toLowerCase() === 'undefined') return true;
    if (v.toLowerCase() === 'null') return true;
    return false;
}

function getHiveServerConfig() {
    const baseUrl = safeText(process.env.HIVESERVER_URL, 500).replace(/\/$/, '');
    const token = safeText(process.env.HIVESERVER_TOKEN, 500);

    return {
        baseUrl: isMissing(baseUrl) ? '' : baseUrl,
        token: isMissing(token) ? '' : token
    };
}

function isServerConfigured() {
    const cfg = getHiveServerConfig();
    return Boolean(cfg.baseUrl && cfg.token);
}

export async function GET(request) {
    const url = new URL(request.url);
    const siteId = safeText(url.searchParams.get('site_id'), 60);
    if (!siteId) return NextResponse.json({ error: 'site_id is required' }, { status: 400 });

    const guard = await requireSiteAccess({ request, siteId });
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    try {
        const session = await getOrCreateSession({ admin: guard.admin, siteId, userId: guard.user.id });
        return NextResponse.json({ site: guard.site, session });
    } catch (e) {
        if (isMissingTableError(e)) {
            // Fallback: no DB table; treat Dev Mode as always-on static preview
            const preview = `/__dev/${siteId}`;
            const session = {
                status: 'running',
                preview_url: preview,
                editor_url: null,
                workspace_path: null,
                last_error: null,
                updated_at: new Date().toISOString(),
                branch: 'main'
            };
            return NextResponse.json({ site: guard.site, session });
        }
        return NextResponse.json({ error: e?.message || 'Could not load Dev Mode session.' }, { status: 500 });
    }
}

export async function POST(request) {
    const payload = await request.json().catch(() => ({}));
    const siteId = safeText(payload?.site_id, 60);
    const action = safeText(payload?.action, 30).toLowerCase();
    const branch = safeText(payload?.branch || 'main', 120);

    if (!siteId) return NextResponse.json({ error: 'site_id is required' }, { status: 400 });
    if (!['start', 'stop', 'restart'].includes(action)) {
        return NextResponse.json({ error: 'action must be start, stop, or restart' }, { status: 400 });
    }

    const guard = await requireSiteAccess({ request, siteId });
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    if (!branch) return NextResponse.json({ error: 'branch is required' }, { status: 400 });

    // If the external dev server is not configured, short-circuit with a synthetic session
    if (!isServerConfigured()) {
        const running = action !== 'stop';
        const preview = `/__dev/${siteId}`;
        const fallback = {
            status: running ? 'running' : 'stopped',
            preview_url: running ? preview : null,
            editor_url: null,
            workspace_path: null,
            last_error: null,
            updated_at: new Date().toISOString(),
            branch
        };
        return NextResponse.json({ site: guard.site, session: fallback });
    }

    try {
        const res = await runDevSessionAction({ guard, siteId, action, branch });
        if (!res.ok) {
            return NextResponse.json(
                { error: res.error, detail: res.detail || null, site: res.site, session: res.session },
                { status: res.status }
            );
        }
        return NextResponse.json({ site: res.site, session: res.session });
    } catch (e) {
        if (isMissingTableError(e)) {
            // Fallback behavior without DB: no-op start/stop, return synthetic session
            const preview = `/__dev/${siteId}`;
            const running = action !== 'stop';
            const fallback = {
                status: running ? 'running' : 'stopped',
                preview_url: running ? preview : null,
                editor_url: null,
                workspace_path: null,
                last_error: null,
                updated_at: new Date().toISOString(),
                branch
            };
            return NextResponse.json({ site: guard.site, session: fallback });
        }
        return NextResponse.json({ error: e?.message || 'Dev Mode action failed.' }, { status: 500 });
    }
}
