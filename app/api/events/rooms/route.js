import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseAuth';
import { canSelectEventRoom, isEventAdmin } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const [isAdmin, spaces] = await Promise.all([
        isEventAdmin(admin, user.id),
        admin.from('spaces').select('slug, title, is_visible').is('deleted_at', null).order('title')
    ]);
    if (spaces.error) return NextResponse.json({ error: spaces.error.message }, { status: 500 });

    return NextResponse.json({ spaces: (spaces.data || [])
        .filter(space => canSelectEventRoom(space, isAdmin))
        .map(({ slug, title }) => ({ slug, title }))
    }, { headers: { 'Cache-Control': 'private, no-store' } });
}
