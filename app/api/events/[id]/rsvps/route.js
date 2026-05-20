import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../../_lib/supabaseAuth';
import { buildAvailability, safeText } from '../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(message, status = 400) {
    return NextResponse.json({ error: message }, { status });
}

async function isAdmin({ admin, userId }) {
    const { data } = await admin.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
    return Boolean(data?.is_admin);
}

function summarizeRsvps({ capacity, rows }) {
    const going = (rows || []).filter(row => row?.status === 'going');
    return buildAvailability({
        capacity,
        goingRsvps: going.length,
        goingGuests: going.reduce((total, row) => total + (Number(row?.guests_count) || 0), 0)
    });
}

export async function GET(request, { params }) {
    try {
        const { user, error } = await getUserFromRequest(request);
        if (!user) return jsonError(error || 'Missing Authorization bearer token.', 401);

        const resolvedParams = await params;
        const eventId = safeText(resolvedParams?.id, 80);
        if (!eventId) return jsonError('Missing event id.');

        const admin = createSupabaseAdminClient();
        const { data: event, error: eventError } = await admin
            .from('hive_events')
            .select('id, title, organizer_id, capacity')
            .eq('id', eventId)
            .maybeSingle();

        if (eventError) return jsonError(eventError.message, 500);
        if (!event) return jsonError('Event not found.', 404);

        const viewerIsAdmin = await isAdmin({ admin, userId: user.id });
        if (event.organizer_id !== user.id && !viewerIsAdmin) {
            return jsonError('You can only view RSVPs for your own events.', 403);
        }

        const { data, error: rsvpError } = await admin
            .from('hive_event_rsvps')
            .select('id, name, email, guests_count, status, note, created_at, updated_at')
            .eq('event_id', eventId)
            .order('created_at', { ascending: true });

        if (rsvpError) return jsonError(rsvpError.message, 500);

        const rsvps = (data || []).map(row => ({
            id: row.id,
            name: row.name || '',
            email: row.email || '',
            guests_count: Number(row.guests_count) || 1,
            status: row.status || 'going',
            note: row.note || '',
            created_at: row.created_at || null,
            updated_at: row.updated_at || null
        }));

        return NextResponse.json({
            ok: true,
            event: {
                id: event.id,
                title: event.title || '',
                capacity: event.capacity || null
            },
            summary: summarizeRsvps({ capacity: event.capacity, rows: rsvps }),
            rsvps
        });
    } catch (error) {
        return jsonError(error?.message || 'Could not load RSVPs.', 500);
    }
}
