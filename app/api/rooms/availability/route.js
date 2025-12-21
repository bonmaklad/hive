import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseAuth';

export const runtime = 'nodejs';

function safeText(value, limit = 64) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

export async function GET(request) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const url = new URL(request.url);
    const spaceSlug = safeText(url.searchParams.get('space_slug'), 64);
    const date = safeText(url.searchParams.get('date'), 20);

    if (!spaceSlug) return NextResponse.json({ error: 'space_slug required.' }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD.' }, { status: 400 });

    const admin = createSupabaseAdminClient();

    const { data: bookings, error: bookingsError } = await admin
        .from('room_bookings')
        .select('start_time, end_time, status, owner_id')
        .eq('space_slug', spaceSlug)
        .eq('booking_date', date)
        .in('status', ['requested', 'approved']);

    if (bookingsError) return NextResponse.json({ error: bookingsError.message }, { status: 500 });

    return NextResponse.json({
        ok: true,
        space_slug: spaceSlug,
        date,
        bookings: (bookings || []).map(b => ({
            start_time: b.start_time,
            end_time: b.end_time,
            status: b.status,
            is_self: b.owner_id === user.id
        }))
    });
}

