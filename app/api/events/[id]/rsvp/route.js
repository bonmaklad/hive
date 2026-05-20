import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../../_lib/supabaseAuth';
import { buildAvailability, safeText } from '../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(message, status = 400) {
    return NextResponse.json({ error: message }, { status });
}

function cleanEmail(value) {
    const email = safeText(value, 180).toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function cleanGuests(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(10, Math.floor(n)));
}

async function getGoingSummary(admin, eventId, excludeRsvpId = null) {
    let query = admin
        .from('hive_event_rsvps')
        .select('id, guests_count, status')
        .eq('event_id', eventId)
        .eq('status', 'going');

    if (excludeRsvpId) query = query.neq('id', excludeRsvpId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return {
        rsvps: (data || []).length,
        guests: (data || []).reduce((total, row) => total + (Number(row?.guests_count) || 0), 0)
    };
}

export async function POST(request, { params }) {
    try {
        const resolvedParams = await params;
        const eventId = safeText(resolvedParams?.id, 80);
        if (!eventId) return jsonError('Missing event id.');

        const payload = await request.json().catch(() => ({}));
        const admin = createSupabaseAdminClient();
        const { user } = await getUserFromRequest(request);

        const { data: event, error: eventError } = await admin
            .from('hive_events')
            .select('id, visibility, status, tenant_id, capacity')
            .eq('id', eventId)
            .maybeSingle();

        if (eventError) return jsonError(eventError.message, 500);
        if (!event || event.status !== 'published') return jsonError('Event not found.', 404);

        if (event.visibility === 'members') {
            if (!user) return jsonError('Sign in to RSVP.', 401);
            const { data: link, error: linkError } = await admin
                .from('tenant_users')
                .select('tenant_id')
                .eq('tenant_id', event.tenant_id)
                .eq('user_id', user.id)
                .maybeSingle();
            if (linkError) return jsonError(linkError.message, 500);
            if (!link) return jsonError('Members-only event.', 403);
        }

        let profile = null;
        if (user) {
            const { data } = await admin.from('profiles').select('id, name, email').eq('id', user.id).maybeSingle();
            profile = data || null;
        }

        const email = cleanEmail(payload?.email || profile?.email || user?.email);
        const name = safeText(payload?.name || profile?.name || email.split('@')[0], 120);
        const guests = cleanGuests(payload?.guests_count);
        const note = safeText(payload?.note, 500);

        if (!email) return jsonError('Email is required.');
        if (!name) return jsonError('Name is required.');

        const { data: existing, error: existingError } = await admin
            .from('hive_event_rsvps')
            .select('id')
            .eq('event_id', eventId)
            .ilike('email', email)
            .maybeSingle();

        if (existingError) return jsonError(existingError.message, 500);

        const otherGoing = await getGoingSummary(admin, eventId, existing?.id || null);
        const capacity = Number.isInteger(Number(event.capacity)) && Number(event.capacity) > 0 ? Number(event.capacity) : null;
        if (capacity && otherGoing.guests + guests > capacity) {
            const remaining = Math.max(capacity - otherGoing.guests, 0);
            return jsonError(remaining ? `Only ${remaining} spot${remaining === 1 ? '' : 's'} left for this event.` : 'This event is sold out.', 409);
        }

        const values = {
            event_id: eventId,
            user_id: user?.id || null,
            name,
            email,
            guests_count: guests,
            note: note || null,
            status: 'going'
        };

        const query = existing?.id
            ? admin.from('hive_event_rsvps').update(values).eq('id', existing.id)
            : admin.from('hive_event_rsvps').insert(values);

        const { data, error } = await query
            .select('id, name, email, guests_count, status')
            .single();

        if (error) return jsonError(error.message, 500);
        const availability = buildAvailability({
            capacity,
            goingRsvps: otherGoing.rsvps + 1,
            goingGuests: otherGoing.guests + guests
        });
        return NextResponse.json({ ok: true, rsvp: data, availability });
    } catch (error) {
        return jsonError(error?.message || 'Could not RSVP.', 500);
    }
}
