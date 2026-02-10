import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../_lib/supabaseAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_IMAGE_BUCKET = 'HIVE';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

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

function parseSupabaseStorageObjectUrl(value) {
    const raw = normalizeUrl(value);
    if (!raw) return null;
    if (!raw.startsWith('http://') && !raw.startsWith('https://')) return null;

    let url = null;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }

    const pathname = url.pathname || '';
    const match = pathname.match(/\/storage\/v1\/object\/(public|sign)\/([^/]+)\/(.+)$/);
    if (!match) return null;
    const bucket = normalizeUrl(match[2]);
    let decoded = match[3] || '';
    try {
        decoded = decodeURIComponent(decoded);
    } catch {}
    const path = normalizeUrl(decoded)?.replace(/^\/+/, '') || null;
    if (!bucket || !path) return null;
    return { bucket, path };
}

function resolveStorageObjectLocation({ storedImage, imageBucket, imagePath }) {
    const bucket = normalizeUrl(imageBucket) || DEFAULT_IMAGE_BUCKET;
    const pathFromColumn = normalizeUrl(imagePath)?.replace(/^\/+/, '') || null;
    if (pathFromColumn) return { bucket, path: pathFromColumn };

    const stored = normalizeUrl(storedImage);
    if (stored && !stored.startsWith('http://') && !stored.startsWith('https://') && !stored.startsWith('/')) {
        const path = stored.replace(/^\/+/, '');
        return path ? { bucket, path } : null;
    }

    return parseSupabaseStorageObjectUrl(stored);
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

        const units = [];
        const signTasks = [];

        for (const u of unitsRaw || []) {
            const isActive = u?.active ?? u?.is_active ?? true;
            if (isActive === false) continue;
            const capacity = toPositiveInt(u?.capacity, 1);
            const occupiedCount = occupantsByUnitId[u.id] || 0;
            const slotsRemaining = Math.max(0, capacity - occupiedCount);
            const isVacant = slotsRemaining > 0;
            if (!isVacant) continue;

            const displayPrice = u?.price_cents ?? u?.custom_price_cents ?? u?.base_price_cents ?? null;
            const imageBucket = normalizeUrl(u?.image_bucket);
            const imagePath = normalizeUrl(u?.image_path);
            const storedImage = normalizeUrl(u?.image);
            const location = resolveStorageObjectLocation({ storedImage, imageBucket, imagePath });

            let imageUrl = storedImage;
            if (location?.bucket && location?.path) {
                const { data } = admin.storage.from(location.bucket).getPublicUrl(location.path);
                imageUrl = normalizeUrl(data?.publicUrl) || imageUrl;
            }

            const unit = {
                id: u?.id,
                building: u?.building ?? null,
                unit_number: u?.unit_number ?? null,
                unit_type: u?.unit_type ?? null,
                slots_remaining: slotsRemaining,
                display_price_cents: displayPrice,
                image_url: imageUrl,
                signed_image_url: null
            };

            if (location?.bucket && location?.path && typeof admin.storage.from(location.bucket).createSignedUrl === 'function') {
                signTasks.push({ unit, location });
            }

            units.push(unit);
        }

        if (signTasks.length) {
            await Promise.allSettled(
                signTasks.map(async ({ unit, location }) => {
                    try {
                        const { data, error } = await admin.storage
                            .from(location.bucket)
                            .createSignedUrl(location.path, SIGNED_URL_TTL_SECONDS);
                        if (!error) unit.signed_image_url = normalizeUrl(data?.signedUrl);
                    } catch {}
                })
            );
        }

        const res = NextResponse.json({ units });
        res.headers.set('Cache-Control', 'no-store, max-age=0');
        return res;
    } catch (err) {
        return NextResponse.json({ error: err?.message || 'Failed to load availability.' }, { status: 500 });
    }
}
