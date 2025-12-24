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

function normalizeUrl(value) {
    const v = typeof value === 'string' ? value.trim() : '';
    if (!v) return null;
    const lower = v.toLowerCase();
    if (lower === 'null' || lower === 'undefined') return null;
    return v;
}

async function loadWorkUnits(admin) {
    const { data, error } = await admin
        .from('work_units')
        .select('*')
        .order('building', { ascending: true })
        .order('unit_number', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
}

export async function GET() {
    try {
        const admin = createSupabaseAdminClient();
        const today = toIsoDate(new Date());

        const unitsRaw = await loadWorkUnits(admin);

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
                const isActive = u?.is_active ?? true;
                if (isActive === false) return null;
                const capacity = toPositiveInt(u?.capacity, 1);
                const occupiedCount = occupantsByUnitId[u.id] || 0;
                const slotsRemaining = Math.max(0, capacity - occupiedCount);
                const displayPrice = u?.price_cents ?? u?.custom_price_cents ?? u?.base_price_cents ?? null;
                const imageBucket = normalizeUrl(u?.image_bucket);
                const imagePath = normalizeUrl(u?.image_path);
                const storedImage = normalizeUrl(u?.image);
                let imageUrl = storedImage;

                // If `image` contains a storage path (common in some setups), treat it as a path.
                if (imageUrl && !imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('/')) {
                    const bucket = imageBucket || 'HIVE';
                    const { data } = admin.storage.from(bucket).getPublicUrl(imageUrl);
                    imageUrl = normalizeUrl(data?.publicUrl);
                } else if (!imageUrl && imageBucket && imagePath) {
                    const { data } = admin.storage.from(imageBucket).getPublicUrl(imagePath);
                    imageUrl = normalizeUrl(data?.publicUrl);
                }

                const isVacant = slotsRemaining > 0;
                return isVacant
                    ? {
                          id: u?.id,
                          building: u?.building ?? null,
                          unit_number: u?.unit_number ?? null,
                          unit_type: u?.unit_type ?? null,
                          slots_remaining: slotsRemaining,
                          display_price_cents: displayPrice,
                          image_url: imageUrl
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
