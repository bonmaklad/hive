import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseAuth';

export const runtime = 'nodejs';

export async function GET(request) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { data, error: loadError } = await admin
        .from('swag_orders')
        .select('id, item_id, quantity, unit_tokens, tokens_cost, status, item_snapshot, created_at, fulfilled_at, cancelled_at')
        .eq('purchaser_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200);

    if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
    return NextResponse.json({ orders: data || [] });
}
