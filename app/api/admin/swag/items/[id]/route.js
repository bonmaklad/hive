import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../_lib/adminGuard';

export const runtime = 'nodejs';
const DEFAULT_SWAG_BUCKET = process.env.SUPABASE_SWAG_BUCKET || process.env.SUPABASE_WORK_UNITS_BUCKET || 'HIVE';

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

function parseStorageObjectLocation(value) {
    const raw = safeText(value, 2000);
    if (!raw) return null;

    if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
        const pathOnly = raw.replace(/^\/+/, '');
        if (!pathOnly) return null;
        return { bucket: DEFAULT_SWAG_BUCKET, path: pathOnly };
    }

    let url = null;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }

    const pathname = url.pathname || '';
    const match = pathname.match(/\/storage\/v1\/object\/(public|sign)\/([^/]+)\/(.+)$/);
    if (!match) return null;
    const bucket = safeText(match[2], 200);
    let decoded = match[3] || '';
    try {
        decoded = decodeURIComponent(decoded);
    } catch {}
    const path = safeText(decoded, 2000).replace(/^\/+/, '');
    if (!bucket || !path) return null;
    return { bucket, path };
}

export async function PATCH(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const itemId = params?.id;
    if (!itemId) return NextResponse.json({ error: 'Missing item id.' }, { status: 400 });

    const payload = await request.json().catch(() => ({}));
    const updates = {};
    let existingImageUrl = null;
    let nextImageUrl = null;

    if (payload?.title !== undefined) {
        const title = safeText(payload?.title, 120);
        if (!title) return NextResponse.json({ error: 'title is required.' }, { status: 400 });
        updates.title = title;
    }

    if (payload?.description !== undefined) {
        updates.description = safeText(payload?.description, 1200) || null;
    }

    if (payload?.image_url !== undefined) {
        const { data: existing, error: existingError } = await guard.admin
            .from('swag_items')
            .select('image_url')
            .eq('id', itemId)
            .maybeSingle();
        if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
        existingImageUrl = safeText(existing?.image_url, 2000) || null;
        nextImageUrl = safeText(payload?.image_url, 1000) || null;
        updates.image_url = nextImageUrl;
    }

    if (payload?.tokens_cost !== undefined) {
        const tokensCost = toIntOrNull(payload?.tokens_cost);
        if (tokensCost == null || tokensCost < 0) {
            return NextResponse.json({ error: 'tokens_cost must be >= 0.' }, { status: 400 });
        }
        updates.tokens_cost = tokensCost;
    }

    if (payload?.stock_qty !== undefined) {
        const stockQty = toIntOrNull(payload?.stock_qty);
        if (stockQty == null || stockQty < 0) {
            return NextResponse.json({ error: 'stock_qty must be >= 0.' }, { status: 400 });
        }
        updates.stock_qty = stockQty;
    }

    if (payload?.stock_unlimited !== undefined) {
        updates.stock_unlimited = Boolean(payload?.stock_unlimited);
    }

    if (payload?.is_active !== undefined) {
        updates.is_active = Boolean(payload?.is_active);
    }

    if (!Object.keys(updates).length) {
        return NextResponse.json({ error: 'No updates provided.' }, { status: 400 });
    }

    const { data, error } = await guard.admin
        .from('swag_items')
        .update(updates)
        .eq('id', itemId)
        .select('id, title, description, image_url, tokens_cost, stock_qty, stock_unlimited, is_active, created_at, updated_at')
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (payload?.image_url !== undefined && existingImageUrl && existingImageUrl !== nextImageUrl) {
        const oldLocation = parseStorageObjectLocation(existingImageUrl);
        if (oldLocation?.bucket && oldLocation?.path) {
            try {
                await guard.admin.storage.from(oldLocation.bucket).remove([oldLocation.path]);
            } catch {}
        }
    }

    return NextResponse.json({ item: data });
}

export async function DELETE(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const itemId = params?.id;
    if (!itemId) return NextResponse.json({ error: 'Missing item id.' }, { status: 400 });

    const { data: existing, error: existingError } = await guard.admin
        .from('swag_items')
        .select('image_url')
        .eq('id', itemId)
        .maybeSingle();
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

    const { error } = await guard.admin.from('swag_items').delete().eq('id', itemId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const location = parseStorageObjectLocation(existing?.image_url);
    if (location?.bucket && location?.path) {
        try {
            await guard.admin.storage.from(location.bucket).remove([location.path]);
        } catch {}
    }

    return NextResponse.json({ ok: true });
}
