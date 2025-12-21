import { NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/adminGuard';

export const runtime = 'nodejs';

function toCode(building, unitNumber) {
    if (!building && building !== 0) return '';
    if (unitNumber === null || unitNumber === undefined) return '';
    return `${String(building).trim()}.${String(unitNumber).trim()}`;
}

function asNumber(value, fallback = 0) {
    const number = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(number)) return fallback;
    return number;
}

function toIsoDate(date) {
    return date.toISOString().slice(0, 10);
}

export async function GET(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const url = new URL(request.url);
    const includeOccupant = url.searchParams.get('includeOccupant') === '1';

    // The schema for work_units has varied during iteration (active vs is_active, custom_price_cents optional).
    // Use select('*') + JS filtering to avoid "column does not exist" errors.
    const { data: unitsRaw, error: unitsError } = await guard.admin
        .from('work_units')
        .select('*')
        .order('building', { ascending: true })
        .order('unit_number', { ascending: true });

    if (unitsError) return NextResponse.json({ error: unitsError.message }, { status: 500 });

    let occupantsByUnitId = {};

    if (includeOccupant) {
        const today = toIsoDate(new Date());
        const { data: activeAllocations, error: allocationsError } = await guard.admin
            .from('work_unit_allocations')
            .select('work_unit_id, tenant_id')
            .lte('start_date', today)
            .or(`end_date.is.null,end_date.gt.${today}`);

        if (allocationsError) return NextResponse.json({ error: allocationsError.message }, { status: 500 });

        for (const row of activeAllocations || []) {
            if (!row?.work_unit_id) continue;
            occupantsByUnitId[row.work_unit_id] = row.tenant_id || null;
        }
    }

    const units = (unitsRaw || []).map(u => {
        const unitNumber = asNumber(u?.unit_number, 0);
        const code = toCode(u?.building, unitNumber);
        const occupiedBy = includeOccupant ? occupantsByUnitId?.[u.id] || null : null;
        const isOccupied = Boolean(occupiedBy);
        const basePriceCents = u?.base_price_cents === null ? null : asNumber(u?.base_price_cents, 0);
        const legacyCustomPriceCents = u?.custom_price_cents === null ? null : asNumber(u?.custom_price_cents, 0);
        const priceCents = u?.price_cents === null ? null : asNumber(u?.price_cents, 0);
        const displayPriceCents = (priceCents ?? legacyCustomPriceCents) ?? basePriceCents;
        const active = u?.active ?? u?.is_active ?? true;

        return {
            id: u?.id,
            building: u?.building ?? null,
            unit_number: unitNumber,
            code,
            label: u?.label ?? '',
            unit_type: u?.unit_type ?? null,
            category: null,
            capacity: asNumber(u?.capacity, 1),
            price_cents: priceCents,
            display_price_cents: displayPriceCents,
            is_occupied: isOccupied,
            is_vacant: !isOccupied,
            active,
            occupied_by_tenant_id: occupiedBy
        };
    }).filter(u => u && (u.active ?? true) !== false);

    return NextResponse.json({ units });
}
