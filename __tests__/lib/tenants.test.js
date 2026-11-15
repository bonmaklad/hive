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
    tables = { tenants: [], tenant_users: [], memberships: [], work_unit_allocations: [] };
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
            if (filter.startsWith('lte.')) {
                rows = rows.filter(row => row[column] <= filter.slice(4));
            }
        }
        const endDate = url.searchParams.get('or')?.match(/^\(end_date\.is\.null,end_date\.gt\.([\d-]+)\)$/)?.[1];
        if (endDate) rows = rows.filter(row => row.end_date == null || row.end_date > endDate);
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

test('touchscreen buildings come from current tenant allocations and ignore profile text, expired and future allocations', async () => {
    addTenant('left', 'live', { office_location: '116.1' });
    addTenant('right', 'live', { office_location: '122.1' });
    addTenant('member');
    addTenant('expired', 'expired');
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    tables.work_unit_allocations = [
        { tenant_id: 'left', work_unit: { building: '122' }, start_date: today },
        { tenant_id: 'left', work_unit: { building: '122' }, start_date: today },
        { tenant_id: 'right', work_unit: [{ building: 116 }], start_date: today, end_date: tomorrow },
        { tenant_id: 'right', work_unit: { building: '122' }, start_date: today, end_date: today },
        { tenant_id: 'member', work_unit: { building: '116' }, start_date: tomorrow },
        { tenant_id: 'member', work_unit: null, start_date: today },
        { tenant_id: 'expired', work_unit: { building: '116' }, start_date: today }
    ];

    const directory = await getTenantDirectory({ includeBuildings: true });
    expect(directory.map(({ id, buildings }) => ({ id, buildings }))).toEqual([
        { id: 'left', buildings: ['122'] },
        { id: 'member', buildings: [] },
        { id: 'right', buildings: ['116'] }
    ]);
    const [allocationRequest, allocationOptions] = fetchSpy.mock.calls.find(([input]) => new URL(input).pathname.endsWith('/work_unit_allocations'));
    expect(new URL(allocationRequest).searchParams.get('select')).toBe('tenant_id,work_unit:work_units(building)');
    expect(allocationOptions.cache).toBe('no-store');
});

test('the regular directory does not request building allocations', async () => {
    addTenant('live');
    const directory = await getTenantDirectory();
    expect(directory[0]).not.toHaveProperty('buildings');
    expect(fetchSpy.mock.calls.some(([input]) => new URL(input).pathname.endsWith('/work_unit_allocations'))).toBe(false);
});

test('allocation lookup failures do not produce guessed touchscreen directions', async () => {
    addTenant('live');
    errors.work_unit_allocations = 'Allocation lookup failed';
    await expect(getTenantDirectory({ includeBuildings: true })).rejects.toThrow('Allocation lookup failed');
});

function allocateOffice(tenantId, number, options = {}) {
    const { start_date, end_date, ...unit } = options;
    tables.work_unit_allocations.push({
        tenant_id: tenantId,
        start_date: start_date || new Date().toISOString().slice(0, 10),
        end_date,
        work_unit: { building: '116', unit_number: number, unit_type: 'private_office', is_active: true, ...unit }
    });
}

test('office badges include each exclusive office once and exclude desks and inactive units', async () => {
    addTenant('team');
    allocateOffice('team', '5');
    allocateOffice('team', '5');
    allocateOffice('team', '6', { unit_type: 'small_office' });
    allocateOffice('team', '10', { building: '122', unit_type: 'premium_office' });
    allocateOffice('team', '23', { unit_type: 'desk_pod' });
    allocateOffice('team', '1', { unit_type: 'desk' });
    allocateOffice('team', '9', { is_active: false });

    const [tenant] = await getTenantDirectory({ includeBuildings: true, includeOffices: true });
    expect(tenant.officeCodes).toEqual(['116.5', '116.6', '122.10']);
    expect(tenant.buildings).toEqual(['122', '116']);
});

test('a second occupant prevents an exclusive badge even when their profile is hidden or membership expired', async () => {
    addTenant('listed');
    addTenant('hidden', 'live', { directory_enabled: false });
    addTenant('expired', 'expired');
    allocateOffice('listed', '5');
    allocateOffice('hidden', '5');
    allocateOffice('listed', '6');
    allocateOffice('expired', '6');

    const directory = await getTenantDirectory({ includeOffices: true });
    expect(directory.map(({ id, officeCodes }) => ({ id, officeCodes }))).toEqual([{ id: 'listed', officeCodes: [] }]);
    const [request, options] = fetchSpy.mock.calls.find(([input]) => new URL(input).pathname.endsWith('/work_unit_allocations'));
    expect(new URL(request).searchParams.has('tenant_id')).toBe(false);
    expect(options.cache).toBe('no-store');
});

test('only current allocations determine office exclusivity, and changes appear on the next request', async () => {
    addTenant('listed');
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    allocateOffice('listed', '5');
    allocateOffice('past-tenant', '5', { end_date: today });
    allocateOffice('future-tenant', '5', { start_date: tomorrow });
    expect((await getTenantDirectory({ includeOffices: true }))[0].officeCodes).toEqual(['116.5']);

    allocateOffice('second-tenant', '5');
    expect((await getTenantDirectory({ includeOffices: true }))[0].officeCodes).toEqual([]);
});
