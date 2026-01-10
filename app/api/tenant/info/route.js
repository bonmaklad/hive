import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseAuth';

export const runtime = 'nodejs';

function safeText(value, limit = 2000) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function toNullableText(value, limit) {
    const v = safeText(value, limit);
    return v ? v : null;
}

async function resolveTenantLink(admin, userId) {
    const { data, error } = await admin
        .from('tenant_users')
        .select('tenant_id, role, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);

    const list = Array.isArray(data) ? data : [];
    if (!list.length) return { tenantId: null, role: null };

    const owner = list.find(item => item.role === 'owner');
    const adminRole = list.find(item => item.role === 'admin');
    const chosen = owner || adminRole || list[0];

    return {
        tenantId: chosen?.tenant_id || null,
        role: chosen?.role || null
    };
}

async function loadProfile(admin, userId) {
    const { data, error } = await admin
        .from('profiles')
        .select('id, is_admin')
        .eq('id', userId)
        .maybeSingle();

    if (error) throw new Error(error.message);
    return data || null;
}

export async function GET(request) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const admin = createSupabaseAdminClient();

    try {
        const profile = await loadProfile(admin, user.id);
        const { tenantId } = await resolveTenantLink(admin, user.id);

        if (!tenantId) {
            return NextResponse.json({ tenant: null, info: null, is_admin: Boolean(profile?.is_admin) });
        }

        const { data: tenant, error: tenantError } = await admin
            .from('tenants')
            .select('id, name')
            .eq('id', tenantId)
            .maybeSingle();
        if (tenantError) throw new Error(tenantError.message);

        const { data: info, error: infoError } = await admin
            .from('tenant_info')
            .select('tenant_id, about, phone, email, office_location, logo_url, directory_enabled, key_contact_name, profile_name, website_url')
            .eq('tenant_id', tenantId)
            .maybeSingle();
        if (infoError && infoError.code !== 'PGRST116') throw new Error(infoError.message);

        return NextResponse.json({ tenant: tenant || null, info: info || null, is_admin: Boolean(profile?.is_admin) });
    } catch (err) {
        return NextResponse.json({ error: err?.message || 'Failed to load tenant profile.' }, { status: 500 });
    }
}

export async function PUT(request) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const admin = createSupabaseAdminClient();

    try {
        const profile = await loadProfile(admin, user.id);
        const { tenantId, role } = await resolveTenantLink(admin, user.id);
        const canEdit = Boolean(profile?.is_admin || role === 'owner' || role === 'admin');

        if (!tenantId) return NextResponse.json({ error: 'No tenant membership found.' }, { status: 403 });
        if (!canEdit) return NextResponse.json({ error: 'Tenant admin access required.' }, { status: 403 });

        const payload = await request.json().catch(() => ({}));
        const dirEnabled = payload?.directory_enabled;
        const updates = {
            tenant_id: tenantId,
            about: toNullableText(payload?.about, 2000),
            phone: toNullableText(payload?.phone, 120),
            email: toNullableText(payload?.email, 200),
            office_location: toNullableText(payload?.office_location, 200),
            key_contact_name: toNullableText(payload?.key_contact_name, 160),
            profile_name: toNullableText(payload?.profile_name, 160),
            website_url: toNullableText(payload?.website_url, 400),
            ...(typeof dirEnabled === 'boolean' ? { directory_enabled: dirEnabled } : {})
        };

        const { data: updated, error: updError } = await admin
            .from('tenant_info')
            .upsert(updates, { onConflict: 'tenant_id' })
            .select('tenant_id, about, phone, email, office_location, logo_url, directory_enabled, key_contact_name, profile_name, website_url')
            .single();

        if (updError) throw new Error(updError.message);

        return NextResponse.json({ info: updated });
    } catch (err) {
        return NextResponse.json({ error: err?.message || 'Failed to update tenant profile.' }, { status: 500 });
    }
}
