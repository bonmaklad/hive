import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseEnv } from './lib/supabase/env';

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
        const redirectUrl = request.nextUrl.clone();
        const next = redirectUrl.searchParams.get('next') || '/platform';
        const safeNext = next.startsWith('/') ? next : '/platform';
        redirectUrl.pathname = safeNext;
        redirectUrl.search = '';
        return NextResponse.redirect(redirectUrl);
    }

    if (request.nextUrl.pathname.startsWith('/platform') && !user) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = '/login';
        redirectUrl.searchParams.set('next', request.nextUrl.pathname);
        return NextResponse.redirect(redirectUrl);
    }

    return response;
}

export const config = {
    matcher: ['/platform/:path*', '/login']
};
