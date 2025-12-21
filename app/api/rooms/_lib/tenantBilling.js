import { createSupabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseAuth';

export async function requireTenantContext(request) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return { ok: false, status: 401, error };

    const admin = createSupabaseAdminClient();

    const { data: tenantLinks, error: tuError } = await admin
        .from('tenant_users')
        .select('tenant_id, role')
        .eq('user_id', user.id);

    if (tuError) return { ok: false, status: 500, error: tuError.message };
    if (!tenantLinks?.length) return { ok: false, status: 403, error: 'No tenant membership found.' };

    const tenantId = tenantLinks[0].tenant_id;
    if (!tenantId) return { ok: false, status: 500, error: 'Tenant membership is misconfigured.' };

    const { data: tenant, error: tenantError } = await admin.from('tenants').select('*').eq('id', tenantId).maybeSingle();
    if (tenantError) return { ok: false, status: 500, error: tenantError.message };
    if (!tenant) return { ok: false, status: 404, error: 'Tenant not found.' };

    const { data: ownerLink, error: ownerError } = await admin
        .from('tenant_users')
        .select('user_id')
        .eq('tenant_id', tenantId)
        .eq('role', 'owner')
        .maybeSingle();

    if (ownerError) return { ok: false, status: 500, error: ownerError.message };
    const tokenOwnerId = ownerLink?.user_id || user.id;

    return { ok: true, status: 200, user, admin, tenantId, tenant, tokenOwnerId };
}

