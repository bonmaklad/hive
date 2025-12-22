import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/adminGuard';

export const runtime = 'nodejs';

const UNIT_TYPES = ['premium_office', 'private_office', 'desk', 'desk_pod', 'small_office'];

function safeText(value, limit = 200) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
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

async function updateWorkUnitColumns({ guard, id, updates }) {
    const { data, error } = await guard.admin.from('work_units').update(updates).eq('id', id).select('*').single();
    if (error) throw new Error(error.message);
    return data;
}

function isMissingColumnError(err) {
    const msg = String(err?.message || '');
    return msg.includes('column') && msg.includes('does not exist');
}

async function applyOptionalUpdates({ guard, id, payload }) {
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
                if (!isMissingColumnError(err)) break;
            }
        }
        if (!succeeded && lastError && !isMissingColumnError(lastError)) throw lastError;
    }
    return latest;
}

export async function PATCH(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const id = safeText(params?.id, 80);
    if (!id) return NextResponse.json({ error: 'Missing work unit id.' }, { status: 400 });

    const payload = await request.json().catch(() => ({}));
    const updates = {};
    let touchedUnitType = false;

    if (payload?.building !== undefined) {
        const building = safeText(payload?.building, 120);
        if (!building) return NextResponse.json({ error: 'building is required.' }, { status: 400 });
        updates.building = building;
    }

    if (payload?.unit_number !== undefined) {
        const unitNumber = toIntOrNull(payload?.unit_number);
        if (unitNumber == null) return NextResponse.json({ error: 'unit_number must be a number.' }, { status: 400 });
        updates.unit_number = unitNumber;
    }

    if (payload?.label !== undefined) {
        const label = safeText(payload?.label, 120);
        if (!label) return NextResponse.json({ error: 'label is required.' }, { status: 400 });
        updates.label = label;
    }

    if (payload?.unit_type !== undefined) {
        const unitType = safeText(payload?.unit_type, 60);
        if (!unitType) return NextResponse.json({ error: 'unit_type is required.' }, { status: 400 });
        if (UNIT_TYPES.length && !UNIT_TYPES.includes(unitType)) {
            return NextResponse.json({ error: `unit_type must be one of: ${UNIT_TYPES.join(', ')}` }, { status: 400 });
        }
        updates.unit_type = unitType;
        touchedUnitType = true;
    }

    if (payload?.capacity !== undefined) {
        const capacity = toIntOrNull(payload?.capacity);
        if (capacity == null) return NextResponse.json({ error: 'capacity must be a number.' }, { status: 400 });
        if (capacity < 1) return NextResponse.json({ error: 'capacity must be >= 1.' }, { status: 400 });
        updates.capacity = capacity;
    }

    if (touchedUnitType && payload?.label === undefined) {
        updates.label = updates.unit_type;
    }

    let latest = null;
    try {
        if (Object.keys(updates).length) {
            latest = await updateWorkUnitColumns({ guard, id, updates });
        }

        latest = (await applyOptionalUpdates({ guard, id, payload })) || latest;

        if (!latest) {
            const { data, error } = await guard.admin.from('work_units').select('*').eq('id', id).maybeSingle();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            if (!data) return NextResponse.json({ error: 'Work unit not found.' }, { status: 404 });
            latest = data;
        }

        return NextResponse.json({ ok: true, unit: latest });
    } catch (err) {
        return NextResponse.json({ error: err?.message || 'Failed to update work unit.' }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const id = safeText(params?.id, 80);
    if (!id) return NextResponse.json({ error: 'Missing work unit id.' }, { status: 400 });

    const { error } = await guard.admin.from('work_units').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
