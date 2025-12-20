import { NextResponse } from 'next/server';
import { isMissingTableError, requireSiteAccess, runDevSessionAction, safeText } from '../_lib/devMode';

export const runtime = 'nodejs';

export async function POST(request) {
    const payload = await request.json().catch(() => ({}));
    const siteId = safeText(payload?.siteId || payload?.site_id, 80);
    if (!siteId) return NextResponse.json({ error: 'siteId is required' }, { status: 400 });

    const guard = await requireSiteAccess({ request, siteId });
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    try {
        const res = await runDevSessionAction({ guard, siteId, action: 'stop', branch: 'main' });
        if (!res.ok) return NextResponse.json({ error: res.error, detail: res.detail || null, site: res.site, session: res.session }, { status: res.status });
        return NextResponse.json({ site: res.site, session: res.session });
    } catch (e) {
        if (isMissingTableError(e)) {
            const session = {
                status: 'stopped',
                preview_url: null,
                editor_url: null,
                workspace_path: null,
                last_error: null,
                updated_at: new Date().toISOString(),
                branch: 'main'
            };
            return NextResponse.json({ site: guard.site, session });
        }
        return NextResponse.json({ error: e?.message || 'Could not stop Dev Mode.' }, { status: 500 });
    }
}

