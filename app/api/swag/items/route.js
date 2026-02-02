import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseAuth';

export const runtime = 'nodejs';

export async function GET(request) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { data, error: loadError } = await admin
        .from('swag_items')
        .select('id, title, description, image_url, tokens_cost, stock_qty, stock_unlimited, is_active, created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

    if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });

    return NextResponse.json({ items: data || [] });
}
