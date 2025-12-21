import { NextResponse } from 'next/server';
import { requireTenantContext } from '../_lib/tenantBilling';
import { monthStart } from '../_lib/bookingMath';

export const runtime = 'nodejs';

export async function GET(request) {
    const ctx = await requireTenantContext(request);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const url = new URL(request.url);
    const date = url.searchParams.get('date') || '';
    const periodStart = monthStart(date);
    if (!periodStart) return NextResponse.json({ error: 'Invalid date (expected YYYY-MM-DD).' }, { status: 400 });

    const { data: credits, error: creditsError } = await ctx.admin
        .from('room_credits')
        .select('tokens_total, tokens_used')
        .eq('owner_id', ctx.tokenOwnerId)
        .eq('period_start', periodStart)
        .maybeSingle();

    if (creditsError) return NextResponse.json({ error: creditsError.message }, { status: 500 });

    const total = credits?.tokens_total ?? 0;
    const used = credits?.tokens_used ?? 0;
    const left = Math.max(0, total - used);

    return NextResponse.json({
        ok: true,
        tenant_id: ctx.tenantId,
        token_owner_id: ctx.tokenOwnerId,
        period_start: periodStart,
        tokens_total: total,
        tokens_used: used,
        tokens_left: left
    });
}

