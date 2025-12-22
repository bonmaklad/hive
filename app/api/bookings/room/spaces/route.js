import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../../_lib/supabaseAuth';

export const runtime = 'nodejs';

export async function GET() {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
        .from('spaces')
        .select('slug, title, pricing_half_day_cents, pricing_full_day_cents, pricing_per_event_cents, tokens_per_hour, image, space_images(url, sort_order, alt)')
        .order('title', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        ok: true,
        spaces: (data || []).map(s => ({
            slug: s.slug,
            title: s.title,
            image: s.image || (Array.isArray(s?.space_images) ? s.space_images.slice().sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0))[0]?.url : null),
            images: Array.isArray(s?.space_images)
                ? s.space_images
                    .slice()
                    .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0))
                    .map(img => img?.url)
                    .filter(Boolean)
                : (s.image ? [s.image] : []),
            pricing_half_day_cents: s.pricing_half_day_cents,
            pricing_full_day_cents: s.pricing_full_day_cents,
            pricing_per_event_cents: s.pricing_per_event_cents,
            tokens_per_hour: s.tokens_per_hour ?? null
        }))
    });
}
