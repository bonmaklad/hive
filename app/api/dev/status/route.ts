import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function safeText(value: unknown, limit = 200) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

export async function GET(request: Request) {
    const url = new URL(request.url);
    const siteId = safeText(url.searchParams.get('siteId') || url.searchParams.get('site_id'), 80);
    if (!siteId) return NextResponse.json({ error: 'siteId is required' }, { status: 400 });

    const upstream = new URL('/api/dev/sessions', request.url);
    upstream.searchParams.set('site_id', siteId);

    const res = await fetch(upstream.toString(), {
        method: 'GET',
        headers: {
            accept: 'application/json',
            authorization: request.headers.get('authorization') || ''
        },
        cache: 'no-store'
    });

    const body = await res.json().catch(() => null);
    return NextResponse.json(body || { error: 'Upstream error' }, { status: res.status });
}

