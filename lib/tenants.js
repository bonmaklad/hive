import { createClient } from '@supabase/supabase-js';
import { unstable_noStore as noStore } from 'next/cache';

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

    return { url, anonKey, serviceRoleKey: isMissing(serviceRoleKey) ? null : serviceRoleKey };
}

function createSupabaseReadClient() {
    const { url, anonKey, serviceRoleKey } = getEnv();
    const key = serviceRoleKey || anonKey;
    return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
}

function safeText(value, limit = 2000) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

export async function getTenantDirectory() {
    noStore();
    const supabase = createSupabaseReadClient();
    const { data, error } = await supabase
        .from('tenants')
        .select('id, name, tenant_info(about, phone, email, office_location, website_url, logo_url, directory_enabled, key_contact_name, profile_name)')
        .order('name', { ascending: true });

    if (error) throw new Error(error.message);

    return (data || [])
        .map(row => {
            const info = Array.isArray(row?.tenant_info) ? row.tenant_info[0] : row?.tenant_info;
            if (!info) return null;
            if (info?.directory_enabled === false) return null;
            return {
                id: row?.id || null,
                name: safeText(row?.name, 160) || 'Tenant',
                about: safeText(info?.about, 2000),
                phone: safeText(info?.phone, 120),
                email: safeText(info?.email, 200),
                officeLocation: safeText(info?.office_location, 200),
                websiteUrl: safeText(info?.website_url, 400),
                logoUrl: safeText(info?.logo_url, 2000),
                directoryEnabled: (info?.directory_enabled ?? true) !== false,
                keyContactName: safeText(info?.key_contact_name, 160),
                profileName: safeText(info?.profile_name, 160)
            };
        })
        .filter(Boolean);
}

export async function getTenantDirectoryStats() {
    noStore();
    const supabase = createSupabaseReadClient();
    const { count, error } = await supabase.from('tenants').select('id', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    return { totalTenants: count || 0 };
}
