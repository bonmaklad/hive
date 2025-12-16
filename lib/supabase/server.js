import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseEnv } from './env';

export function createSupabaseServerClient() {
    const { url, anonKey } = getSupabaseEnv();
    const cookieStore = cookies();

    return createServerClient(url, anonKey, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
                } catch {
                    // Server Components cannot set cookies; this is only needed for refresh flows.
                }
            }
        }
    });
}

