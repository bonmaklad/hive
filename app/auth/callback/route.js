import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getPublicOrigin } from '@/lib/http/origin';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const tokenHash = url.searchParams.get('token_hash');
    const type = url.searchParams.get('type');
    const next = url.searchParams.get('next') || '/platform';

    const supabase = createSupabaseServerClient();

    if (code) {
        await supabase.auth.exchangeCodeForSession(code);
    } else if (tokenHash && type) {
        await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    }

    const origin = getPublicOrigin(request);
    const safeNext = next.startsWith('/') ? next : '/platform';
    return NextResponse.redirect(new URL(safeNext, origin));
}
