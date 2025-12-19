import { NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/adminGuard';

export const runtime = 'nodejs';

export async function GET(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const { data, error } = await guard.admin
        .from('spaces')
        .select('slug, title, tokens_per_hour, pricing_half_day_cents, pricing_full_day_cents, pricing_per_event_cents, image')
        .order('title', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ spaces: data || [] });
}

