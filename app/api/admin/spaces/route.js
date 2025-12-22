import { NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/adminGuard';

export const runtime = 'nodejs';

function safeText(value, limit = 200) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function normalizeSlug(value) {
    const slug = safeText(value, 80).toLowerCase();
    if (!slug) return { ok: false, error: 'slug is required.' };
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        return { ok: false, error: 'slug must be lowercase kebab-case (letters, numbers, hyphens).' };
    }
    return { ok: true, slug };
}

function toIntOrNull(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && !value.trim()) return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.floor(n);
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
    const sorted = images
        .slice()
        .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0))
        .map(img => ({
            id: img?.id || null,
            url: img?.url || null,
            sort_order: img?.sort_order ?? 0,
            alt: img?.alt || null,
            bucket: img?.bucket || null,
            path: img?.path || null
        }))
        .filter(img => typeof img.url === 'string' && img.url);

    const cover = safeText(row?.image, 1000) || (sorted[0]?.url || null);

    return {
        slug: row?.slug || null,
        title: row?.title || null,
        tokens_per_hour: row?.tokens_per_hour ?? null,
        pricing_half_day_cents: row?.pricing_half_day_cents ?? null,
        pricing_full_day_cents: row?.pricing_full_day_cents ?? null,
        pricing_per_event_cents: row?.pricing_per_event_cents ?? null,
        image: cover,
        copy: row?.copy || null,
        capacity: row?.capacity || null,
        layouts: Array.isArray(row?.layouts) ? row.layouts : (row?.layouts || []),
        highlights: Array.isArray(row?.highlights) ? row.highlights : (row?.highlights || []),
        best_for: Array.isArray(row?.best_for) ? row.best_for : (row?.best_for || []),
        created_at: row?.created_at || null,
        updated_at: row?.updated_at || null,
        images: sorted
    };
}

export async function GET(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const { data, error } = await guard.admin
        .from('spaces')
        .select(
            'slug, title, tokens_per_hour, pricing_half_day_cents, pricing_full_day_cents, pricing_per_event_cents, image, copy, capacity, layouts, highlights, best_for, created_at, updated_at, space_images(id, url, sort_order, alt, bucket, path)'
        )
        .order('title', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ spaces: (data || []).map(serializeSpace) });
}

export async function POST(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const payload = await request.json().catch(() => ({}));
    const slugCheck = normalizeSlug(payload?.slug);
    if (!slugCheck.ok) return NextResponse.json({ error: slugCheck.error }, { status: 400 });

    const title = safeText(payload?.title, 120);
    if (!title) return NextResponse.json({ error: 'title is required.' }, { status: 400 });

    const tokensPerHour = toIntOrNull(payload?.tokens_per_hour);
    if (tokensPerHour != null && tokensPerHour < 0) return NextResponse.json({ error: 'tokens_per_hour must be >= 0.' }, { status: 400 });

    const half = toIntOrNull(payload?.pricing_half_day_cents);
    const full = toIntOrNull(payload?.pricing_full_day_cents);
    const perEvent = toIntOrNull(payload?.pricing_per_event_cents);
    for (const [k, v] of Object.entries({ pricing_half_day_cents: half, pricing_full_day_cents: full, pricing_per_event_cents: perEvent })) {
        if (v != null && v < 0) return NextResponse.json({ error: `${k} must be >= 0.` }, { status: 400 });
    }

    const row = {
        slug: slugCheck.slug,
        title,
        tokens_per_hour: tokensPerHour ?? 1,
        pricing_half_day_cents: half,
        pricing_full_day_cents: full,
        pricing_per_event_cents: perEvent,
        image: safeText(payload?.image, 1000) || null,
        copy: safeText(payload?.copy, 1200) || null,
        capacity: safeText(payload?.capacity, 200) || null,
        layouts: normalizeLayouts(payload?.layouts),
        highlights: normalizeStringList(payload?.highlights),
        best_for: normalizeStringList(payload?.best_for)
    };

    try {
        const { data, error } = await guard.admin
            .from('spaces')
            .insert(row)
            .select(
                'slug, title, tokens_per_hour, pricing_half_day_cents, pricing_full_day_cents, pricing_per_event_cents, image, copy, capacity, layouts, highlights, best_for, created_at, updated_at, space_images(id, url, sort_order, alt, bucket, path)'
            )
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, space: serializeSpace(data) });
    } catch (err) {
        return NextResponse.json({ error: err?.message || 'Failed to create space.' }, { status: 500 });
    }
}
