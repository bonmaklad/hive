import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../../_lib/supabaseAuth';

export const runtime = 'nodejs';

export async function GET() {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
        .from('spaces')
        .select('slug, title, pricing_half_day_cents, pricing_full_day_cents, pricing_per_event_cents, image')
        .order('title', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        ok: true,
        spaces: (data || []).map(s => ({
            slug: s.slug,
            title: s.title,
            image: s.image,
            pricing_half_day_cents: s.pricing_half_day_cents,
            pricing_full_day_cents: s.pricing_full_day_cents,
            pricing_per_event_cents: s.pricing_per_event_cents
        }))
    });
}

