import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/adminGuard';

export const runtime = 'nodejs';

export async function GET(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const { data, error } = await guard.admin
        .from('swag_orders')
        .select('id, item_id, purchaser_id, token_owner_id, quantity, unit_tokens, tokens_cost, status, item_snapshot, admin_notes, created_at, updated_at, fulfilled_at, cancelled_at')
        .order('created_at', { ascending: false })
        .limit(200);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const purchaserIds = Array.from(new Set((data || []).map(o => o.purchaser_id).filter(Boolean)));
    const { data: profiles } = await guard.admin.from('profiles').select('id, name, email').in('id', purchaserIds);
    const profilesById = Object.fromEntries((profiles || []).map(p => [p.id, p]));

    return NextResponse.json({
        orders: (data || []).map(order => ({
            ...order,
            purchaser: profilesById[order.purchaser_id] || null
        }))
    });
}
