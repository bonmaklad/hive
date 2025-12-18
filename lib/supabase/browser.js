'use client';

import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from './env';

let supabase = null;

export function createSupabaseBrowserClient() {
  if (supabase) return supabase;

  const { url, anonKey } = getSupabaseEnv();

  supabase = createClient(url, anonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  return supabase;
}
