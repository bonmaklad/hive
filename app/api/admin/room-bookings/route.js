import { NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/adminGuard';

export const runtime = 'nodejs';

function parseDate(value) {
    const v = typeof value === 'string' ? value : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    return v;
}

function parseTime(value) {
    const v = typeof value === 'string' ? value : '';
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(v)) return null;
    return v.length === 5 ? `${v}:00` : v;
}

function timeToMinutes(t) {
    const [hh, mm] = String(t).split(':');
    return Number(hh) * 60 + Number(mm);
}

export async function GET(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const url = new URL(request.url);
    const from = parseDate(url.searchParams.get('from')) || null;
    const to = parseDate(url.searchParams.get('to')) || null;
    const spaceSlug = url.searchParams.get('space_slug') || null;

    let q = guard.admin
        .from('room_bookings')
        .select('id, owner_id, space_slug, booking_date, start_time, end_time, hours, tokens_used, price_cents, status, created_at')
        .order('booking_date', { ascending: false })
        .order('start_time', { ascending: false })
        .limit(300);

    if (from) q = q.gte('booking_date', from);
    if (to) q = q.lte('booking_date', to);
    if (spaceSlug) q = q.eq('space_slug', spaceSlug);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const ownerIds = Array.from(new Set((data || []).map(b => b.owner_id).filter(Boolean)));
    const { data: owners } = await guard.admin.from('profiles').select('id, name, email').in('id', ownerIds);
    const ownersById = Object.fromEntries((owners || []).map(p => [p.id, p]));

    return NextResponse.json({
        bookings: (data || []).map(b => ({
            ...b,
            owner: ownersById[b.owner_id] || null
        }))
    });
}

export async function POST(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const payload = await request.json().catch(() => ({}));
    const spaceSlug = typeof payload?.space_slug === 'string' ? payload.space_slug : null;
    const date = parseDate(payload?.booking_date);
    const startTime = parseTime(payload?.start_time);
    const endTime = parseTime(payload?.end_time);
    const status = typeof payload?.status === 'string' ? payload.status : 'approved';

    const ownerId = typeof payload?.owner_id === 'string' ? payload.owner_id : null;
    const ownerEmail = typeof payload?.owner_email === 'string' ? payload.owner_email.trim().toLowerCase() : null;

    if (!spaceSlug || !date || !startTime || !endTime) {
        return NextResponse.json({ error: 'Missing space_slug, booking_date, start_time, end_time' }, { status: 400 });
    }

    let resolvedOwnerId = ownerId;
    if (!resolvedOwnerId && ownerEmail) {
        const { data: profile, error: profileError } = await guard.admin
            .from('profiles')
            .select('id')
            .eq('email', ownerEmail)
            .maybeSingle();
        if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
        if (!profile?.id) return NextResponse.json({ error: 'No user found for that email.' }, { status: 404 });
        resolvedOwnerId = profile.id;
    }

    if (!resolvedOwnerId) return NextResponse.json({ error: 'Missing owner_id or owner_email' }, { status: 400 });

    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    if (!(endMin > startMin)) return NextResponse.json({ error: 'end_time must be after start_time' }, { status: 400 });

    const hours = Math.ceil((endMin - startMin) / 60);

    const { data: conflicts, error: conflictError } = await guard.admin
        .from('room_bookings')
        .select('id, start_time, end_time, status')
        .eq('space_slug', spaceSlug)
        .eq('booking_date', date)
        .in('status', ['requested', 'approved']);

    if (conflictError) return NextResponse.json({ error: conflictError.message }, { status: 500 });

    const hasOverlap = (conflicts || []).some(b => {
        const s = timeToMinutes(b.start_time);
        const e = timeToMinutes(b.end_time);
        return startMin < e && endMin > s;
    });

    if (hasOverlap) {
        return NextResponse.json({ error: 'Booking conflicts with an existing booking.' }, { status: 409 });
    }

    const { error: insertError, data: inserted } = await guard.admin
        .from('room_bookings')
        .insert({
            owner_id: resolvedOwnerId,
            space_slug: spaceSlug,
            booking_date: date,
            start_time: startTime,
            end_time: endTime,
            hours,
            tokens_used: 0,
            price_cents: 0,
            status
        })
        .select('*')
        .single();

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    return NextResponse.json({ booking: inserted });
}

