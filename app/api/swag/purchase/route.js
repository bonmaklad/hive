import { NextResponse } from 'next/server';
import { requireTenantContext } from '../../rooms/_lib/tenantBilling';
import { fetchCreditsSummary } from '../../rooms/_lib/credits';
import { sendContactStyleWebhook } from '../../_lib/contactWebhook';

export const runtime = 'nodejs';

function safeText(value, limit = 120) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function toInt(value, fallback = 0) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
}

export async function POST(request) {
    const ctx = await requireTenantContext(request);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const payload = await request.json().catch(() => ({}));
    const itemId = safeText(payload?.item_id, 80);
    const quantity = Math.max(1, toInt(payload?.quantity, 1));

    if (!itemId) return NextResponse.json({ error: 'item_id is required.' }, { status: 400 });

    const { data: item, error: itemError } = await ctx.admin
        .from('swag_items')
        .select('id, title, description, image_url, tokens_cost, stock_qty, stock_unlimited, is_active')
        .eq('id', itemId)
        .maybeSingle();

    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });
    if (!item || !item.is_active) return NextResponse.json({ error: 'Item is not available.' }, { status: 404 });

    const tokensPerItem = Math.max(0, toInt(item.tokens_cost, 0));
    const totalTokens = Math.max(0, tokensPerItem * quantity);

    if (!item.stock_unlimited) {
        const available = Math.max(0, toInt(item.stock_qty, 0));
        if (available < quantity) {
            return NextResponse.json({ error: 'Not enough stock available.' }, { status: 400 });
        }
    }

    const credits = await fetchCreditsSummary({ admin: ctx.admin, ownerId: ctx.tokenOwnerId });
    if (!credits.ok) return NextResponse.json({ error: credits.error }, { status: 500 });

    if (credits.tokensLeft < totalTokens) {
        return NextResponse.json({ error: 'Not enough tokens available.' }, { status: 400 });
    }

    const latestPeriodStart = credits.latestRow?.period_start || null;
    if (!latestPeriodStart) {
        return NextResponse.json({ error: 'No token credits configured for this account.' }, { status: 400 });
    }

    let stockUpdated = false;
    if (!item.stock_unlimited) {
        const available = Math.max(0, toInt(item.stock_qty, 0));
        const nextStock = Math.max(0, available - quantity);
        const { data: stockRow, error: stockError } = await ctx.admin
            .from('swag_items')
            .update({ stock_qty: nextStock })
            .eq('id', item.id)
            .eq('stock_qty', available)
            .select('id')
            .maybeSingle();
        if (stockError) return NextResponse.json({ error: stockError.message }, { status: 500 });
        if (!stockRow?.id) return NextResponse.json({ error: 'Stock just changed. Please retry.' }, { status: 409 });
        stockUpdated = true;
    }

    const currentUsed = Math.max(0, toInt(credits.latestRow?.tokens_used, 0));
    const nextUsed = currentUsed + totalTokens;
    const { error: updateError } = await ctx.admin
        .from('room_credits')
        .update({ tokens_used: nextUsed })
        .eq('owner_id', ctx.tokenOwnerId)
        .eq('period_start', latestPeriodStart);

    if (updateError) {
        if (stockUpdated) {
            await ctx.admin.from('swag_items').update({ stock_qty: item.stock_qty }).eq('id', item.id);
        }
        return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const snapshot = {
        title: item.title,
        description: item.description,
        image_url: item.image_url,
        tokens_cost: tokensPerItem
    };

    const { data: order, error: orderError } = await ctx.admin
        .from('swag_orders')
        .insert({
            item_id: item.id,
            purchaser_id: ctx.user.id,
            token_owner_id: ctx.tokenOwnerId,
            tenant_id: ctx.tenantId,
            token_period_start: latestPeriodStart,
            quantity,
            unit_tokens: tokensPerItem,
            tokens_cost: totalTokens,
            status: 'placed',
            item_snapshot: snapshot
        })
        .select('id')
        .single();

    if (orderError) {
        await ctx.admin
            .from('room_credits')
            .update({ tokens_used: currentUsed })
            .eq('owner_id', ctx.tokenOwnerId)
            .eq('period_start', latestPeriodStart);
        if (stockUpdated) {
            await ctx.admin.from('swag_items').update({ stock_qty: item.stock_qty }).eq('id', item.id);
        }
        return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    let memberName = 'HIVE member';
    let memberEmail = safeText(ctx.user?.email || '', 254) || 'info@hivehq.nz';
    try {
        const { data: profile } = await ctx.admin.from('profiles').select('name, email').eq('id', ctx.user.id).maybeSingle();
        memberName = safeText(profile?.name || ctx.user?.user_metadata?.name || memberName, 120) || 'HIVE member';
        memberEmail = safeText(profile?.email || memberEmail, 254) || 'info@hivehq.nz';
    } catch {
        // best-effort only
    }

    const webhookMessage = [
        'Source: Platform SWAG purchase',
        `Order ID: ${order?.id || 'n/a'}`,
        `Member ID: ${ctx.user.id}`,
        `Member email: ${memberEmail}`,
        `Tenant ID: ${ctx.tenantId}`,
        `Item: ${safeText(item.title || item.id, 200)}`,
        `Quantity: ${quantity}`,
        `Unit tokens: ${tokensPerItem}`,
        `Total tokens charged: ${totalTokens}`,
        `Token period start: ${latestPeriodStart}`,
        `Purchased at: ${new Date().toISOString()}`
    ].join('\n');

    void sendContactStyleWebhook({
        name: memberName,
        email: memberEmail,
        subject: 'Platform purchase: SWAG',
        from: 'HIVE Platform',
        message: webhookMessage
    });

    return NextResponse.json({
        ok: true,
        order_id: order?.id || null,
        tokens_left: Math.max(0, credits.tokensLeft - totalTokens)
    });
}
