import { NextResponse } from 'next/server';
import { isMissingTableError, requireSiteAccess, runDevSessionAction, safeText } from '../_lib/devMode';

export const runtime = 'nodejs';

export async function POST(request) {
    const payload = await request.json().catch(() => ({}));
    const siteId = safeText(payload?.siteId || payload?.site_id, 80);
    const branch = safeText(payload?.branch || 'main', 120);
    if (!siteId) return NextResponse.json({ error: 'siteId is required' }, { status: 400 });

    const guard = await requireSiteAccess({ request, siteId });
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    try {
        const res = await runDevSessionAction({ guard, siteId, action: 'start', branch });
        if (!res.ok) return NextResponse.json({ error: res.error, detail: res.detail || null, site: res.site, session: res.session }, { status: res.status });
        return NextResponse.json({ site: res.site, session: res.session });
    } catch (e) {
        if (isMissingTableError(e)) {
            const preview = `/__dev/${siteId}`;
            const session = {
                status: 'running',
                preview_url: preview,
                editor_url: null,
                workspace_path: null,
                last_error: null,
                updated_at: new Date().toISOString(),
                branch
            };
            return NextResponse.json({ site: guard.site, session });
        }
        return NextResponse.json({ error: e?.message || 'Could not start Dev Mode.' }, { status: 500 });
    }
}

