import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../_lib/adminGuard';

export const runtime = 'nodejs';

function safeText(value, limit = 30) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function toInt(value, fallback = 0) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
}

export async function PATCH(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const orderId = params?.id;
    if (!orderId) return NextResponse.json({ error: 'Missing order id.' }, { status: 400 });

    const payload = await request.json().catch(() => ({}));
    const statusRaw = payload?.status;
    const status = statusRaw !== undefined ? safeText(statusRaw, 30) : null;
    const adminNotes = payload?.admin_notes;
    if (status && !['placed', 'fulfilled', 'cancelled'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
    }
    if (status === null && adminNotes === undefined) {
        return NextResponse.json({ error: 'No updates provided.' }, { status: 400 });
    }

    const { data: order, error: orderError } = await guard.admin
        .from('swag_orders')
        .select('id, status, item_id, quantity, unit_tokens, tokens_cost, token_owner_id, token_period_start, admin_notes')
        .eq('id', orderId)
        .maybeSingle();

    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });
    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

    if (status && order.status === status && adminNotes === undefined) {
        return NextResponse.json({ order });
    }

    if (status && order.status === 'cancelled' && status !== 'cancelled') {
        return NextResponse.json({ error: 'Cancelled orders cannot be updated.' }, { status: 400 });
    }

    if (status === 'cancelled' && order.status !== 'cancelled') {
        const { data: item, error: itemError } = await guard.admin
            .from('swag_items')
            .select('id, stock_qty, stock_unlimited')
            .eq('id', order.item_id)
            .maybeSingle();
        if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });

        const qty = Math.max(1, toInt(order.quantity, 1));
        if (item && !item.stock_unlimited) {
            const nextStock = Math.max(0, toInt(item.stock_qty, 0) + qty);
            const { error: stockError } = await guard.admin.from('swag_items').update({ stock_qty: nextStock }).eq('id', item.id);
            if (stockError) return NextResponse.json({ error: stockError.message }, { status: 500 });
        }

        const periodStart = order.token_period_start;
        const { data: creditsRow, error: creditsError } = await guard.admin
            .from('room_credits')
            .select('tokens_used')
            .eq('owner_id', order.token_owner_id)
            .eq('period_start', periodStart)
            .maybeSingle();

        if (creditsError) return NextResponse.json({ error: creditsError.message }, { status: 500 });
        if (!creditsRow) return NextResponse.json({ error: 'Token credits not found for this period.' }, { status: 404 });

        const currentUsed = Math.max(0, toInt(creditsRow.tokens_used, 0));
        const refundTokens = Math.max(0, toInt(order.tokens_cost, 0));
        const nextUsed = Math.max(0, currentUsed - refundTokens);
        const { error: refundError } = await guard.admin
            .from('room_credits')
            .update({ tokens_used: nextUsed })
            .eq('owner_id', order.token_owner_id)
            .eq('period_start', periodStart);

        if (refundError) return NextResponse.json({ error: refundError.message }, { status: 500 });
    }

    const updates = {};
    if (status) {
        updates.status = status;
        if (status === 'fulfilled') {
            updates.fulfilled_at = new Date().toISOString();
            updates.cancelled_at = null;
        }
        if (status === 'cancelled') {
            updates.cancelled_at = new Date().toISOString();
            updates.fulfilled_at = null;
        }
        if (status === 'placed') {
            updates.fulfilled_at = null;
            updates.cancelled_at = null;
        }
    }
    if (adminNotes !== undefined) {
        const clean = typeof adminNotes === 'string' ? adminNotes.trim() : '';
        updates.admin_notes = clean || null;
    }

    const { data, error } = await guard.admin
        .from('swag_orders')
        .update(updates)
        .eq('id', orderId)
        .select('id, status, fulfilled_at, cancelled_at, admin_notes')
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ order: data });
}
