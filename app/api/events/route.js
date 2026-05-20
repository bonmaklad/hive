import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../_lib/supabaseAuth';
import { requireTenantContext } from '../rooms/_lib/tenantBilling';
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
} from './_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(message, status = 400) {
    return NextResponse.json({ error: message }, { status });
}

function getRange(url) {
    const now = new Date();
    const start = toIsoDate(url.searchParams.get('start')) || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const end = toIsoDate(url.searchParams.get('end')) || new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59).toISOString();
    return { start, end };
}

async function getViewer(request) {
    const { user } = await getUserFromRequest(request);
    if (!user) return { user: null, tenantIds: [], isAdmin: false };

    const admin = createSupabaseAdminClient();
    const [{ data: links }, { data: profile }] = await Promise.all([
        admin.from('tenant_users').select('tenant_id').eq('user_id', user.id),
        admin.from('profiles').select('id, is_admin').eq('id', user.id).maybeSingle()
    ]);

    return {
        user,
        tenantIds: (links || []).map(row => row?.tenant_id).filter(Boolean),
        isAdmin: Boolean(profile?.is_admin)
    };
}

async function loadOrganizerProfiles(admin, events) {
    const ids = Array.from(new Set((events || []).map(event => event?.organizer_id).filter(Boolean)));
    if (!ids.length) return {};
    const { data } = await admin.from('profiles').select('id, name, email').in('id', ids);
    return Object.fromEntries((data || []).map(row => [row.id, row]));
}

export async function GET(request) {
    const admin = createSupabaseAdminClient();
    const url = new URL(request.url);
    const audience = safeText(url.searchParams.get('audience'), 20) === 'member' ? 'member' : 'public';
    const { start, end } = getRange(url);
    const viewer = audience === 'member' ? await getViewer(request) : { user: null, tenantIds: [], isAdmin: false };

    let query = admin
        .from('hive_events')
        .select(EVENT_SELECT)
        .eq('status', 'published')
        .gte('starts_at', start)
        .lte('starts_at', end)
        .order('starts_at', { ascending: true });

    if (audience === 'public' || !viewer.user) {
        query = query.eq('visibility', 'public');
    }

    const { data, error } = await query;

    if (error) {
        if (error.code === '42P01' || String(error.message || '').toLowerCase().includes('hive_events')) {
            return NextResponse.json({ ok: true, events: [], needs_setup: true });
        }
        return jsonError(error.message, 500);
    }

    let rows = data || [];
    if (audience === 'member' && viewer.user && !viewer.isAdmin) {
        const tenantSet = new Set(viewer.tenantIds);
        rows = rows.filter(event => event.visibility === 'public' || tenantSet.has(event.tenant_id) || event.organizer_id === viewer.user.id);
    }

    const profilesById = await loadOrganizerProfiles(admin, rows);
    const rsvpSummaries = await loadRsvpSummaries(admin, rows);

    return NextResponse.json({
        ok: true,
        events: rows.map(row => serializeEvent(row, {
            profilesById,
            rsvpSummary: rsvpSummaries[row.id],
            viewerId: viewer.user?.id || null,
            isAdmin: viewer.isAdmin
        }))
    });
}

async function maybeCreateLocation({ admin, ctx, location }) {
    if (location.location_id) return location.location_id;

    const { data, error } = await admin
        .from('hive_event_locations')
        .insert({
            tenant_id: ctx.tenantId,
            created_by: ctx.user.id,
            name: location.location_name,
            address: location.location_address,
            google_maps_url: location.google_maps_url
        })
        .select('id')
        .single();

    if (error) throw new Error(error.message);
    return data?.id || null;
}

async function maybeCreateRoomBooking({ admin, ctx, form }) {
    const wantsRoom = safeText(form.get('book_room'), 10) === 'true';
    if (!wantsRoom) return null;

    const spaceSlug = safeText(form.get('space_slug'), 80);
    const bookingDate = toLocalDate(form.get('booking_date'));
    const startTime = toTime(form.get('start_time'));
    const endTime = toTime(form.get('end_time'));

    if (!spaceSlug) throw new Error('Choose a room.');
    if (!bookingDate) throw new Error('Room booking date is required.');
    if (!startTime || !endTime) throw new Error('Room booking time is required.');

    const hours = computeHours(startTime, endTime);
    if (!hours) throw new Error('Room booking time is invalid.');

    const [{ data: memberBookings, error: memberError }, { data: publicBookings, error: publicError }] = await Promise.all([
        admin
            .from('room_bookings')
            .select('start_time, end_time, status')
            .eq('space_slug', spaceSlug)
            .eq('booking_date', bookingDate)
            .in('status', ['requested', 'approved']),
        admin
            .from('public_room_bookings')
            .select('start_time, end_time, status')
            .eq('space_slug', spaceSlug)
            .eq('booking_date', bookingDate)
            .in('status', ['pending_payment', 'confirmed'])
    ]);

    if (memberError) throw new Error(memberError.message);
    if (publicError && publicError.code !== '42P01') throw new Error(publicError.message);

    for (const booking of [...(memberBookings || []), ...(publicBookings || [])]) {
        if (overlaps({ aStart: startTime, aEnd: endTime, bStart: booking.start_time, bEnd: booking.end_time })) {
            throw new Error('That room is already booked at this time.');
        }
    }

    const { data, error } = await admin
        .from('room_bookings')
        .insert({
            owner_id: ctx.user.id,
            space_slug: spaceSlug,
            booking_date: bookingDate,
            start_time: startTime,
            end_time: endTime,
            hours,
            tokens_used: 0,
            price_cents: 0,
            status: 'requested'
        })
        .select('id')
        .single();

    if (error) throw new Error(error.message);
    return data?.id || null;
}

export async function POST(request) {
    try {
        const ctx = await requireTenantContext(request);
        if (!ctx.ok) return jsonError(ctx.error, ctx.status);

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
        const locationId = await maybeCreateLocation({ admin: ctx.admin, ctx, location });
        const imageFields = await uploadEventImage({ admin: ctx.admin, tenantId: ctx.tenantId, file: form.get('image') });
        const roomBookingId = await maybeCreateRoomBooking({ admin: ctx.admin, ctx, form });

        const { data, error } = await ctx.admin
            .from('hive_events')
            .insert({
                tenant_id: ctx.tenantId,
                organizer_id: ctx.user.id,
                title,
                description,
                starts_at: startsAt,
                ends_at: endsAt,
                event_type: eventType,
                topics,
                capacity,
                visibility,
                status: 'published',
                location_id: locationId,
                location_name: location.location_name,
                location_address: location.location_address,
                google_maps_url: location.google_maps_url,
                room_booking_id: roomBookingId,
                ...imageFields
            })
            .select(EVENT_SELECT)
            .single();

        if (error) throw new Error(error.message);

        const profilesById = await loadOrganizerProfiles(ctx.admin, [data]);
        return NextResponse.json({ ok: true, event: serializeEvent(data, { profilesById, viewerId: ctx.user.id, rsvpSummary: { going_rsvps: 0, going_guests: 0 } }) });
    } catch (error) {
        return jsonError(error?.message || 'Could not create event.', 500);
    }
}
