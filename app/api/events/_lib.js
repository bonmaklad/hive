import crypto from 'crypto';
import { HIVE_LOCATION, EVENT_TOPICS, mapsSearchUrl } from '@/lib/eventOptions';

export const EVENT_IMAGE_BUCKET = process.env.SUPABASE_EVENT_IMAGES_BUCKET || 'event-images';
export const HIVE_LOCATION_ID = '00000000-0000-0000-0000-000000000120';
export const EVENT_SELECT = 'id, tenant_id, organizer_id, title, description, starts_at, ends_at, timezone, event_type, topics, visibility, status, image_url, location_name, location_address, google_maps_url, room_booking_id, capacity, created_at';

export function safeText(value, limit = 500) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

export function sanitizeFilename(name) {
    const base = safeText(name, 140);
    if (!base) return 'event-image';
    return base
        .replace(/\\/g, '/')
        .split('/')
        .pop()
        .replace(/[^\w.\-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^\-+|\-+$/g, '') || 'event-image';
}

export function normalizeEventType(value) {
    const v = safeText(value, 30).toLowerCase();
    return ['discover', 'incubate', 'accelerate', 'scale', 'community'].includes(v) ? v : 'discover';
}

export function normalizeVisibility(value) {
    const v = safeText(value, 30).toLowerCase();
    return v === 'members' ? 'members' : 'public';
}

export function normalizeTopics(values) {
    const raw = Array.isArray(values) ? values : [values];
    const allowed = new Set(EVENT_TOPICS);
    return Array.from(new Set(raw.map(value => safeText(value, 80)).filter(value => allowed.has(value))));
}

export function parseCapacity(value) {
    const clean = safeText(value, 20);
    if (!clean) return null;
    const capacity = Number(clean);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) {
        throw new Error('Capacity must be a whole number between 1 and 10000.');
    }
    return capacity;
}

export function toIsoDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
}

export function toLocalDate(value) {
    const v = safeText(value, 20);
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
}

export function toTime(value) {
    const v = safeText(value, 10);
    return /^\d{2}:\d{2}$/.test(v) ? v : '';
}

function timeToMinutes(value) {
    const [hh, mm] = String(value || '0:0').split(':').map(v => Number(v));
    return (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
}

export function computeHours(startTime, endTime) {
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    if (!(end > start)) return 0;
    return Math.round(((end - start) / 60) * 100) / 100;
}

export function overlaps({ aStart, aEnd, bStart, bEnd }) {
    const a0 = timeToMinutes(aStart);
    const a1 = timeToMinutes(aEnd);
    const b0 = timeToMinutes(bStart);
    const b1 = timeToMinutes(bEnd);
    return a0 < b1 && b0 < a1;
}

export async function ensureEventImageBucket(admin) {
    const { data, error } = await admin.storage.getBucket(EVENT_IMAGE_BUCKET);
    if (error && !String(error?.message || '').toLowerCase().includes('not found')) {
        return { ok: false, error: error.message };
    }
    if (data) {
        if (data.public === false && typeof admin.storage.updateBucket === 'function') {
            const { error: updateError } = await admin.storage.updateBucket(EVENT_IMAGE_BUCKET, { public: true });
            if (updateError) return { ok: false, error: updateError.message };
        }
        return { ok: true };
    }

    const { error: createError } = await admin.storage.createBucket(EVENT_IMAGE_BUCKET, { public: true });
    if (createError && !String(createError?.message || '').includes('already exists')) {
        return { ok: false, error: createError.message };
    }
    return { ok: true };
}

export async function uploadEventImage({ admin, tenantId, file }) {
    if (!file || typeof file?.arrayBuffer !== 'function' || !file?.size) return {};

    const bucket = await ensureEventImageBucket(admin);
    if (!bucket.ok) throw new Error(bucket.error || 'Event image storage is not available.');

    const ab = await file.arrayBuffer();
    const path = `events/${tenantId || 'public'}/${crypto.randomUUID()}-${sanitizeFilename(file.name || 'image')}`;
    const { error } = await admin.storage
        .from(EVENT_IMAGE_BUCKET)
        .upload(path, ab, { contentType: file.type || 'application/octet-stream', upsert: true });
    if (error) throw new Error(error.message);

    const { data } = admin.storage.from(EVENT_IMAGE_BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error('Could not create event image URL.');

    return { image_url: data.publicUrl, image_bucket: EVENT_IMAGE_BUCKET, image_path: path };
}

export function resolveLocationFields({ mode, name, address }) {
    if (mode === 'custom') {
        const cleanName = safeText(name, 120) || 'Event location';
        const cleanAddress = safeText(address, 300);
        if (!cleanAddress) throw new Error('Add a location address.');
        return {
            location_name: cleanName,
            location_address: cleanAddress,
            google_maps_url: mapsSearchUrl(`${cleanName}, ${cleanAddress}`),
            location_id: null
        };
    }

    return {
        location_name: HIVE_LOCATION.name,
        location_address: HIVE_LOCATION.address,
        google_maps_url: mapsSearchUrl(HIVE_LOCATION.address),
        location_id: HIVE_LOCATION_ID
    };
}

export function buildAvailability({ capacity, goingRsvps = 0, goingGuests = 0 }) {
    const cleanCapacity = Number.isInteger(Number(capacity)) && Number(capacity) > 0 ? Number(capacity) : null;
    const cleanGuests = Number.isFinite(Number(goingGuests)) ? Number(goingGuests) : 0;
    const cleanRsvps = Number.isFinite(Number(goingRsvps)) ? Number(goingRsvps) : 0;
    return {
        capacity: cleanCapacity,
        rsvp_count: cleanRsvps,
        rsvp_guests_count: cleanGuests,
        spots_remaining: cleanCapacity ? Math.max(cleanCapacity - cleanGuests, 0) : null,
        is_sold_out: Boolean(cleanCapacity && cleanGuests >= cleanCapacity)
    };
}

export async function loadRsvpSummaries(admin, events) {
    const ids = Array.from(new Set((events || []).map(event => event?.id).filter(Boolean)));
    const empty = Object.fromEntries(ids.map(id => [id, { going_rsvps: 0, going_guests: 0 }]));
    if (!ids.length) return empty;

    const { data, error } = await admin
        .from('hive_event_rsvps')
        .select('event_id, guests_count, status')
        .in('event_id', ids);

    if (error) throw new Error(error.message);

    for (const row of data || []) {
        if (row?.status !== 'going' || !row?.event_id || !empty[row.event_id]) continue;
        empty[row.event_id].going_rsvps += 1;
        empty[row.event_id].going_guests += Number(row.guests_count) || 0;
    }

    return empty;
}

export function serializeEvent(row, extras = {}) {
    const organizer = extras.profilesById?.[row?.organizer_id] || null;
    const summary = extras.rsvpSummary || {};
    const availability = buildAvailability({
        capacity: row?.capacity,
        goingRsvps: summary.going_rsvps,
        goingGuests: summary.going_guests
    });
    return {
        id: row?.id,
        title: row?.title || '',
        description: row?.description || '',
        starts_at: row?.starts_at || null,
        ends_at: row?.ends_at || null,
        timezone: row?.timezone || 'Pacific/Auckland',
        event_type: row?.event_type || 'discover',
        topics: Array.isArray(row?.topics) ? row.topics : [],
        visibility: row?.visibility || 'public',
        status: row?.status || 'published',
        image_url: row?.image_url || '',
        location_name: row?.location_name || HIVE_LOCATION.name,
        location_address: row?.location_address || HIVE_LOCATION.address,
        google_maps_url: row?.google_maps_url || mapsSearchUrl(row?.location_address || HIVE_LOCATION.address),
        room_booking_id: row?.room_booking_id || null,
        ...availability,
        organizer: organizer
            ? {
                id: organizer.id,
                name: organizer.name || organizer.email || 'HIVE member',
                email: organizer.email || ''
            }
            : null,
        can_edit: extras.viewerId ? row?.organizer_id === extras.viewerId || Boolean(extras.isAdmin) : false
    };
}
