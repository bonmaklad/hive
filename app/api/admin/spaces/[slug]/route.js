import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/adminGuard';

export const runtime = 'nodejs';

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
        is_visible: row?.is_visible !== false,
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

export async function PATCH(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const slug = safeText(params?.slug, 80);
    if (!slug) return NextResponse.json({ error: 'Missing space slug.' }, { status: 400 });

    const payload = await request.json().catch(() => ({}));

    const updates = {};
    if (payload?.is_visible !== undefined) {
        if (typeof payload.is_visible !== 'boolean') {
            return NextResponse.json({ error: 'is_visible must be a boolean.' }, { status: 400 });
        }
        updates.is_visible = payload.is_visible;
    }
    if (payload?.title !== undefined) {
        const title = safeText(payload?.title, 120);
        if (!title) return NextResponse.json({ error: 'title is required.' }, { status: 400 });
        updates.title = title;
    }

    if (payload?.tokens_per_hour !== undefined) {
        const tokensPerHour = toIntOrNull(payload?.tokens_per_hour);
        if (tokensPerHour == null) return NextResponse.json({ error: 'tokens_per_hour must be a number.' }, { status: 400 });
        if (tokensPerHour < 0) return NextResponse.json({ error: 'tokens_per_hour must be >= 0.' }, { status: 400 });
        updates.tokens_per_hour = tokensPerHour;
    }

    if (payload?.pricing_half_day_cents !== undefined) {
        const v = toIntOrNull(payload?.pricing_half_day_cents);
        if (v != null && v < 0) return NextResponse.json({ error: 'pricing_half_day_cents must be >= 0.' }, { status: 400 });
        updates.pricing_half_day_cents = v;
    }
    if (payload?.pricing_full_day_cents !== undefined) {
        const v = toIntOrNull(payload?.pricing_full_day_cents);
        if (v != null && v < 0) return NextResponse.json({ error: 'pricing_full_day_cents must be >= 0.' }, { status: 400 });
        updates.pricing_full_day_cents = v;
    }
    if (payload?.pricing_per_event_cents !== undefined) {
        const v = toIntOrNull(payload?.pricing_per_event_cents);
        if (v != null && v < 0) return NextResponse.json({ error: 'pricing_per_event_cents must be >= 0.' }, { status: 400 });
        updates.pricing_per_event_cents = v;
    }

    if (payload?.image !== undefined) {
        updates.image = safeText(payload?.image, 1000) || null;
    }

    if (payload?.copy !== undefined) {
        updates.copy = safeText(payload?.copy, 1200) || null;
    }
    if (payload?.capacity !== undefined) {
        updates.capacity = safeText(payload?.capacity, 200) || null;
    }
    if (payload?.layouts !== undefined) {
        updates.layouts = normalizeLayouts(payload?.layouts);
    }
    if (payload?.highlights !== undefined) {
        updates.highlights = normalizeStringList(payload?.highlights);
    }
    if (payload?.best_for !== undefined) {
        updates.best_for = normalizeStringList(payload?.best_for);
    }

    if (!Object.keys(updates).length) {
        return NextResponse.json({ error: 'No updates provided.' }, { status: 400 });
    }

    const { data, error } = await guard.admin
        .from('spaces')
        .update(updates)
        .eq('slug', slug)
        .is('deleted_at', null)
        .select(
            'slug, title, is_visible, tokens_per_hour, pricing_half_day_cents, pricing_full_day_cents, pricing_per_event_cents, image, copy, capacity, layouts, highlights, best_for, created_at, updated_at, space_images(id, url, sort_order, alt, bucket, path)'
        )
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Space not found.' }, { status: 404 });
    return NextResponse.json({ ok: true, space: serializeSpace(data) });
}

export async function DELETE(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const slug = safeText(params?.slug, 80);
    if (!slug) return NextResponse.json({ error: 'Missing space slug.' }, { status: 400 });

    // Keep the referenced row so bookings, payments, and invoices retain their history.
    const { error } = await guard.admin
        .from('spaces')
        .update({ deleted_at: new Date().toISOString(), is_visible: false })
        .eq('slug', slug)
        .is('deleted_at', null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
