import { NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/adminGuard';

export const runtime = 'nodejs';

const UNIT_TYPES = ['premium_office', 'private_office', 'desk', 'desk_pod', 'small_office'];

function toCode(building, unitNumber) {
    if (!building && building !== 0) return '';
    if (unitNumber === null || unitNumber === undefined) return '';
    return `${String(building).trim()}.${String(unitNumber).trim()}`;
}

function safeText(value, limit = 200) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function asNumber(value, fallback = 0) {
    const number = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(number)) return fallback;
    return number;
}

function toIntOrNull(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && !value.trim()) return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.floor(n);
}

function toBool(value, fallback = true) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y', 'on'].includes(v)) return true;
        if (['false', '0', 'no', 'n', 'off'].includes(v)) return false;
    }
    return fallback;
}

function toIsoDate(date) {
    return date.toISOString().slice(0, 10);
}

async function insertWorkUnit({ guard, row }) {
    const { data, error } = await guard.admin.from('work_units').insert(row).select('*').single();
    if (error) throw new Error(error.message);
    return data;
}

async function updateWorkUnitColumns({ guard, id, updates }) {
    const { data, error } = await guard.admin.from('work_units').update(updates).eq('id', id).select('*').single();
    if (error) throw new Error(error.message);
    return data;
}

async function applyOptionalWorkUnitUpdates({ guard, id, payload }) {
    const patches = [];

    const activePayload = payload?.is_active ?? payload?.active;
    if (activePayload !== undefined) {
        const active = toBool(activePayload, true);
        patches.push([{ active }, { is_active: active }]);
    }

    if (payload?.category !== undefined) {
        const category = safeText(payload?.category, 120) || null;
        patches.push([{ category }]);
    }

    if (payload?.price_cents !== undefined) {
        const cents = toIntOrNull(payload?.price_cents);
        if (cents != null && cents < 0) throw new Error('price_cents must be >= 0.');
        patches.push([{ price_cents: cents }, { custom_price_cents: cents }, { base_price_cents: cents }]);
    }

    let latest = null;
    for (const candidates of patches) {
        let succeeded = false;
        let lastError = null;
        for (const update of candidates) {
            try {
                latest = await updateWorkUnitColumns({ guard, id, updates: update });
                succeeded = true;
                lastError = null;
                break;
            } catch (err) {
                lastError = err;
                const msg = String(err?.message || '');
                if (!msg.includes('column') || !msg.includes('does not exist')) break;
            }
        }
        if (!succeeded && lastError) {
            const msg = String(lastError?.message || '');
            const missingColumn = msg.includes('column') && msg.includes('does not exist');
            if (!missingColumn) throw lastError;
        }
    }

    return latest;
}

function serializeWorkUnit(u, { includeOccupant, occupantsByUnitId }) {
    const unitNumber = asNumber(u?.unit_number, 0);
    const code = toCode(u?.building, unitNumber);
    const occupiedBy = includeOccupant ? occupantsByUnitId?.[u.id] || null : null;
    const isOccupied = Boolean(occupiedBy);
    const basePriceCents = u?.base_price_cents === null ? null : toIntOrNull(u?.base_price_cents);
    const legacyCustomPriceCents = u?.custom_price_cents === null ? null : toIntOrNull(u?.custom_price_cents);
    const priceCents = u?.price_cents === null ? null : toIntOrNull(u?.price_cents);
    const displayPriceCents = (priceCents ?? legacyCustomPriceCents) ?? basePriceCents;
    const active = u?.active ?? u?.is_active ?? true;

    return {
        id: u?.id,
        building: u?.building ?? null,
        unit_number: unitNumber,
        code,
        label: u?.label ?? '',
        unit_type: u?.unit_type ?? null,
        category: u?.category ?? null,
        capacity: asNumber(u?.capacity, 1),
        price_cents: (priceCents ?? legacyCustomPriceCents) ?? null,
        display_price_cents: displayPriceCents,
        is_occupied: isOccupied,
        is_vacant: !isOccupied,
        active,
        is_active: active,
        occupied_by_tenant_id: occupiedBy
    };
}

export async function GET(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const url = new URL(request.url);
    const includeOccupant = url.searchParams.get('includeOccupant') === '1';
    const includeInactive = url.searchParams.get('includeInactive') === '1';

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

    const units = (unitsRaw || [])
        .map(u => serializeWorkUnit(u, { includeOccupant, occupantsByUnitId }))
        .filter(u => u && (includeInactive || (u.active ?? true) !== false));

    return NextResponse.json({ units });
}

export async function POST(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const payload = await request.json().catch(() => ({}));
    const building = safeText(payload?.building, 120);
    const unitNumber = toIntOrNull(payload?.unit_number);
    const unitType = safeText(payload?.unit_type, 60);
    const capacity = toIntOrNull(payload?.capacity) ?? 1;

    if (!building) return NextResponse.json({ error: 'building is required.' }, { status: 400 });
    if (unitNumber == null) return NextResponse.json({ error: 'unit_number is required.' }, { status: 400 });
    if (!unitType) return NextResponse.json({ error: 'unit_type is required.' }, { status: 400 });
    if (UNIT_TYPES.length && !UNIT_TYPES.includes(unitType)) {
        return NextResponse.json({ error: `unit_type must be one of: ${UNIT_TYPES.join(', ')}` }, { status: 400 });
    }
    if (!Number.isFinite(capacity) || capacity < 1) return NextResponse.json({ error: 'capacity must be >= 1.' }, { status: 400 });

    const label = safeText(payload?.label, 120) || unitType;

    try {
        const created = await insertWorkUnit({
            guard,
            row: {
                building,
                unit_number: unitNumber,
                label,
                unit_type: unitType,
                capacity
            }
        });

        let updated = created;
        updated = (await applyOptionalWorkUnitUpdates({ guard, id: created.id, payload })) || updated;

        const unit = serializeWorkUnit(updated, { includeOccupant: false, occupantsByUnitId: {} });
        return NextResponse.json({ ok: true, unit });
    } catch (err) {
        const message = err?.message || 'Failed to create work unit.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
