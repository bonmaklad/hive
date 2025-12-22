import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../_lib/supabaseAuth';

export const runtime = 'nodejs';

function toCode(building, unitNumber) {
    if (!building && building !== 0) return '';
    if (unitNumber === null || unitNumber === undefined) return '';
    return `${String(building).trim()}.${String(unitNumber).trim()}`;
}

function toIsoDate(date) {
    return date.toISOString().slice(0, 10);
}

function toPositiveInt(value, fallback = 1) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.floor(n));
}

export async function GET(request) {
    // Auth required, but not admin; we only expose minimal unit info
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const url = new URL(request.url);
    const includeOccupant = url.searchParams.get('includeOccupant') === '1';

    const { data: unitsRaw, error: unitsError } = await admin
        .from('work_units')
        .select('*')
        .order('building', { ascending: true })
        .order('unit_number', { ascending: true });
    if (unitsError) return NextResponse.json({ error: unitsError.message }, { status: 500 });

    let occupantsByUnitId = {};
    if (includeOccupant) {
        const today = toIsoDate(new Date());
        const { data: activeAllocations, error: allocationsError } = await admin
            .from('work_unit_allocations')
            .select('work_unit_id, tenant_id')
            .lte('start_date', today)
            .or(`end_date.is.null,end_date.gt.${today}`);
        if (allocationsError) return NextResponse.json({ error: allocationsError.message }, { status: 500 });
        for (const row of activeAllocations || []) {
            if (!row?.work_unit_id) continue;
            if (!occupantsByUnitId[row.work_unit_id]) occupantsByUnitId[row.work_unit_id] = [];
            if (row.tenant_id) occupantsByUnitId[row.work_unit_id].push(row.tenant_id);
        }
    }

    // Find the user's tenant ids to mark "mine"
    let myTenantIds = new Set();
    const { data: tus, error: tuError } = await admin
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', user.id);
    if (!tuError) {
        for (const r of tus || []) if (r?.tenant_id) myTenantIds.add(r.tenant_id);
    }

    const units = (unitsRaw || [])
        .map(u => {
            const building = u?.building ?? null;
            const unitNumber = Number.isFinite(u?.unit_number) ? u.unit_number : Number(u?.unit_number);
            const code = toCode(building, unitNumber);
            const capacity = toPositiveInt(u?.capacity, 1);
            const occupiedTenantIds = includeOccupant ? (occupantsByUnitId?.[u.id] || []) : [];
            const occupiedCount = Array.isArray(occupiedTenantIds) ? occupiedTenantIds.length : 0;
            const isFull = occupiedCount >= capacity;
            const mine = Array.isArray(occupiedTenantIds) ? occupiedTenantIds.some(id => myTenantIds.has(id)) : false;
            const active = u?.active ?? u?.is_active ?? true;
            return active === false
                ? null
                : {
                      id: u?.id,
                      building,
                      unit_number: unitNumber,
                      code,
                      label: u?.label ?? '',
                      unit_type: u?.unit_type ?? null,
                      capacity,
                      occupied_count: occupiedCount,
                      slots_remaining: Math.max(0, capacity - occupiedCount),
                      is_full: isFull,
                      // Back-compat: in UI we treat "occupied" as "unavailable"
                      is_occupied: isFull,
                      mine
                  };
        })
        .filter(Boolean);

    return NextResponse.json({ units });
}
