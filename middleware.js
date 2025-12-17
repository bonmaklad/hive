import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseEnv } from './lib/supabase/env';
import { getPublicOrigin } from './lib/http/origin';

export async function middleware(request) {
    const { url, anonKey } = getSupabaseEnv();

    let response = NextResponse.next({
        request: {
            headers: request.headers
        }
    });

    const supabase = createServerClient(url, anonKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
            }
        }
    });

    const {
        data: { user }
    } = await supabase.auth.getUser();

    if (request.nextUrl.pathname === '/login' && user) {
        const origin = getPublicOrigin(request);
        const next = request.nextUrl.searchParams.get('next') || '/platform';
        const safeNext = next.startsWith('/') ? next : '/platform';
        return NextResponse.redirect(new URL(safeNext, origin));
    }

    if (request.nextUrl.pathname.startsWith('/platform') && !user) {
        const origin = getPublicOrigin(request);
        const redirectUrl = new URL('/login', origin);
        redirectUrl.searchParams.set('next', request.nextUrl.pathname);
        return NextResponse.redirect(redirectUrl);
    }

    return response;
}

export const config = {
    matcher: ['/platform/:path*', '/login']
};
