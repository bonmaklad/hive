'use client';

import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from './env';

let supabase = null;

export function createSupabaseBrowserClient() {
    if (supabase) return supabase;

    const { url, anonKey } = getSupabaseEnv();

    supabase = createClient(url, anonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
            // IMPORTANT: no storage override
            // IMPORTANT: no cookies
            // IMPORTANT: no @supabase/ssr
        }
    });

    return supabase;
}
