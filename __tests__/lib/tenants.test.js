import { getTenantDirectory } from '@/lib/tenants';

jest.mock('next/cache', () => ({ unstable_noStore: jest.fn() }));

const originalEnv = process.env;
let tables;
let errors;
let fetchSpy;

function addTenant(id, status = 'live', info = {}) {
    tables.tenants.push({ id, name: id, tenant_info: { email: `${id}@example.test`, ...info } });
    tables.tenant_users.push({ tenant_id: id, user_id: `${id}-owner`, role: 'owner', created_at: '2026-01-01' });
    if (status) tables.memberships.push({ owner_id: `${id}-owner`, status, updated_at: '2026-11-01' });
}

beforeEach(() => {
    process.env = {
        ...originalEnv,
        SUPABASE_URL: 'https://supabase.example.test',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key'
    };
    tables = { tenants: [], tenant_users: [], memberships: [] };
    errors = {};
    const cache = new Map();
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init = {}) => {
        const url = new URL(input);
        const table = url.pathname.split('/').pop();
        if (!tables[table]) throw new Error(`Unexpected table: ${table}`);
        if (errors[table]) return Response.json({ message: errors[table] }, { status: 400 });
        if (init.cache !== 'no-store' && cache.has(url.href)) return Response.json(cache.get(url.href));

        let rows = [...tables[table]];
        for (const [column, filter] of url.searchParams) {
            if (filter.startsWith('in.(')) {
                const values = filter.slice(4, -1).split(',');
                rows = rows.filter(row => values.includes(row[column]));
            }
        }
        const order = url.searchParams.get('order');
        if (order) {
            const [column, direction] = order.split('.');
            rows.sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (direction === 'desc' ? -1 : 1));
        }
        if (init.cache !== 'no-store') cache.set(url.href, JSON.parse(JSON.stringify(rows)));
        return Response.json(rows);
    });
});

afterEach(() => {
    fetchSpy.mockRestore();
    process.env = originalEnv;
});

test('only live memberships with an enabled directory profile are published', async () => {
    addTenant('live');
    addTenant('expired', 'expired');
    addTenant('cancelled', 'cancelled');
    addTenant('no-membership', null);
    addTenant('opted-out', 'live', { directory_enabled: false });
    addTenant('no-profile');
    tables.tenants.find(row => row.id === 'no-profile').tenant_info = null;
    addTenant('array-profile');
    tables.tenants.find(row => row.id === 'array-profile').tenant_info = [{ profile_name: 'Public name' }];

    const directory = await getTenantDirectory();
    expect(directory.map(tenant => tenant.id)).toEqual(['array-profile', 'live']);
    expect(directory[0].profileName).toBe('Public name');
    expect(directory[1].email).toBe('live@example.test');
    expect(directory[1]).not.toHaveProperty('owner_id');
    expect(directory[1]).not.toHaveProperty('status');
});

test('a live admin or employee cannot keep an expired owner listed', async () => {
    addTenant('expired-owner', 'expired');
    addTenant('employee-only', null);
    tables.tenant_users.find(row => row.tenant_id === 'employee-only').role = 'member';
    tables.tenant_users.push({ tenant_id: 'expired-owner', user_id: 'live-admin', role: 'admin', created_at: '2025-01-01' });
    tables.memberships.push(
        { owner_id: 'live-admin', status: 'live', updated_at: '2026-11-01' },
        { owner_id: 'employee-only-owner', status: 'live', updated_at: '2026-11-01' }
    );

    expect(await getTenantDirectory()).toEqual([]);
});

test('uses the oldest admin membership when a tenant has no owner', async () => {
    addTenant('admin-managed');
    tables.tenant_users[0].role = 'admin';
    tables.tenant_users.push({ tenant_id: 'admin-managed', user_id: 'new-admin', role: 'admin', created_at: '2026-10-01' });
    tables.memberships.push({ owner_id: 'new-admin', status: 'expired', updated_at: '2026-11-01' });

    expect((await getTenantDirectory()).map(tenant => tenant.id)).toEqual(['admin-managed']);
});

test('the latest membership status takes precedence over an older live record', async () => {
    addTenant('expired', 'expired');
    tables.memberships.push({ owner_id: 'expired-owner', status: 'live', updated_at: '2026-01-01' });

    expect(await getTenantDirectory()).toEqual([]);
});

test('subsequent requests hide an expired member and restore a renewed member without stale fetches', async () => {
    addTenant('renewing');
    expect((await getTenantDirectory()).map(tenant => tenant.id)).toEqual(['renewing']);

    tables.memberships[0].status = 'expired';
    expect(await getTenantDirectory()).toEqual([]);

    tables.memberships[0].status = 'live';
    expect((await getTenantDirectory()).map(tenant => tenant.id)).toEqual(['renewing']);
    for (const [, init] of fetchSpy.mock.calls) {
        expect(init.cache).toBe('no-store');
        expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-service-role-key');
    }
});

test('returns an empty directory when no eligible ownership links exist', async () => {
    addTenant('no-owner');
    tables.tenant_users = [];
    expect(await getTenantDirectory()).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test.each(['tenants', 'tenant_users', 'memberships'])('fails closed if the %s lookup fails', async table => {
    addTenant('live');
    errors[table] = 'Lookup failed';
    await expect(getTenantDirectory()).rejects.toThrow('Lookup failed');
});

test('requires a server credential to check private membership status', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_KEY;
    delete process.env.SERVICE_ROLE_KEY;
    await expect(getTenantDirectory()).rejects.toThrow('Missing SUPABASE_SERVICE_ROLE_KEY');
    expect(fetchSpy).not.toHaveBeenCalled();
});
