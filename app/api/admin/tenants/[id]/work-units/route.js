import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../_lib/adminGuard';

export const runtime = 'nodejs';

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

function uniqStrings(value) {
    const list = Array.isArray(value) ? value : [];
    const cleaned = list
        .map(v => (typeof v === 'string' ? v.trim() : ''))
        .filter(Boolean);
    return Array.from(new Set(cleaned));
}

function parseCode(code) {
    const raw = typeof code === 'string' ? code.trim() : '';
    if (!raw) return null;
    const [buildingRaw, unitRaw] = raw.split('.');
    if (!buildingRaw || unitRaw === undefined) return null;
    const building = buildingRaw.trim();
    const unitNumber = Number.parseInt(unitRaw.trim(), 10);
    if (!building) return null;
    if (!Number.isFinite(unitNumber)) return null;
    return { building, unitNumber, code: `${building}.${unitNumber}` };
}

async function loadTenantWorkUnitCodes({ guard, tenantId }) {
    const today = todayIso();
    const { data: allocations, error } = await guard.admin
        .from('work_unit_allocations')
        .select('work_unit:work_units(building, unit_number)')
        .eq('tenant_id', tenantId)
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gt.${today}`);

    if (error) throw new Error(error.message);

    const codes = (allocations || [])
        .map(row => row?.work_unit)
        .filter(Boolean)
        .map(wu => `${String(wu.building).trim()}.${String(wu.unit_number).trim()}`)
        .filter(Boolean);

    return Array.from(new Set(codes)).sort((a, b) => a.localeCompare(b));
}

export async function GET(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const tenantId = params?.id;
    if (!tenantId) return NextResponse.json({ error: 'Missing tenant id' }, { status: 400 });

    const { data: tenant, error: tenantError } = await guard.admin.from('tenants').select('id').eq('id', tenantId).maybeSingle();
    if (tenantError) return NextResponse.json({ error: tenantError.message }, { status: 500 });
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    try {
        const workUnitCodes = await loadTenantWorkUnitCodes({ guard, tenantId });
        return NextResponse.json({ ok: true, tenant_id: tenantId, work_unit_codes: workUnitCodes });
    } catch (err) {
        return NextResponse.json({ error: err?.message || 'Failed to load workspaces.' }, { status: 500 });
    }
}

export async function POST(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const tenantId = params?.id;
    if (!tenantId) return NextResponse.json({ error: 'Missing tenant id' }, { status: 400 });

    const payload = await request.json().catch(() => ({}));
    const parsedDesired = uniqStrings(payload?.codes)
        .map(parseCode)
        .filter(Boolean);
    const desiredCodes = parsedDesired.map(p => p.code);

    const { data: allUnits, error: allUnitsError } = await guard.admin
        .from('work_units')
        .select('*');

    if (allUnitsError) return NextResponse.json({ error: allUnitsError.message }, { status: 500 });

    const idByCode = new Map(
        (allUnits || [])
            .filter(u => u?.id && u?.building && u?.unit_number !== null && u?.unit_number !== undefined)
            .filter(u => (u?.active ?? u?.is_active ?? true) !== false)
            .map(u => [`${String(u.building).trim()}.${String(u.unit_number).trim()}`, u.id])
    );

    const missing = desiredCodes.filter(code => !idByCode.has(code));
    if (missing.length) return NextResponse.json({ error: `Unknown work unit codes: ${missing.join(', ')}` }, { status: 400 });

    const desiredUnitIds = desiredCodes.map(code => idByCode.get(code));

    // Check for conflicts: active allocations for requested units owned by other tenants.
    if (desiredUnitIds.length) {
        const today = todayIso();
        const { data: conflicts, error: conflictError } = await guard.admin
            .from('work_unit_allocations')
            .select('work_unit_id, tenant_id')
            .in('work_unit_id', desiredUnitIds)
            .lte('start_date', today)
            .or(`end_date.is.null,end_date.gt.${today}`);

        if (conflictError) return NextResponse.json({ error: conflictError.message }, { status: 500 });

        const occupiedByOther = (conflicts || []).filter(a => a.tenant_id && a.tenant_id !== tenantId);
        if (occupiedByOther.length) {
            const occupiedIds = occupiedByOther.map(a => a.work_unit_id);
            const { data: occupiedUnits } = await guard.admin.from('work_units').select('building, unit_number, id').in('id', occupiedIds);
            const occupiedCodes = (occupiedUnits || [])
                .map(u => (u?.building && (u?.unit_number === 0 || u?.unit_number) ? `${u.building}.${u.unit_number}` : null))
                .filter(Boolean);
            return NextResponse.json(
                { error: `Some units are already allocated: ${occupiedCodes.join(', ')}`, conflicts: occupiedCodes },
                { status: 409 }
            );
        }
    }

    // Load existing active allocations for this tenant.
    const today = todayIso();
    const { data: existingActive, error: existingError } = await guard.admin
        .from('work_unit_allocations')
        .select('id, work_unit_id')
        .eq('tenant_id', tenantId)
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gt.${today}`);

    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

    const existingUnitIds = new Set((existingActive || []).map(a => a.work_unit_id).filter(Boolean));

    const toEnd = (existingActive || []).filter(a => a.work_unit_id && !desiredUnitIds.includes(a.work_unit_id));
    const toAdd = desiredUnitIds.filter(id => !existingUnitIds.has(id));

    // End allocations not desired.
    if (toEnd.length) {
        const ids = toEnd.map(a => a.id);
        const { error: endError } = await guard.admin
            .from('work_unit_allocations')
            .update({ end_date: today })
            .in('id', ids);
        if (endError) return NextResponse.json({ error: endError.message }, { status: 500 });
    }

    // Add missing allocations.
    if (toAdd.length) {
        const rows = toAdd.map(work_unit_id => ({
            work_unit_id,
            tenant_id: tenantId,
            start_date: today
        }));
        const { error: insertError } = await guard.admin.from('work_unit_allocations').insert(rows);
        if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    let updatedCodes = desiredCodes;
    try {
        updatedCodes = await loadTenantWorkUnitCodes({ guard, tenantId });
    } catch (_) {}

    return NextResponse.json({
        ok: true,
        tenant_id: tenantId,
        work_unit_codes: updatedCodes,
        ended: toEnd.length,
        added: toAdd.length
    });
}
