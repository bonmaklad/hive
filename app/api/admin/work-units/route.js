import { NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/adminGuard';

export const runtime = 'nodejs';

const UNIT_TYPES = ['premium_office', 'private_office', 'desk', 'desk_pod', 'small_office'];

function toCode(building, unitNumber) {
    if (!building && building !== 0) return '';
    if (unitNumber === null || unitNumber === undefined) return '';
    return `${String(building).trim()}.${String(unitNumber).trim()}`;
}

function isMissingColumnError(err, columnName) {
    const msg = String(err?.message || '').toLowerCase();
    const col = String(columnName || '').toLowerCase();
    if (!col) return false;
    const mentionsColumn = msg.includes(`'${col}'`) || msg.includes(`"${col}"`) || msg.includes(`.${col}`) || msg.includes(` ${col} `);
    if (!mentionsColumn) return false;
    return msg.includes('does not exist') || msg.includes('schema cache');
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

function toPositiveInt(value, fallback = 1) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.floor(n));
}

function toNonNegativeInt(value, fallback = 0) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.floor(n));
}

function pickLatestMembershipByOwner(rows) {
    const byOwner = new Map();
    for (const row of rows || []) {
        const ownerId = typeof row?.owner_id === 'string' ? row.owner_id : null;
        if (!ownerId) continue;
        const ts = Date.parse(row?.updated_at || row?.created_at || '');
        const next = Number.isFinite(ts) ? ts : 0;
        const prev = byOwner.get(ownerId);
        const prevTs = prev ? Date.parse(prev?.updated_at || prev?.created_at || '') : 0;
        if (!prev || next >= (Number.isFinite(prevTs) ? prevTs : 0)) byOwner.set(ownerId, row);
    }
    return byOwner;
}

function allocateMembershipAcrossUnits({ totalCents, unitIds, weightByUnitId }) {
    const total = toNonNegativeInt(totalCents, 0);
    const ids = Array.isArray(unitIds) ? unitIds.filter(Boolean) : [];
    if (!ids.length || total <= 0) return new Map();

    const weights = ids.map(id => toNonNegativeInt(weightByUnitId?.get(id), 0));
    const totalWeight = weights.reduce((acc, w) => acc + w, 0);

    const out = new Map();

    if (totalWeight <= 0) {
        const base = Math.floor(total / ids.length);
        const remainder = total - base * ids.length;
        ids.forEach((id, idx) => {
            out.set(id, base + (idx < remainder ? 1 : 0));
        });
        return out;
    }

    const totalBig = BigInt(total);
    const denomBig = BigInt(totalWeight);

    const allocations = ids.map((id, idx) => {
        const w = weights[idx];
        const wBig = BigInt(w);
        const numerator = totalBig * wBig;
        const share = numerator / denomBig;
        const rem = numerator % denomBig;
        return { id, share, rem };
    });

    let sumShares = 0n;
    for (const row of allocations) sumShares += row.share;

    let leftover = totalBig - sumShares;
    allocations.sort((a, b) => {
        if (a.rem === b.rem) return String(a.id).localeCompare(String(b.id));
        return a.rem > b.rem ? -1 : 1;
    });

    for (let i = 0; i < allocations.length && leftover > 0n; i += 1) {
        allocations[i].share += 1n;
        leftover -= 1n;
    }

    for (const row of allocations) out.set(row.id, Number(row.share));
    return out;
}

async function insertWorkUnit({ guard, row }) {
    const candidates = Array.isArray(row) ? row : [row];
    let lastError = null;
    for (const candidate of candidates) {
        const { data, error } = await guard.admin.from('work_units').insert(candidate).select('*').single();
        if (!error) return data;
        lastError = new Error(error.message);
        if (!isMissingColumnError(lastError, 'code')) throw lastError;
    }
    throw lastError || new Error('Failed to create work unit.');
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
                const missingColumn = isMissingColumnError(err, 'price_cents')
                    || isMissingColumnError(err, 'custom_price_cents')
                    || isMissingColumnError(err, 'base_price_cents')
                    || isMissingColumnError(err, 'category')
                    || isMissingColumnError(err, 'active')
                    || isMissingColumnError(err, 'is_active');
                if (!missingColumn) break;
            }
        }
        if (!succeeded && lastError) {
            const missingColumn = isMissingColumnError(lastError, 'price_cents')
                || isMissingColumnError(lastError, 'custom_price_cents')
                || isMissingColumnError(lastError, 'base_price_cents')
                || isMissingColumnError(lastError, 'category')
                || isMissingColumnError(lastError, 'active')
                || isMissingColumnError(lastError, 'is_active');
            if (!missingColumn) throw lastError;
        }
    }

    return latest;
}

function serializeWorkUnit(u, { includeOccupant, occupantsByUnitId }) {
    const unitNumber = asNumber(u?.unit_number, 0);
    const code = toCode(u?.building, unitNumber);
    const capacity = toPositiveInt(u?.capacity, 1);
    const occupiedTenantIds = includeOccupant ? (occupantsByUnitId?.[u.id] || []) : [];
    const occupiedCount = Array.isArray(occupiedTenantIds) ? occupiedTenantIds.length : 0;
    const isFull = occupiedCount >= capacity;
    const isOccupied = occupiedCount > 0;
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
        capacity,
        price_cents: (priceCents ?? legacyCustomPriceCents) ?? null,
        display_price_cents: displayPriceCents,
        occupied_count: occupiedCount,
        slots_remaining: Math.max(0, capacity - occupiedCount),
        is_full: isFull,
        is_occupied: isOccupied,
        is_vacant: occupiedCount === 0,
        active,
        is_active: active,
        occupied_by_tenant_id: includeOccupant && Array.isArray(occupiedTenantIds) ? (occupiedTenantIds[0] || null) : null,
        occupied_by_tenant_ids: includeOccupant && Array.isArray(occupiedTenantIds) ? Array.from(new Set(occupiedTenantIds)) : []
    };
}

export async function GET(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const url = new URL(request.url);
    const includeOccupant = url.searchParams.get('includeOccupant') === '1';
    const includeInactive = url.searchParams.get('includeInactive') === '1';
    const includeBilling = url.searchParams.get('includeBilling') === '1';

    // The schema for work_units has varied during iteration (active vs is_active, custom_price_cents optional).
    // Use select('*') + JS filtering to avoid "column does not exist" errors.
    const { data: unitsRaw, error: unitsError } = await guard.admin
        .from('work_units')
        .select('*')
        .order('building', { ascending: true })
        .order('unit_number', { ascending: true });

    if (unitsError) return NextResponse.json({ error: unitsError.message }, { status: 500 });

    let occupantsByUnitId = {};
    let activeAllocations = [];

    if (includeOccupant || includeBilling) {
        const today = toIsoDate(new Date());
        const { data: allocations, error: allocationsError } = await guard.admin
            .from('work_unit_allocations')
            .select('work_unit_id, tenant_id')
            .lte('start_date', today)
            .or(`end_date.is.null,end_date.gt.${today}`);

        if (allocationsError) return NextResponse.json({ error: allocationsError.message }, { status: 500 });

        activeAllocations = Array.isArray(allocations) ? allocations : [];
        for (const row of activeAllocations) {
            if (!row?.work_unit_id) continue;
            if (!occupantsByUnitId[row.work_unit_id]) occupantsByUnitId[row.work_unit_id] = [];
            if (row.tenant_id) occupantsByUnitId[row.work_unit_id].push(row.tenant_id);
        }
    }

    const allSerialized = (unitsRaw || []).map(u => serializeWorkUnit(u, { includeOccupant: includeOccupant || includeBilling, occupantsByUnitId }));
    const unitsForResponse = allSerialized.filter(u => u && (includeInactive || (u.active ?? true) !== false));

    let metrics = null;

    if (includeBilling) {
        const activeUnits = allSerialized.filter(u => u && (u.active ?? true) !== false);
        const totalCapacity = activeUnits.reduce((acc, u) => acc + toPositiveInt(u?.capacity, 1), 0);
        const occupiedSlots = activeUnits.reduce((acc, u) => acc + toNonNegativeInt(u?.occupied_count, 0), 0);
        const occupancyRate = totalCapacity > 0 ? occupiedSlots / totalCapacity : 0;

        const weightByUnitId = new Map(
            activeUnits.map(u => [
                u.id,
                toNonNegativeInt(u?.display_price_cents ?? u?.price_cents ?? 0, 0)
            ])
        );

        const allocationsByTenant = new Map();
        const tenantIds = new Set();
        for (const row of activeAllocations || []) {
            const tenantId = row?.tenant_id;
            const unitId = row?.work_unit_id;
            if (!tenantId || !unitId) continue;
            tenantIds.add(tenantId);
            if (!allocationsByTenant.has(tenantId)) allocationsByTenant.set(tenantId, []);
            allocationsByTenant.get(tenantId).push(unitId);
        }

        const ownersByTenant = new Map();
        if (tenantIds.size) {
            const { data: ownerRows, error: ownerError } = await guard.admin
                .from('tenant_users')
                .select('tenant_id, user_id, role')
                .in('tenant_id', Array.from(tenantIds))
                .eq('role', 'owner');
            if (ownerError) return NextResponse.json({ error: ownerError.message }, { status: 500 });
            for (const row of ownerRows || []) {
                if (row?.tenant_id && row?.user_id) ownersByTenant.set(row.tenant_id, row.user_id);
            }
        }

        const ownerIdsForBilling = Array.from(new Set(Array.from(ownersByTenant.values()).filter(Boolean)));
        let membershipsByOwner = new Map();
        if (ownerIdsForBilling.length) {
            const { data: membershipRows, error: membershipError } = await guard.admin
                .from('memberships')
                .select('owner_id, status, monthly_amount_cents, updated_at, created_at')
                .in('owner_id', ownerIdsForBilling);
            if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
            membershipsByOwner = pickLatestMembershipByOwner(membershipRows || []);
        }

        // Total recurring revenue (MRR): sum latest live memberships (monthly_amount_cents).
        let totalRecurringRevenueCents = 0;
        {
            const { data: liveMemberships, error: liveError } = await guard.admin
                .from('memberships')
                .select('owner_id, monthly_amount_cents, updated_at, created_at')
                .eq('status', 'live');
            if (liveError) return NextResponse.json({ error: liveError.message }, { status: 500 });
            const latestLive = pickLatestMembershipByOwner(liveMemberships || []);
            for (const m of latestLive.values()) totalRecurringRevenueCents += toNonNegativeInt(m?.monthly_amount_cents, 0);
        }

        const billingByUnitId = new Map();
        for (const [tenantId, unitIds] of allocationsByTenant.entries()) {
            const ownerId = ownersByTenant.get(tenantId);
            if (!ownerId) continue;
            const membership = membershipsByOwner.get(ownerId);
            if (!membership || membership.status !== 'live') continue;
            const monthly = toNonNegativeInt(membership?.monthly_amount_cents, 0);
            if (!monthly) continue;

            const uniqueUnitIds = Array.from(new Set(unitIds)).filter(id => weightByUnitId.has(id));
            const allocation = allocateMembershipAcrossUnits({ totalCents: monthly, unitIds: uniqueUnitIds, weightByUnitId });
            for (const [unitId, cents] of allocation.entries()) {
                billingByUnitId.set(unitId, (billingByUnitId.get(unitId) || 0) + toNonNegativeInt(cents, 0));
            }
        }

        const units = unitsForResponse.map(u => ({
            ...u,
            billing_cents: billingByUnitId.get(u.id) || 0
        }));

        metrics = {
            occupancy_rate: occupancyRate,
            occupied_slots: occupiedSlots,
            total_capacity: totalCapacity,
            total_recurring_revenue_cents: totalRecurringRevenueCents
        };

        return NextResponse.json({ units, metrics });
    }

    return NextResponse.json({ units: unitsForResponse });
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
    const code = toCode(building, unitNumber);

    try {
        const created = await insertWorkUnit({
            guard,
            row: [
                {
                    building,
                    unit_number: unitNumber,
                    code,
                    label,
                    unit_type: unitType,
                    capacity
                },
                {
                    building,
                    unit_number: unitNumber,
                    label,
                    unit_type: unitType,
                    capacity
                }
            ]
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
