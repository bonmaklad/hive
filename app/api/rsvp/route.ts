import { NextRequest, NextResponse } from 'next/server';

const UPSTREAM = process.env.RSVP_UPSTREAM_URL || process.env.NEXT_PUBLIC_RSVP_ENDPOINT;

export async function GET(req: NextRequest) {
    if (!UPSTREAM) {
        return NextResponse.json({ error: 'RSVP upstream not configured' }, { status: 500 });
    }

    const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase() || '';
    if (!email) {
        return NextResponse.json({ error: 'missing email' }, { status: 400 });
    }

    const url = `${UPSTREAM}?email=${encodeURIComponent(email)}`;
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store'
        });

        const text = await res.text();
        let data: any = null;
        try {
            data = JSON.parse(text);
        } catch {
            // Upstream might not return JSON on error; pass raw text in details below
        }

        if (data?.notFound || res.status === 404) {
            return NextResponse.json({ error: 'not found' }, { status: 404 });
        }

        if (!res.ok) {
            return NextResponse.json(
                { error: 'upstream error', details: data ?? text },
                { status: 502 }
            );
        }

        return NextResponse.json(data ?? {}, { status: 200 });
    } catch (e: any) {
        return NextResponse.json(
            { error: 'fetch failed', details: e?.message || 'network error' },
            { status: 502 }
        );
    }
}

export async function POST(req: NextRequest) {
    if (!UPSTREAM) {
        return NextResponse.json({ error: 'RSVP upstream not configured' }, { status: 500 });
    }

    let payload: any = {};
    try {
        payload = await req.json();
    } catch {
        // ignore, will send empty
    }

    try {
        const res = await fetch(UPSTREAM, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(payload)
        });

        const text = await res.text();
        let data: any = null;
        try {
            data = JSON.parse(text);
        } catch {
            // non-JSON response
        }

        if (data?.notFound || res.status === 404) {
            return NextResponse.json({ error: 'not found' }, { status: 404 });
        }

        if (!res.ok) {
            return NextResponse.json(
                { error: 'upstream error', details: data ?? text },
                { status: 502 }
            );
        }

        return NextResponse.json(data ?? { success: true }, { status: 200 });
    } catch (e: any) {
        return NextResponse.json(
            { error: 'fetch failed', details: e?.message || 'network error' },
            { status: 502 }
        );
    }
}
