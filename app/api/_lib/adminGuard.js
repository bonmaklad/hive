import { createSupabaseAdminClient, getUserFromRequest } from './supabaseAuth';

export async function requireAdmin(request) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) {
        return { ok: false, status: 401, error };
    }

    const admin = createSupabaseAdminClient();
    const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('id, is_admin, name, email')
        .eq('id', user.id)
        .maybeSingle();

    if (profileError) {
        const msg = profileError.message || 'Failed to load admin profile.';
        if (msg.includes('Expected 3 parts in JWT') || msg.includes('JWT') || msg.includes('token')) {
            return {
                ok: false,
                status: 500,
                error: 'Server Supabase admin key is missing/invalid. Set `SUPABASE_SERVICE_KEY` (service_role key) on the Next.js server.'
            };
        }
        return { ok: false, status: 500, error: msg };
    }

    if (!profile?.is_admin) {
        return { ok: false, status: 403, error: 'Admin access required.' };
    }

    return { ok: true, user, profile, admin };
}
