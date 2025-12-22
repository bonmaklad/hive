import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../_lib/supabaseAuth';

export const runtime = 'nodejs';

function safeText(value, limit = 100) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

export async function GET(request, { params }) {
    const slug = safeText(params?.slug, 80);
    if (!slug) return NextResponse.json({ error: 'Missing slug.' }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
        .from('spaces')
        .select('slug, title, copy, capacity, layouts, highlights, best_for, pricing_half_day_cents, pricing_full_day_cents, pricing_per_event_cents, tokens_per_hour, image')
        .eq('slug', slug)
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

    const { data: images, error: imgError } = await admin
        .from('space_images')
        .select('id, url, sort_order, alt, bucket, path, created_at, updated_at')
        .eq('space_slug', slug)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
    if (imgError) return NextResponse.json({ error: imgError.message }, { status: 500 });

    return NextResponse.json({ ok: true, space: data, images: images || [] });
}

