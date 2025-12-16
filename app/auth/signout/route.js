import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    const url = new URL(request.url);
    const next = url.searchParams.get('next') || '/login';

    const supabase = createSupabaseServerClient();
    await supabase.auth.signOut();

    return NextResponse.redirect(new URL(next, url.origin));
}

