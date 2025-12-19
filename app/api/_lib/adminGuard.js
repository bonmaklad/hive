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
        return { ok: false, status: 500, error: profileError.message };
    }

    if (!profile?.is_admin) {
        return { ok: false, status: 403, error: 'Admin access required.' };
    }

    return { ok: true, user, profile, admin };
}

