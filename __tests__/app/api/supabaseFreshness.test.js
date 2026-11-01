import { createSupabaseAdminClient, createSupabaseAnonClient } from '@/app/api/_lib/supabaseAuth';
import { GET } from '@/app/api/availability/route';

const originalEnv = process.env;
let fetchSpy;
let tables;

beforeEach(() => {
    process.env = {
        ...originalEnv,
        SUPABASE_URL: 'https://supabase.example.test',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key'
    };
    tables = {
        work_units: [{ id: 'desk-1', building: '116', unit_number: '4', unit_type: 'desk', capacity: 3, is_active: true, price_cents: 5000 }],
        work_unit_allocations: []
    };
    const cache = new Map();
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init = {}) => {
        const url = new URL(input);
        const table = url.pathname.split('/').pop();
        if (!Object.prototype.hasOwnProperty.call(tables, table)) throw new Error(`Unexpected request: ${url.pathname}`);

        // Reproduce Next's persistent fetch cache unless the request opts out.
        if (init.cache !== 'no-store' && cache.has(url.href)) return Response.json(cache.get(url.href));
        const rows = JSON.parse(JSON.stringify(tables[table]));
        if (init.cache !== 'no-store') cache.set(url.href, rows);
        return Response.json(rows);
    });
});

afterEach(() => {
    fetchSpy.mockRestore();
    process.env = originalEnv;
});

test.each([
    ['admin', createSupabaseAdminClient, 'test-service-role-key'],
    ['anonymous', createSupabaseAnonClient, 'test-anon-key']
])('%s server client reads changed database values and preserves authentication', async (_, createServerClient, key) => {
    const client = createServerClient();
    const first = await client.from('work_units').select('*');
    expect(first.error).toBeNull();
    expect(first.data[0].capacity).toBe(3);

    tables.work_units[0].capacity = 4;
    const second = await client.from('work_units').select('*');
    expect(second.error).toBeNull();
    expect(second.data[0].capacity).toBe(4);
    for (const [, init] of fetchSpy.mock.calls) {
        expect(init.cache).toBe('no-store');
        expect(new Headers(init.headers).get('apikey')).toBe(key);
        expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${key}`);
    }
});

test('availability reflects allocation, capacity, price and active status changes on subsequent requests', async () => {
    const initial = await GET();
    expect(initial.headers.get('Cache-Control')).toContain('no-store');
    expect((await initial.json()).units).toEqual([
        expect.objectContaining({ id: 'desk-1', slots_remaining: 3, display_price_cents: 5000 })
    ]);

    tables.work_unit_allocations.push({ work_unit_id: 'desk-1' });
    expect((await (await GET()).json()).units).toEqual([
        expect.objectContaining({ id: 'desk-1', slots_remaining: 2, display_price_cents: 5000 })
    ]);

    tables.work_units[0].capacity = 4;
    tables.work_units[0].price_cents = 7500;
    expect((await (await GET()).json()).units).toEqual([
        expect.objectContaining({ id: 'desk-1', slots_remaining: 3, display_price_cents: 7500 })
    ]);

    tables.work_units[0].is_active = false;
    expect((await (await GET()).json()).units).toEqual([]);
});
