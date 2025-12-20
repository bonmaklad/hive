import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function safeText(value: unknown, limit = 200) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

export async function POST(request: Request) {
    const payload = await request.json().catch(() => ({}));
    const siteId = safeText(payload?.siteId || payload?.site_id, 80);
    if (!siteId) return NextResponse.json({ error: 'siteId is required' }, { status: 400 });

    const upstream = new URL('/api/dev/sessions', request.url);
    const res = await fetch(upstream.toString(), {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            authorization: request.headers.get('authorization') || ''
        },
        body: JSON.stringify({ site_id: siteId, action: 'stop', branch: 'main' }),
        cache: 'no-store'
    });

    const body = await res.json().catch(() => null);
    return NextResponse.json(body || { error: 'Upstream error' }, { status: res.status });
}

