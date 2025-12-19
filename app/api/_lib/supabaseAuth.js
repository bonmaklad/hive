import { createClient } from '@supabase/supabase-js';

function isMissing(value) {
    const v = typeof value === 'string' ? value.trim() : '';
    if (!v) return true;
    if (v.toLowerCase() === 'undefined') return true;
    if (v.toLowerCase() === 'null') return true;
    return false;
}

function getEnv() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_KEY ||
        process.env.SERVICE_ROLE_KEY;

    if (isMissing(url)) throw new Error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)');
    if (isMissing(anonKey)) throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY');
    if (isMissing(serviceRoleKey)) {
        throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY / SERVICE_ROLE_KEY)');
    }

    return { url, anonKey, serviceRoleKey };
}

export function createSupabaseAnonClient() {
    const { url, anonKey } = getEnv();
    return createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
}

export function createSupabaseAdminClient() {
    const { url, serviceRoleKey } = getEnv();
    return createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
}

export async function getUserFromRequest(request) {
    const authorization = request.headers.get('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
    if (isMissing(token)) return { user: null, error: 'Missing Authorization bearer token.' };

    const supabase = createSupabaseAnonClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return { user: null, error: error?.message || 'Invalid token.' };

    return { user: data.user, error: null };
}
