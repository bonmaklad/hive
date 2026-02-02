import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../_lib/adminGuard';

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

export async function PATCH(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const itemId = params?.id;
    if (!itemId) return NextResponse.json({ error: 'Missing item id.' }, { status: 400 });

    const payload = await request.json().catch(() => ({}));
    const updates = {};

    if (payload?.title !== undefined) {
        const title = safeText(payload?.title, 120);
        if (!title) return NextResponse.json({ error: 'title is required.' }, { status: 400 });
        updates.title = title;
    }

    if (payload?.description !== undefined) {
        updates.description = safeText(payload?.description, 1200) || null;
    }

    if (payload?.image_url !== undefined) {
        updates.image_url = safeText(payload?.image_url, 1000) || null;
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
    return NextResponse.json({ item: data });
}

export async function DELETE(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const itemId = params?.id;
    if (!itemId) return NextResponse.json({ error: 'Missing item id.' }, { status: 400 });

    const { error } = await guard.admin.from('swag_items').delete().eq('id', itemId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
