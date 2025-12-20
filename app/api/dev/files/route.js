import { NextResponse } from 'next/server';
import { callHiveServerWithFallback, requireSiteAccess, safeText } from '../_lib/devMode';

export const runtime = 'nodejs';

export async function GET(request) {
    const url = new URL(request.url);
    const siteId = safeText(url.searchParams.get('siteId') || url.searchParams.get('site_id'), 80);
    if (!siteId) return NextResponse.json({ error: 'site_id is required' }, { status: 400 });

    const guard = await requireSiteAccess({ request, siteId });
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const res = await callHiveServerWithFallback({
        primary: { path: `/dev/files?siteId=${encodeURIComponent(siteId)}`, payload: null, method: 'GET' },
        fallback: { path: '/v1/dev-files/list', payload: { site_id: siteId, dir: '', recursive: true } }
    });

    if (!res.ok) {
        return NextResponse.json(res.body || { error: res.error, detail: res.detail || null }, { status: res.status });
    }

    const files = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.files) ? res.data.files : [];
    return NextResponse.json(files);
}
