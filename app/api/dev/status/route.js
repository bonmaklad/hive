import { NextResponse } from 'next/server';
import { getOrCreateSession, isMissingTableError, requireSiteAccess, safeText } from '../_lib/devMode';

export const runtime = 'nodejs';

export async function GET(request) {
    const url = new URL(request.url);
    const siteId = safeText(url.searchParams.get('siteId') || url.searchParams.get('site_id'), 80);
    if (!siteId) return NextResponse.json({ error: 'siteId is required' }, { status: 400 });

    const guard = await requireSiteAccess({ request, siteId });
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    try {
        const session = await getOrCreateSession({ admin: guard.admin, siteId, userId: guard.user.id });
        return NextResponse.json({ site: guard.site, session });
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
                branch: 'main'
            };
            return NextResponse.json({ site: guard.site, session });
        }
        return NextResponse.json({ error: e?.message || 'Could not load Dev Mode status.' }, { status: 500 });
    }
}

