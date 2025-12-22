import { createClient } from '@supabase/supabase-js';
import { unstable_noStore as noStore } from 'next/cache';

function isMissing(value) {
    const v = typeof value === 'string' ? value.trim() : '';
    if (!v) return true;
    if (v.toLowerCase() === 'undefined') return true;
    if (v.toLowerCase() === 'null') return true;
    return false;
}

function getEnv() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_KEY ||
        process.env.SERVICE_ROLE_KEY;

    if (isMissing(url)) throw new Error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)');
    if (isMissing(anonKey)) throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY');

    return { url, anonKey, serviceRoleKey: isMissing(serviceRoleKey) ? null : serviceRoleKey };
}

function createSupabaseReadClient() {
    const { url, anonKey, serviceRoleKey } = getEnv();
    const key = serviceRoleKey || anonKey;
    return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
}

function safeText(value, limit = 2000) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function toInt(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.floor(n);
}

function centsToDollarsInt(cents) {
    const n = toInt(cents);
    if (n == null) return null;
    return Math.round(n / 100);
}

function normalizeLayouts(value) {
    if (!value) return [];
    if (!Array.isArray(value)) return [];
    return value
        .map(item => ({
            label: safeText(item?.label, 120),
            capacity: safeText(item?.capacity, 120)
        }))
        .filter(item => item.label || item.capacity);
}

function normalizeStringList(value) {
    if (!value) return [];
    if (!Array.isArray(value)) return [];
    return value.map(v => safeText(v, 120)).filter(Boolean);
}

function serializeSpace(row) {
    const images = Array.isArray(row?.space_images) ? row.space_images : [];
    const imageUrls = images
        .slice()
        .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0))
        .map(img => safeText(img?.url, 2000))
        .filter(Boolean);

    const cover = safeText(row?.image, 2000) || imageUrls[0] || '';

    const pricing = {};
    const half = centsToDollarsInt(row?.pricing_half_day_cents);
    const full = centsToDollarsInt(row?.pricing_full_day_cents);
    const perEvent = centsToDollarsInt(row?.pricing_per_event_cents);
    if (half != null) pricing.halfDay = half;
    if (full != null) pricing.fullDay = full;
    if (perEvent != null) pricing.perEvent = perEvent;

    return {
        slug: row?.slug || null,
        title: row?.title || null,
        copy: row?.copy || '',
        capacity: row?.capacity || '',
        pricing,
        tokens_per_hour: row?.tokens_per_hour ?? null,
        headerImage: cover,
        image: cover,
        images: imageUrls.length ? imageUrls : (cover ? [cover] : []),
        layouts: normalizeLayouts(row?.layouts),
        highlights: normalizeStringList(row?.highlights),
        bestFor: normalizeStringList(row?.best_for)
    };
}

function groupImagesBySlug(imageRows) {
    const map = new Map();
    const list = Array.isArray(imageRows) ? imageRows : [];
    for (const img of list) {
        const slug = img?.space_slug || null;
        if (!slug) continue;
        if (!map.has(slug)) map.set(slug, []);
        map.get(slug).push(img);
    }
    for (const [slug, imgs] of map.entries()) {
        map.set(
            slug,
            imgs
                .slice()
                .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0))
        );
    }
    return map;
}

export async function getSpaces() {
    noStore();
    const supabase = createSupabaseReadClient();
    const { data, error } = await supabase
        .from('spaces')
        .select('slug, title, copy, capacity, pricing_half_day_cents, pricing_full_day_cents, pricing_per_event_cents, tokens_per_hour, image, layouts, highlights, best_for')
        .order('title', { ascending: true });
    if (error) throw new Error(error.message);

    const { data: images, error: imagesError } = await supabase
        .from('space_images')
        .select('space_slug, url, sort_order')
        .order('space_slug', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
    if (imagesError) throw new Error(imagesError.message);

    const bySlug = groupImagesBySlug(images || []);
    return (data || []).map(row => serializeSpace({ ...row, space_images: bySlug.get(row.slug) || [] }));
}

export async function getSpaceBySlug(slug) {
    noStore();
    const clean = safeText(slug, 80);
    if (!clean) return null;
    const supabase = createSupabaseReadClient();
    const { data, error } = await supabase
        .from('spaces')
        .select('slug, title, copy, capacity, pricing_half_day_cents, pricing_full_day_cents, pricing_per_event_cents, tokens_per_hour, image, layouts, highlights, best_for')
        .eq('slug', clean)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;

    const { data: images, error: imagesError } = await supabase
        .from('space_images')
        .select('url, sort_order')
        .eq('space_slug', clean)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
    if (imagesError) throw new Error(imagesError.message);

    return serializeSpace({ ...data, space_images: images || [] });
}

export async function getSpaceSlugs() {
    noStore();
    const supabase = createSupabaseReadClient();
    const { data, error } = await supabase.from('spaces').select('slug').order('slug', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map(r => r.slug).filter(Boolean);
}

export const bookingInclusions = [
    'Water + tea/coffee',
    'Hyperfibre connection',
    'Use of the Hive Lounge for breaks',
    'Disability access (elevator available if required)',
    'Outside catering or self-catering welcome (or we can arrange catering)'
];
