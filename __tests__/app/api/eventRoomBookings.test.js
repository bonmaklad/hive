import { GET } from '@/app/api/events/route';
import { PATCH } from '@/app/api/events/[id]/route';
import { GET as getRoomChoices } from '@/app/api/events/rooms/route';
import { createSupabaseAdminClient, getUserFromRequest } from '@/app/api/_lib/supabaseAuth';

jest.mock('@/app/api/_lib/supabaseAuth', () => ({ createSupabaseAdminClient: jest.fn(), getUserFromRequest: jest.fn() }));

const eventId = 'event-1';
const bookingId = 'room-booking-1';
let rows;
let writes;
let rpc;

beforeEach(() => {
    rows = {
        hive_events: [{
            id: eventId,
            tenant_id: 'tenant-1',
            organizer_id: 'member-1',
            title: 'Member meetup',
            room_booking_id: bookingId,
            starts_at: '2026-11-25T00:00:00+00:00',
            ends_at: '2026-11-25T01:00:00+00:00',
            updated_at: '2026-11-20T00:00:00+00:00',
            status: 'published',
            visibility: 'public'
        }],
        room_bookings: [{ id: bookingId, booking_date: '2026-11-25', space_slug: 'nikau-room', status: 'requested' }],
        public_room_bookings: [{
            booking_date: '2026-11-26', space_slug: 'nikau-room', start_time: '13:30:00', end_time: '14:30:00', status: 'confirmed'
        }],
        spaces: [
            { slug: 'nikau-room', title: 'Nikau Room', is_visible: true, deleted_at: null },
            { slug: 'kauri-room', title: 'Kauri Room', is_visible: true, deleted_at: null },
            { slug: 'hive-lounge', title: 'Hive Lounge', is_visible: true, deleted_at: null },
            { slug: 'retired-room', title: 'Retired Room', is_visible: true, deleted_at: '2026-11-01' }
        ],
        profiles: [],
        tenant_users: [],
        hive_event_rsvps: []
    };
    writes = [];
    rpc = jest.fn((_name, { p_event, p_slot, p_new_booking_owner }) => ({
        async single() {
            const conflict = rows.public_room_bookings.some(booking =>
                booking.space_slug === p_slot.space_slug && booking.booking_date === p_slot.booking_date);
            if (conflict) return { data: null, error: { code: '23P01' } };

            const event = rows.hive_events[0];
            let booking = rows.room_bookings.find(row => row.id === event.room_booking_id);
            if (!booking) {
                booking = { id: 'new-room-booking', owner_id: p_new_booking_owner };
                rows.room_bookings.push(booking);
            }
            Object.assign(booking, p_slot);
            Object.assign(event, p_event, { room_booking_id: booking.id });
            return { data: event, error: null };
        }
    }));
    createSupabaseAdminClient.mockReturnValue({
        rpc,
        from(table) {
            let matches = rows[table];
            let changes;
            const result = () => {
                if (changes) {
                    writes.push({ table, changes });
                    matches.forEach(row => Object.assign(row, changes));
                }
                return { data: matches, error: null };
            };
            const single = async () => ({ ...result(), data: matches[0] || null });
            const query = {
                select: () => query,
                order: () => query,
                eq(field, value) { matches = matches.filter(row => row[field] === value); return query; },
                is(field, value) { matches = matches.filter(row => row[field] === value); return query; },
                in(field, values) { matches = matches.filter(row => values.includes(row[field])); return query; },
                gte(field, value) { matches = matches.filter(row => new Date(row[field]) >= new Date(value)); return query; },
                lte(field, value) { matches = matches.filter(row => new Date(row[field]) <= new Date(value)); return query; },
                update(values) { changes = values; return query; },
                maybeSingle: single,
                single,
                then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); }
            };
            return query;
        }
    });
    getUserFromRequest.mockResolvedValue({ user: { id: 'member-1' } });
});

function editEvent({ date = '2026-11-26', unlink = false, room } = {}) {
    const form = new FormData();
    form.set('title', 'Member meetup');
    form.set('description', '<p>Meet at HIVE</p>');
    form.set('location_mode', 'hive');
    form.set('starts_at', `${date}T00:00:00Z`);
    form.set('ends_at', `${date}T01:00:00Z`);
    form.set('booking_date', date);
    form.set('start_time', '13:00');
    form.set('end_time', '14:00');
    if (unlink) form.set('unlink_room_booking', 'true');
    if (room) form.set('space_slug', room);
    return PATCH({ formData: async () => form }, { params: { id: eventId } });
}

test('shows the linked room to the event editor', async () => {
    const response = await GET({ url: 'https://example.test/api/events?audience=member&start=2026-11-01&end=2026-12-01' });
    expect(response.status).toBe(200);
    expect((await response.json()).events).toEqual([expect.objectContaining({
        room_booking_title: 'Nikau Room', room_booking_space_slug: 'nikau-room', can_edit: true
    })]);
});

test('returns a conflict for a linked room and saves the new date when the editor unlinks it', async () => {
    const conflict = await editEvent();
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error).toContain('Choose another room or time');
    expect(writes).toEqual([]);

    const response = await editEvent({ unlink: true });
    expect(response.status).toBe(200);
    const { event } = await response.json();
    expect(event).toMatchObject({ starts_at: '2026-11-26T00:00:00.000Z', location_name: 'HIVE Whanganui', room_booking_id: null });
    expect(event).not.toHaveProperty('room_booking_title');
    expect(writes.map(write => write.table)).toEqual(['hive_events']);
    expect(rows.room_bookings[0].booking_date).toBe('2026-11-25');
});

test('moves the linked room when the new date is available', async () => {
    const response = await editEvent({ date: '2026-11-27' });
    expect(response.status).toBe(200);
    expect((await response.json()).event).toMatchObject({ room_booking_id: bookingId, room_booking_title: 'Nikau Room' });
    expect(rows.room_bookings[0].booking_date).toBe('2026-11-27');
});

test('allows date changes at HIVE without a room even when a room has a conflicting booking', async () => {
    rows.hive_events[0].room_booking_id = null;
    const response = await editEvent();
    expect(response.status).toBe(200);
    expect(writes.map(write => write.table)).toEqual(['hive_events']);
});

test('uses the replacement room when the original room is booked on the new date', async () => {
    const response = await editEvent({ room: 'kauri-room' });
    expect(response.status).toBe(200);
    expect((await response.json()).event).toMatchObject({ room_booking_id: bookingId, room_booking_space_slug: 'kauri-room' });
    expect(rows.room_bookings).toEqual([expect.objectContaining({
        id: bookingId, space_slug: 'kauri-room', booking_date: '2026-11-26', start_time: '13:00', end_time: '14:00'
    })]);
});

test('can change rooms while keeping the original time', async () => {
    const response = await editEvent({ date: '2026-11-25', room: 'kauri-room' });
    expect(response.status).toBe(200);
    expect(rows.room_bookings[0]).toMatchObject({ id: bookingId, space_slug: 'kauri-room', booking_date: '2026-11-25' });
});

test('limits the lounge to admins in both the room choices and event edits', async () => {
    const memberRooms = await getRoomChoices({});
    expect((await memberRooms.json()).spaces.map(space => space.slug)).toEqual(['nikau-room', 'kauri-room']);
    const denied = await editEvent({ room: 'hive-lounge' });
    expect(denied.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();

    getUserFromRequest.mockResolvedValue({ user: { id: 'admin-1' } });
    rows.profiles.push({ id: 'admin-1', is_admin: true });
    const adminRooms = await getRoomChoices({});
    expect((await adminRooms.json()).spaces.map(space => space.slug)).toEqual(['nikau-room', 'kauri-room', 'hive-lounge']);
    const response = await editEvent({ room: 'hive-lounge' });
    expect(response.status).toBe(200);
    expect(rows.room_bookings[0]).toMatchObject({ id: bookingId, space_slug: 'hive-lounge', start_time: '13:00' });
});

test('assigns a room to an existing event without a room', async () => {
    rows.hive_events[0].room_booking_id = null;
    const response = await editEvent({ room: 'kauri-room' });
    expect(response.status).toBe(200);
    expect((await response.json()).event).toMatchObject({ room_booking_id: 'new-room-booking', room_booking_title: 'Kauri Room' });
    expect(rows.room_bookings[1]).toMatchObject({ owner_id: 'member-1', space_slug: 'kauri-room' });
});
