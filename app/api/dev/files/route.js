import { NextResponse } from 'next/server';
import { callHiveServer, requireSiteAccess, safeText } from '../_lib/devMode';

export const runtime = 'nodejs';

export async function GET(request) {
    const url = new URL(request.url);
    const siteId = safeText(url.searchParams.get('siteId') || url.searchParams.get('site_id'), 80);
    if (!siteId) return NextResponse.json({ error: 'site_id is required' }, { status: 400 });

    const guard = await requireSiteAccess({ request, siteId });
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const res = await callHiveServer({ path: `/dev/files?siteId=${encodeURIComponent(siteId)}`, payload: null, method: 'GET' });

    if (!res.ok) {
        return NextResponse.json(res.body || { error: res.error, detail: res.detail || null }, { status: res.status });
    }

    const rawFiles = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.files) ? res.data.files : [];
    const files = (rawFiles || [])
        .map(f => {
            if (typeof f === 'string') return f;
            if (f && typeof f === 'object') {
                if (typeof f.path === 'string') return f.path;
                if (typeof f.file === 'string') return f.file;
                if (typeof f.name === 'string') return f.name;
            }
            return '';
        })
        .map(s => String(s).replace(/\\/g, '/').replace(/^\/+/, '').trim())
        .filter(Boolean);

    return NextResponse.json(files);
}
