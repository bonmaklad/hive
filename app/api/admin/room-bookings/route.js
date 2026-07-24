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

    let memberQuery = guard.admin
        .from('room_bookings')
        .select('id, owner_id, space_slug, booking_date, start_time, end_time, hours, tokens_used, price_cents, status, created_at')
        .order('booking_date', { ascending: false })
        .order('start_time', { ascending: false })
        .limit(300);

    let publicQuery = guard.admin
        .from('public_room_bookings')
        .select('id, space_slug, booking_date, start_time, end_time, hours, price_cents, currency, status, customer_name, customer_email, customer_phone, created_at')
        .order('booking_date', { ascending: false })
        .order('start_time', { ascending: false })
        .limit(300);

    if (from) {
        memberQuery = memberQuery.gte('booking_date', from);
        publicQuery = publicQuery.gte('booking_date', from);
    }
    if (to) {
        memberQuery = memberQuery.lte('booking_date', to);
        publicQuery = publicQuery.lte('booking_date', to);
    }
    if (spaceSlug) {
        memberQuery = memberQuery.eq('space_slug', spaceSlug);
        publicQuery = publicQuery.eq('space_slug', spaceSlug);
    }

    const [memberResult, publicResult] = await Promise.all([memberQuery, publicQuery]);
    if (memberResult.error) return NextResponse.json({ error: memberResult.error.message }, { status: 500 });
    if (publicResult.error && publicResult.error.code !== '42P01') {
        return NextResponse.json({ error: publicResult.error.message }, { status: 500 });
    }

    const memberBookings = memberResult.data || [];
    const publicBookings = publicResult.error?.code === '42P01' ? [] : (publicResult.data || []);

    const ownerIds = Array.from(new Set(memberBookings.map(b => b.owner_id).filter(Boolean)));
    let owners = [];
    if (ownerIds.length) {
        const ownersResult = await guard.admin.from('profiles').select('id, name, email').in('id', ownerIds);
        if (ownersResult.error) return NextResponse.json({ error: ownersResult.error.message }, { status: 500 });
        owners = ownersResult.data || [];
    }
    const ownersById = Object.fromEntries((owners || []).map(p => [p.id, p]));

    const publicBookingIds = publicBookings.map(b => b.id);
    const paymentsByBookingId = {};
    if (publicBookingIds.length) {
        const { data: payments, error: paymentsError } = await guard.admin
            .from('public_room_booking_payments')
            .select('public_room_booking_id, status, amount_cents, currency, stripe_checkout_session_id, stripe_payment_intent_id, created_at')
            .in('public_room_booking_id', publicBookingIds)
            .order('created_at', { ascending: false });
        if (paymentsError && paymentsError.code !== '42P01') {
            return NextResponse.json({ error: paymentsError.message }, { status: 500 });
        }
        for (const payment of payments || []) {
            if (!paymentsByBookingId[payment.public_room_booking_id]) {
                paymentsByBookingId[payment.public_room_booking_id] = payment;
            }
        }
    }

    const bookings = [
        ...memberBookings.map(booking => ({
            ...booking,
            source: 'member',
            owner: ownersById[booking.owner_id] || null,
            customer: ownersById[booking.owner_id] || null,
            payment: null
        })),
        ...publicBookings.map(booking => ({
            ...booking,
            source: 'public',
            owner_id: null,
            owner: null,
            customer: {
                name: booking.customer_name,
                email: booking.customer_email,
                phone: booking.customer_phone
            },
            payment: paymentsByBookingId[booking.id] || null
        }))
    ]
        .sort((a, b) => {
            const dateOrder = String(b.booking_date).localeCompare(String(a.booking_date));
            if (dateOrder) return dateOrder;
            return String(b.start_time).localeCompare(String(a.start_time));
        })
        .slice(0, 300);

    return NextResponse.json({
        bookings
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

    const [memberConflictsResult, publicConflictsResult] = await Promise.all([
        guard.admin
            .from('room_bookings')
            .select('id, start_time, end_time, status')
            .eq('space_slug', spaceSlug)
            .eq('booking_date', date)
            .in('status', ['requested', 'approved']),
        guard.admin
            .from('public_room_bookings')
            .select('id, start_time, end_time, status')
            .eq('space_slug', spaceSlug)
            .eq('booking_date', date)
            .in('status', ['pending_payment', 'confirmed'])
    ]);

    if (memberConflictsResult.error) {
        return NextResponse.json({ error: memberConflictsResult.error.message }, { status: 500 });
    }
    if (publicConflictsResult.error && publicConflictsResult.error.code !== '42P01') {
        return NextResponse.json({ error: publicConflictsResult.error.message }, { status: 500 });
    }

    const conflicts = [
        ...(memberConflictsResult.data || []),
        ...(publicConflictsResult.error?.code === '42P01' ? [] : (publicConflictsResult.data || []))
    ];

    const hasOverlap = conflicts.some(b => {
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
