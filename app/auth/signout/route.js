import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getPublicOrigin } from '@/lib/http/origin';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    const url = new URL(request.url);
    const next = url.searchParams.get('next') || '/login';

    const supabase = createSupabaseServerClient();
    await supabase.auth.signOut();

    const origin = getPublicOrigin(request);
    const safeNext = next.startsWith('/') ? next : '/login';
    return NextResponse.redirect(new URL(safeNext, origin));
}
