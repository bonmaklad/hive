import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/app/api/_lib/adminGuard';
import { createSupabaseAdminClient } from '@/app/api/_lib/supabaseAuth';
import { GET as adminList, POST as createSpace } from '@/app/api/admin/spaces/route';
import { DELETE, PATCH } from '@/app/api/admin/spaces/[slug]/route';
import { GET as publicList } from '@/app/api/bookings/room/spaces/route';
import { GET as publicDetail } from '@/app/api/spaces/[slug]/route';
import { POST as publicQuote } from '@/app/api/bookings/room/quote/route';
import { POST as publicBook } from '@/app/api/bookings/room/book/route';
import { POST as memberQuote } from '@/app/api/rooms/quote/route';
import { POST as memberBook } from '@/app/api/rooms/book/route';
import { requireTenantContext } from '@/app/api/rooms/_lib/tenantBilling';
import { fetchCreditsSummary } from '@/app/api/rooms/_lib/credits';
import { getSpaces, getSpaceBySlug, getSpaceSlugs } from '@/lib/spaces';
import { createSpaceStore } from '../../../test/helpers/spaceStore';

jest.mock('@/app/api/_lib/adminGuard', () => ({ requireAdmin: jest.fn() }));
jest.mock('@/app/api/_lib/supabaseAuth', () => ({ createSupabaseAdminClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('next/cache', () => ({ unstable_noStore: jest.fn() }));
jest.mock('@/app/api/rooms/_lib/tenantBilling', () => ({ requireTenantContext: jest.fn() }));
jest.mock('@/app/api/rooms/_lib/credits', () => ({ fetchCreditsSummary: jest.fn() }));
jest.mock('@/app/api/_lib/stripe', () => ({
    createCheckoutSession: jest.fn(), findPromotionCode: jest.fn(), getCouponForPromotionCode: jest.fn(), stripeRequest: jest.fn()
}));

const params = { params: { slug: 'nikau-room' } };
const request = payload => new Request('http://localhost/api/admin/spaces/nikau-room', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
});
let store;

beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';
    store = createSpaceStore([
        { slug: 'nikau-room', title: 'Nikau Room', is_visible: true, deleted_at: null, tokens_per_hour: 1, pricing_half_day_cents: 12000 },
        { slug: 'hidden-room', title: 'Hidden Room', is_visible: false, deleted_at: null, tokens_per_hour: 1 },
        { slug: 'deleted-room', title: 'Deleted Room', is_visible: true, deleted_at: '2026-10-01T00:00:00Z' }
    ]);
    requireAdmin.mockResolvedValue({ ok: true, admin: store.client });
    createSupabaseAdminClient.mockReturnValue(store.client);
    createClient.mockReturnValue(store.client);
    requireTenantContext.mockResolvedValue({ ok: true, admin: store.client, tokenOwnerId: 'test-member' });
    fetchCreditsSummary.mockResolvedValue({ ok: true, tokensLeft: 10, tokensTotal: 10, tokensUsed: 0 });
});

test('admins see hidden spaces and exclude deleted spaces', async () => {
    const response = await adminList(request({}));
    const { spaces } = await response.json();
    expect(spaces.map(space => space.slug)).toEqual(['hidden-room', 'nikau-room']);
    expect(spaces[0].is_visible).toBe(false);
});

test('hiding and showing a room removes and restores all public website sources', async () => {
    const hidden = await PATCH(request({ is_visible: false }), params);
    expect(hidden.status).toBe(200);
    expect((await hidden.json()).space.is_visible).toBe(false);
    expect((await (await publicList()).json()).spaces).toEqual([]);
    expect((await publicDetail(request({}), params)).status).toBe(404);
    expect(await getSpaces()).toEqual([]);
    expect(await getSpaceBySlug('nikau-room')).toBeNull();
    expect(await getSpaceSlugs()).toEqual([]);

    await PATCH(request({ is_visible: true }), params);
    expect((await (await publicList()).json()).spaces.map(space => space.slug)).toEqual(['nikau-room']);
    expect((await publicDetail(request({}), params)).status).toBe(200);
    expect((await getSpaces()).map(space => space.slug)).toEqual(['nikau-room']);
    expect((await getSpaceBySlug('nikau-room')).title).toBe('Nikau Room');
    expect(await getSpaceSlugs()).toEqual(['nikau-room']);
});

test('a booked space is deleted without removing its foreign key target or booking records', async () => {
    store.tables.room_bookings = [{ id: 'member-booking', space_slug: 'nikau-room', status: 'approved' }];
    store.tables.public_room_bookings = [{ id: 'public-booking', space_slug: 'nikau-room', status: 'confirmed' }];
    const originalBookings = JSON.stringify([store.tables.room_bookings, store.tables.public_room_bookings]);

    expect((await DELETE(request({}), params)).status).toBe(200);
    const deleted = store.tables.spaces.find(space => space.slug === 'nikau-room');
    expect(deleted.deleted_at).toBeTruthy();
    expect(deleted.is_visible).toBe(false);
    expect(store.operations.some(operation => operation.action === 'delete')).toBe(false);
    expect(JSON.stringify([store.tables.room_bookings, store.tables.public_room_bookings])).toBe(originalBookings);
    expect((await (await adminList(request({}))).json()).spaces.map(space => space.slug)).toEqual(['hidden-room']);
    expect(await getSpaceBySlug('nikau-room')).toBeNull();
    expect((await PATCH(request({ title: 'Restore' }), params)).status).toBe(404);
    const deletedAt = deleted.deleted_at;
    expect((await DELETE(request({}), params)).status).toBe(200);
    expect(deleted.deleted_at).toBe(deletedAt);
});

test('details and prices can be updated on a booked room while preserving its slug', async () => {
    const response = await PATCH(request({ title: 'Updated room', pricing_half_day_cents: 15000, slug: 'replacement-room' }), params);
    expect(response.status).toBe(200);
    expect((await response.json()).space).toMatchObject({ slug: 'nikau-room', title: 'Updated room', pricing_half_day_cents: 15000 });
});

test.each([publicQuote, publicBook])('public booking requests reject hidden and deleted rooms', async handler => {
    const booking = { booking_date: '2099-10-08', start_time: '09:00', end_time: '12:00', customer_name: 'Test customer', customer_email: 'test@example.com' };
    for (const slug of ['hidden-room', 'deleted-room']) {
        const response = await handler(request({ ...booking, space_slug: slug }));
        expect(response.status).toBe(404);
    }
    expect(store.operations).toEqual([]);
});

test('new spaces can be created hidden and visibility accepts only booleans', async () => {
    const response = await createSpace(request({ slug: 'new-room', title: 'New Room', is_visible: false }));
    expect(response.status).toBe(200);
    expect((await response.json()).space.is_visible).toBe(false);
    expect((await PATCH(request({ is_visible: 'false' }), params)).status).toBe(400);
    expect((await createSpace(request({ slug: 'bad-room', title: 'Bad Room', is_visible: 'false' }))).status).toBe(400);
});

test('members can quote hidden spaces while deleted spaces cannot be quoted or booked', async () => {
    const booking = { booking_date: '2099-10-08', start_time: '09:00', end_time: '12:00' };
    expect((await memberQuote(request({ ...booking, space_slug: 'hidden-room' }))).status).toBe(200);
    for (const handler of [memberQuote, memberBook]) {
        expect((await handler(request({ ...booking, space_slug: 'deleted-room' }))).status).toBe(404);
    }
    expect(store.operations).toEqual([]);
});

test.each([PATCH, DELETE])('space mutations require admin authorization', async handler => {
    requireAdmin.mockResolvedValue({ ok: false, status: 403, error: 'Admin access required.' });
    expect((await handler(request({ title: 'Changed' }), params)).status).toBe(403);
    expect(store.operations).toEqual([]);
});
