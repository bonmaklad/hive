import { NextResponse } from 'next/server';
import { requireTenantContext } from '../_lib/tenantBilling';
import { fetchCreditsSummary } from '../_lib/credits';

export const runtime = 'nodejs';

export async function GET(request) {
    const ctx = await requireTenantContext(request);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const credits = await fetchCreditsSummary({ admin: ctx.admin, ownerId: ctx.tokenOwnerId });
    if (!credits.ok) return NextResponse.json({ error: credits.error }, { status: 500 });

    return NextResponse.json({
        ok: true,
        tenant_id: ctx.tenantId,
        token_owner_id: ctx.tokenOwnerId,
        period_start: credits.latestRow?.period_start || null,
        tokens_total: credits.tokensTotal,
        tokens_used: credits.tokensUsed,
        tokens_left: credits.tokensLeft
    });
}
