import { GET } from '@/app/api/availability/route';
import { GET as getAdminWorkUnits } from '@/app/api/admin/work-units/route';
import { createSupabaseAdminClient } from '@/app/api/_lib/supabaseAuth';
import { requireAdmin } from '@/app/api/_lib/adminGuard';

jest.mock('@/app/api/_lib/supabaseAuth', () => ({ createSupabaseAdminClient: jest.fn() }));
jest.mock('@/app/api/_lib/adminGuard', () => ({ requireAdmin: jest.fn() }));

let tables;

beforeEach(() => {
    tables = {
        work_units: [
            { id: 'empty', building: '122', unit_number: 1, capacity: 1, unit_type: 'desk', price_cents: 5000 },
            { id: 'partial', building: '122', unit_number: 18, capacity: 4, unit_type: 'desk_pod' },
            { id: 'full', building: '116', unit_number: 8, capacity: 1, unit_type: 'private_office', image: 'private-room.jpg' },
            { id: 'inactive', building: '116', unit_number: 9, capacity: 1, is_active: false }
        ],
        work_unit_allocations: [
            { work_unit_id: 'partial', tenant_id: 'tenant-1' },
            { work_unit_id: 'full', tenant_id: 'tenant-2' }
        ],
        tenants: [{ id: 'tenant-1', name: 'Private tenant' }]
    };
    const admin = {
        storage: {
            from: () => ({ getPublicUrl: path => ({ data: { publicUrl: `https://storage.example.test/${path}` } }) })
        },
        from(table) {
            const query = {
                select: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                lte: jest.fn().mockReturnThis(),
                or: jest.fn().mockReturnThis(),
                in: jest.fn().mockReturnThis(),
                then(resolve, reject) {
                    return Promise.resolve({ data: tables[table], error: null }).then(resolve, reject);
                }
            };
            return query;
        }
    };
    createSupabaseAdminClient.mockReturnValue(admin);
    requireAdmin.mockResolvedValue({ ok: true, admin });
});

test('the public map includes full rooms and matches admin occupancy without publishing tenant or billing data', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    const { units, map_units: mapUnits } = await response.json();
    expect(units.map(unit => unit.id)).toEqual(['empty', 'partial']);
    expect(mapUnits.map(unit => unit.id)).toEqual(['empty', 'partial', 'full']);

    const adminResponse = await getAdminWorkUnits(new Request('http://localhost/api/admin/work-units?includeOccupant=1'));
    const { units: adminUnits } = await adminResponse.json();
    for (const unit of mapUnits) {
        expect(unit).toEqual({
            id: unit.id,
            building: unit.building,
            unit_number: unit.unit_number,
            capacity: unit.capacity,
            occupied_count: unit.occupied_count,
            slots_remaining: unit.slots_remaining
        });
        expect(adminUnits.find(candidate => candidate.id === unit.id)).toEqual(expect.objectContaining(unit));
    }
});

test('the next public response reflects occupied rooms becoming vacant and rooms being deactivated', async () => {
    await GET();
    tables.work_unit_allocations = [];
    tables.work_units[0].active = false;
    const { units, map_units: mapUnits } = await (await GET()).json();
    expect(mapUnits.map(unit => unit.id)).toEqual(['partial', 'full']);
    expect(mapUnits.every(unit => unit.occupied_count === 0 && unit.slots_remaining === unit.capacity)).toBe(true);
    expect(units.map(unit => unit.id)).toEqual(['partial', 'full']);
});
