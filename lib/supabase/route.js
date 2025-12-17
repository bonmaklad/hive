import { createServerClient } from '@supabase/ssr';
import { getSupabaseEnv } from './env';

export function createSupabaseRouteHandlerClient(request, response) {
    const { url, anonKey } = getSupabaseEnv();

    return createServerClient(url, anonKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
            }
        }
    });
}

