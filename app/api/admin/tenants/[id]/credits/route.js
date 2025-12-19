import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../_lib/adminGuard';

export const runtime = 'nodejs';

function parseDate(value) {
    const v = typeof value === 'string' ? value : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    return v;
}

export async function POST(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const tenantId = params?.id;
    if (!tenantId) return NextResponse.json({ error: 'Missing tenant id' }, { status: 400 });

    const payload = await request.json().catch(() => ({}));
    const ownerId = typeof payload?.owner_id === 'string' ? payload.owner_id : null;
    const periodStart = parseDate(payload?.period_start);
    const tokensTotal = Number.isFinite(payload?.tokens_total) ? payload.tokens_total : Number(payload?.tokens_total);

    if (!ownerId || !periodStart || !Number.isFinite(tokensTotal)) {
        return NextResponse.json({ error: 'Missing owner_id, period_start, tokens_total' }, { status: 400 });
    }

    // Ensure the user belongs to the tenant (basic sanity check)
    const { data: tu, error: tuError } = await guard.admin
        .from('tenant_users')
        .select('tenant_id, user_id')
        .eq('tenant_id', tenantId)
        .eq('user_id', ownerId)
        .maybeSingle();

    if (tuError) return NextResponse.json({ error: tuError.message }, { status: 500 });
    if (!tu) return NextResponse.json({ error: 'User is not in this tenant.' }, { status: 400 });

    const { error: upsertError } = await guard.admin.from('room_credits').upsert(
        {
            owner_id: ownerId,
            period_start: periodStart,
            tokens_total: Math.max(0, Math.floor(tokensTotal)),
            tokens_used: 0
        },
        { onConflict: 'owner_id,period_start' }
    );

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

    return NextResponse.json({ ok: true });
}

