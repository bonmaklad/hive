import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/adminGuard';

export const runtime = 'nodejs';

function safeText(value, limit = 200) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function toInt(value, fallback = 0) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
}

export async function GET(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const { data, error } = await guard.admin
        .from('swag_items')
        .select('id, title, description, image_url, tokens_cost, stock_qty, stock_unlimited, is_active, created_at, updated_at')
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data || [] });
}

export async function POST(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const payload = await request.json().catch(() => ({}));
    const title = safeText(payload?.title, 120);
    const description = safeText(payload?.description, 1200);
    const imageUrl = safeText(payload?.image_url, 1000) || null;
    const tokensCost = toInt(payload?.tokens_cost, NaN);
    const isActive = payload?.is_active === undefined ? true : Boolean(payload?.is_active);
    const stockQty = toInt(payload?.stock_qty, 0);
    const stockUnlimited = Boolean(payload?.stock_unlimited);

    if (!title) return NextResponse.json({ error: 'title is required.' }, { status: 400 });
    if (!Number.isFinite(tokensCost) || tokensCost < 0) {
        return NextResponse.json({ error: 'tokens_cost must be >= 0.' }, { status: 400 });
    }
    if (!Number.isFinite(stockQty) || stockQty < 0) {
        return NextResponse.json({ error: 'stock_qty must be >= 0.' }, { status: 400 });
    }

    const { data, error } = await guard.admin
        .from('swag_items')
        .insert({
            title,
            description: description || null,
            image_url: imageUrl,
            tokens_cost: tokensCost,
            stock_qty: stockQty,
            stock_unlimited: stockUnlimited,
            is_active: isActive,
            created_by: guard.user.id
        })
        .select('id, title, description, image_url, tokens_cost, stock_qty, stock_unlimited, is_active, created_at, updated_at')
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
}
