import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseAuth';
import { eventDescriptionHtml, validateEventDescription } from '@/lib/eventDescription';
import {
    ACTIVE_MEMBER_ROOM_STATUSES,
    canSelectEventRoom,
    computeHours,
    EVENT_SELECT,
    isEventAdmin,
    loadEventRooms,
    loadRsvpSummaries,
    normalizeEventType,
    normalizeTopics,
    normalizeVisibility,
    parseCapacity,
    resolveLocationFields,
    safeText,
    serializeEvent,
    toIsoDate,
    uploadEventImage
} from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(message, status = 400) {
    return NextResponse.json({ error: message }, { status });
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

const roomTimeFormat = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
});

function roomTime(isoDate) {
    const parts = Object.fromEntries(roomTimeFormat.formatToParts(new Date(isoDate)).map(part => [part.type, part.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

async function prepareRoomChange({ admin, existing, selectedSlug, startsAt, endsAt, isAdmin }) {
    const scheduleChanged = startsAt !== toIsoDate(existing.starts_at) || endsAt !== toIsoDate(existing.ends_at);
    if (!selectedSlug && (!existing.room_booking_id || !scheduleChanged)) return {};

    let currentSlug;
    if (existing.room_booking_id) {
        const { data, error } = await admin.from('room_bookings')
            .select('space_slug, status').eq('id', existing.room_booking_id).maybeSingle();
        if (error) throw new Error(error.message);
        if (ACTIVE_MEMBER_ROOM_STATUSES.includes(data?.status)) currentSlug = data.space_slug;
    }

    const targetSlug = selectedSlug || currentSlug;
    if (!targetSlug || (targetSlug === currentSlug && !scheduleChanged)) return {};

    let roomTitle;
    if (targetSlug !== currentSlug) {
        const { data: space, error } = await admin.from('spaces').select('slug, title, is_visible')
            .eq('slug', targetSlug).is('deleted_at', null).maybeSingle();
        if (error) throw new Error(error.message);
        if (!space) return { error: 'Room not found.', status: 404 };
        if (!canSelectEventRoom(space, isAdmin)) {
            return { error: 'This room is unavailable for event booking.', status: 403 };
        }
        roomTitle = space.title;
    }

    const start = roomTime(startsAt);
    const end = roomTime(endsAt);
    const hours = computeHours(start.time, end.time);
    if (start.date !== end.date || !hours) {
        return { error: 'Choose start and end times on the same HIVE booking day.', status: 400 };
    }

    return {
        slot: { space_slug: targetSlug, booking_date: start.date, start_time: start.time, end_time: end.time, hours },
        roomTitle
    };
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

        const viewerIsAdmin = await isEventAdmin(admin, user.id);
        if (existing.organizer_id !== user.id && !viewerIsAdmin) {
            return jsonError('You can only edit your own events.', 403);
        }

        const form = await request.formData();
        const title = safeText(form.get('title'), 160);
        const rawDescription = form.get('description');
        const description = eventDescriptionHtml(rawDescription);
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
        const descriptionError = validateEventDescription(rawDescription);
        if (descriptionError) return jsonError(descriptionError);
        if (!startsAt || !endsAt) return jsonError('Start and end time are required.');
        if (new Date(endsAt) <= new Date(startsAt)) return jsonError('End time must be after start time.');
        const unlinkRoomBooking = form.get('unlink_room_booking') === 'true';
        const selectedSlug = safeText(form.get('space_slug'), 80);
        const roomChange = unlinkRoomBooking ? {} : await prepareRoomChange({
            admin, existing, selectedSlug, startsAt, endsAt, isAdmin: viewerIsAdmin
        });
        if (roomChange.error) return jsonError(roomChange.error, roomChange.status);

        const location = resolveLocationFields({
            mode: locationMode,
            name: form.get('location_name'),
            address: form.get('location_address')
        });
        const locationId = await maybeCreateLocation({ admin, eventRow: existing, userId: user.id, location });
        const imageFields = await uploadEventImage({ admin, tenantId: existing.tenant_id, file: form.get('image') });

        const eventFields = {
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
            ...(unlinkRoomBooking ? { room_booking_id: null } : {}),
            ...imageFields
        };

        const result = roomChange.slot
            ? await admin.rpc('update_hive_event_room', {
                p_event_id: eventId,
                p_expected_updated_at: existing.updated_at,
                p_event: eventFields,
                p_slot: roomChange.slot,
                p_new_booking_owner: selectedSlug ? existing.organizer_id || user.id : null,
                p_editor_is_admin: viewerIsAdmin
            }).single()
            : await admin.from('hive_events').update(eventFields)
                .eq('id', eventId).eq('updated_at', existing.updated_at).select(EVENT_SELECT).maybeSingle();
        const { data, error: updateError } = result;
        if (updateError?.code === '23P01') {
            return jsonError(`${roomChange.roomTitle || 'The selected room'} is already booked at this time. Choose another room or time.`, 409);
        }
        if (updateError?.code === '40001') return jsonError(updateError.message, 409);
        if (updateError?.code === '42501') return jsonError(updateError.message, 403);
        if (updateError) return jsonError(updateError.message, 500);
        if (!data) return jsonError('The event changed. Refresh and try again.', 409);

        const viewer = { viewerId: user.id, isAdmin: viewerIsAdmin };
        const [profilesById, rsvpSummaries, rooms] = await Promise.all([
            loadOrganizerProfiles(admin, [data]),
            loadRsvpSummaries(admin, [data]),
            loadEventRooms(admin, [data], viewer)
        ]);
        return NextResponse.json({ ok: true, event: serializeEvent(data, {
            ...viewer,
            profilesById,
            rsvpSummary: rsvpSummaries[data.id],
            room: rooms[data.room_booking_id]
        }) });
    } catch (error) {
        return jsonError(error?.message || 'Could not update event.', 500);
    }
}
