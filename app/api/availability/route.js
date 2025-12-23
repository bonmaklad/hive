import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../_lib/supabaseAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toIsoDate(date) {
    return date.toISOString().slice(0, 10);
}

function toPositiveInt(value, fallback = 1) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.floor(n));
}

export async function GET() {
    try {
        const admin = createSupabaseAdminClient();
        const today = toIsoDate(new Date());

        const { data: unitsRaw, error: unitsError } = await admin
            .from('work_units')
            .select('id, building, unit_number, unit_type, capacity, base_price_cents, custom_price_cents')
            .order('building', { ascending: true })
            .order('unit_number', { ascending: true });
        if (unitsError) {
            return NextResponse.json({ error: unitsError.message }, { status: 500 });
        }

        const { data: activeAllocations, error: allocationsError } = await admin
            .from('work_unit_allocations')
            .select('work_unit_id')
            .lte('start_date', today)
            .or(`end_date.is.null,end_date.gt.${today}`);
        if (allocationsError) {
            return NextResponse.json({ error: allocationsError.message }, { status: 500 });
        }

        const occupantsByUnitId = {};
        for (const row of activeAllocations || []) {
            if (!row?.work_unit_id) continue;
            occupantsByUnitId[row.work_unit_id] = (occupantsByUnitId[row.work_unit_id] || 0) + 1;
        }

        const units = (unitsRaw || [])
            .map(u => {
                const capacity = toPositiveInt(u?.capacity, 1);
                const occupiedCount = occupantsByUnitId[u.id] || 0;
                const slotsRemaining = Math.max(0, capacity - occupiedCount);
                const displayPrice = u?.custom_price_cents ?? u?.base_price_cents ?? null;
                const isVacant = slotsRemaining > 0;
                return isVacant
                    ? {
                          id: u?.id,
                          building: u?.building ?? null,
                          unit_number: u?.unit_number ?? null,
                          unit_type: u?.unit_type ?? null,
                          slots_remaining: slotsRemaining,
                          display_price_cents: displayPrice
                      }
                    : null;
            })
            .filter(Boolean);

        const res = NextResponse.json({ units });
        res.headers.set('Cache-Control', 'no-store, max-age=0');
        return res;
    } catch (err) {
        return NextResponse.json({ error: err?.message || 'Failed to load availability.' }, { status: 500 });
    }
}
