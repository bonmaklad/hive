import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../../_lib/supabaseAuth';

export const runtime = 'nodejs';

function safeText(value, limit = 64) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

export async function GET(request) {
    const url = new URL(request.url);
    const spaceSlug = safeText(url.searchParams.get('space_slug'), 64);
    const date = safeText(url.searchParams.get('date'), 20);

    if (!spaceSlug) return NextResponse.json({ error: 'space_slug required.' }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD.' }, { status: 400 });

    const admin = createSupabaseAdminClient();

    const [{ data: memberBookings, error: memberError }, publicResult] = await Promise.all([
        admin
            .from('room_bookings')
            .select('start_time, end_time, status')
            .eq('space_slug', spaceSlug)
            .eq('booking_date', date)
            .in('status', ['requested', 'approved']),
        admin
            .from('public_room_bookings')
            .select('start_time, end_time, status')
            .eq('space_slug', spaceSlug)
            .eq('booking_date', date)
            .in('status', ['pending_payment', 'confirmed'])
    ]);

    if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });
    const publicError = publicResult?.error || null;
    const publicBookings = publicError?.code === '42P01' ? [] : (publicResult?.data || []);
    if (publicError && publicError.code !== '42P01') return NextResponse.json({ error: publicError.message }, { status: 500 });

    const bookings = [
        ...(memberBookings || []).map(b => ({ start_time: b.start_time, end_time: b.end_time, status: b.status, source: 'member' })),
        ...(publicBookings || []).map(b => ({ start_time: b.start_time, end_time: b.end_time, status: b.status, source: 'public' }))
    ];

    return NextResponse.json({ ok: true, space_slug: spaceSlug, date, bookings });
}
