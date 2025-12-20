import { NextResponse } from 'next/server';
import { callHiveServerWithFallback, requireSiteAccess, safeText } from '../_lib/devMode';

export const runtime = 'nodejs';

export async function GET(request) {
    const url = new URL(request.url);
    const siteId = safeText(url.searchParams.get('siteId') || url.searchParams.get('site_id'), 80);
    const filePath = safeText(url.searchParams.get('path'), 2000);
    if (!siteId) return NextResponse.json({ error: 'site_id is required' }, { status: 400 });
    if (!filePath) return NextResponse.json({ error: 'path is required' }, { status: 400 });

    const guard = await requireSiteAccess({ request, siteId });
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const res = await callHiveServerWithFallback({
        primary: { path: `/dev/file?siteId=${encodeURIComponent(siteId)}&path=${encodeURIComponent(filePath)}`, payload: null, method: 'GET' },
        fallback: { path: '/v1/dev-files/read', payload: { site_id: siteId, path: filePath } }
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

    const res = await callHiveServerWithFallback({
        primary: { path: '/dev/file', payload: { siteId, path: filePath, content, hash } },
        fallback: { path: '/v1/dev-files/write', payload: { site_id: siteId, path: filePath, content, hash } }
    });

    if (!res.ok) {
        return NextResponse.json(res.body || { error: res.error, detail: res.detail || null }, { status: res.status });
    }

    return NextResponse.json({ ok: true, hash: res.data?.hash || null });
}
