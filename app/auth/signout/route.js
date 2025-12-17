import { NextResponse } from 'next/server';
import { createSupabaseRouteHandlerClient } from '@/lib/supabase/route';
import { getPublicOrigin } from '@/lib/http/origin';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    const url = new URL(request.url);
    const next = url.searchParams.get('next') || '/login';

    const origin = getPublicOrigin(request);
    const safeNext = next.startsWith('/') ? next : '/login';

    const response = NextResponse.redirect(new URL(safeNext, origin));
    const supabase = createSupabaseRouteHandlerClient(request, response);

    await supabase.auth.signOut();

    return response;
}
