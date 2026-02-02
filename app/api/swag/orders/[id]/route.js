import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../../_lib/supabaseAuth';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const orderId = params?.id;
    if (!orderId) return NextResponse.json({ error: 'Missing order id.' }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const { data, error: loadError } = await admin
        .from('swag_orders')
        .select('id, item_id, quantity, unit_tokens, tokens_cost, status, item_snapshot, created_at, fulfilled_at, cancelled_at')
        .eq('id', orderId)
        .eq('purchaser_id', user.id)
        .maybeSingle();

    if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

    return NextResponse.json({ order: data });
}
