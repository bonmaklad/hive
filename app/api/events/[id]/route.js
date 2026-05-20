import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseAuth';
import {
    computeHours,
    EVENT_SELECT,
    loadRsvpSummaries,
    normalizeEventType,
    normalizeTopics,
    normalizeVisibility,
    overlaps,
    parseCapacity,
    resolveLocationFields,
    safeText,
    serializeEvent,
    toIsoDate,
    toLocalDate,
    toTime,
    uploadEventImage
} from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(message, status = 400) {
    return NextResponse.json({ error: message }, { status });
}

async function isAdmin({ admin, userId }) {
    const { data } = await admin.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
    return Boolean(data?.is_admin);
}

async function loadOrganizerProfiles(admin, events) {
    const ids = Array.from(new Set((events || []).map(event => event?.organizer_id).filter(Boolean)));
    if (!ids.length) return {};
    const { data } = await admin.from('profiles').select('id, name, email').in('id', ids);
    return Object.fromEntries((data || []).map(row => [row.id, row]));
}

async function maybeCreateLocation({ admin, eventRow, userId, location }) {
    if (location.location_id) return location.location_id;

    const { data, error } = await admin
        .from('hive_event_locations')
        .insert({
            tenant_id: eventRow.tenant_id,
            created_by: userId,
            name: location.location_name,
            address: location.location_address,
            google_maps_url: location.google_maps_url
        })
        .select('id')
        .single();

    if (error) throw new Error(error.message);
    return data?.id || null;
}

async function maybeUpdateRoomBooking({ admin, eventRow, form }) {
    if (!eventRow?.room_booking_id) return;

    const bookingDate = toLocalDate(form.get('booking_date'));
    const startTime = toTime(form.get('start_time'));
    const endTime = toTime(form.get('end_time'));
    if (!bookingDate || !startTime || !endTime) return;

    const { data: booking, error: bookingError } = await admin
        .from('room_bookings')
        .select('id, space_slug, status')
        .eq('id', eventRow.room_booking_id)
        .maybeSingle();

    if (bookingError) throw new Error(bookingError.message);
    if (!booking?.space_slug) return;

    const hours = computeHours(startTime, endTime);
    if (!hours) throw new Error('Room booking time is invalid.');

    const [{ data: memberBookings, error: memberError }, { data: publicBookings, error: publicError }] = await Promise.all([
        admin
            .from('room_bookings')
            .select('id, start_time, end_time, status')
            .eq('space_slug', booking.space_slug)
            .eq('booking_date', bookingDate)
            .in('status', ['requested', 'approved']),
        admin
            .from('public_room_bookings')
            .select('start_time, end_time, status')
            .eq('space_slug', booking.space_slug)
            .eq('booking_date', bookingDate)
            .in('status', ['pending_payment', 'confirmed'])
    ]);

    if (memberError) throw new Error(memberError.message);
    if (publicError && publicError.code !== '42P01') throw new Error(publicError.message);

    for (const existing of memberBookings || []) {
        if (existing.id !== booking.id && overlaps({ aStart: startTime, aEnd: endTime, bStart: existing.start_time, bEnd: existing.end_time })) {
            throw new Error('That room is already booked at this time.');
        }
    }

    for (const existing of publicBookings || []) {
        if (overlaps({ aStart: startTime, aEnd: endTime, bStart: existing.start_time, bEnd: existing.end_time })) {
            throw new Error('That room is already booked at this time.');
        }
    }

    const { error: updateError } = await admin
        .from('room_bookings')
        .update({
            booking_date: bookingDate,
            start_time: startTime,
            end_time: endTime,
            hours
        })
        .eq('id', booking.id);

    if (updateError) throw new Error(updateError.message);
}

export async function PATCH(request, { params }) {
    try {
        const { user, error } = await getUserFromRequest(request);
        if (!user) return jsonError(error || 'Missing Authorization bearer token.', 401);

        const resolvedParams = await params;
        const eventId = safeText(resolvedParams?.id, 80);
        if (!eventId) return jsonError('Missing event id.');

        const admin = createSupabaseAdminClient();
        const { data: existing, error: loadError } = await admin
            .from('hive_events')
            .select(EVENT_SELECT)
            .eq('id', eventId)
            .maybeSingle();

        if (loadError) return jsonError(loadError.message, 500);
        if (!existing) return jsonError('Event not found.', 404);

        const viewerIsAdmin = await isAdmin({ admin, userId: user.id });
        if (existing.organizer_id !== user.id && !viewerIsAdmin) {
            return jsonError('You can only edit your own events.', 403);
        }

        const form = await request.formData();
        const title = safeText(form.get('title'), 160);
        const description = safeText(form.get('description'), 3000);
        const startsAt = toIsoDate(form.get('starts_at'));
        const endsAt = toIsoDate(form.get('ends_at'));
        const eventType = normalizeEventType(form.get('event_type'));
        const visibility = normalizeVisibility(form.get('visibility'));
        const topics = normalizeTopics(form.getAll('topics'));
        let capacity = null;
        try {
            capacity = parseCapacity(form.get('capacity'));
        } catch (err) {
            return jsonError(err?.message || 'Capacity is invalid.');
        }
        const locationMode = safeText(form.get('location_mode'), 20) === 'custom' ? 'custom' : 'hive';

        if (!title) return jsonError('Title is required.');
        if (!description) return jsonError('Description is required.');
        if (!startsAt || !endsAt) return jsonError('Start and end time are required.');
        if (new Date(endsAt) <= new Date(startsAt)) return jsonError('End time must be after start time.');

        const location = resolveLocationFields({
            mode: locationMode,
            name: form.get('location_name'),
            address: form.get('location_address')
        });
        const locationId = await maybeCreateLocation({ admin, eventRow: existing, userId: user.id, location });
        const imageFields = await uploadEventImage({ admin, tenantId: existing.tenant_id, file: form.get('image') });

        await maybeUpdateRoomBooking({ admin, eventRow: existing, form });

        const { data, error: updateError } = await admin
            .from('hive_events')
            .update({
                title,
                description,
                starts_at: startsAt,
                ends_at: endsAt,
                event_type: eventType,
                topics,
                capacity,
                visibility,
                location_id: locationId,
                location_name: location.location_name,
                location_address: location.location_address,
                google_maps_url: location.google_maps_url,
                ...imageFields
            })
            .eq('id', eventId)
            .select(EVENT_SELECT)
            .single();

        if (updateError) return jsonError(updateError.message, 500);

        const profilesById = await loadOrganizerProfiles(admin, [data]);
        const rsvpSummaries = await loadRsvpSummaries(admin, [data]);
        return NextResponse.json({ ok: true, event: serializeEvent(data, { profilesById, rsvpSummary: rsvpSummaries[data.id], viewerId: user.id, isAdmin: viewerIsAdmin }) });
    } catch (error) {
        return jsonError(error?.message || 'Could not update event.', 500);
    }
}
