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
    const serviceRoleKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_KEY ||
        process.env.SERVICE_ROLE_KEY;

    if (isMissing(url)) throw new Error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)');
    if (isMissing(serviceRoleKey)) {
        throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY / SERVICE_ROLE_KEY)');
    }

    return { url, serviceRoleKey };
}

function createSupabaseReadClient() {
    const { url, serviceRoleKey } = getEnv();
    // Memberships and tenant ownership are private; resolve eligibility on the server.
    return createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) }
    });
}

function safeText(value, limit = 2000) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

export async function getTenantDirectory({ includeBuildings = false } = {}) {
    noStore();
    const supabase = createSupabaseReadClient();
    const { data, error } = await supabase
        .from('tenants')
        .select('id, name, tenant_info(about, phone, email, office_location, website_url, logo_url, directory_enabled, key_contact_name, profile_name)')
        .order('name', { ascending: true });

    if (error) throw new Error(error.message);

    const tenants = (data || [])
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

    if (!tenants.length) return [];

    const { data: tenantUsers, error: tenantUsersError } = await supabase
        .from('tenant_users')
        .select('tenant_id, user_id, role')
        .in('tenant_id', tenants.map(tenant => tenant.id))
        .in('role', ['owner', 'admin'])
        .order('created_at', { ascending: true });

    if (tenantUsersError) throw new Error(tenantUsersError.message);

    const ownersByTenant = new Map();
    for (const link of tenantUsers || []) {
        const current = ownersByTenant.get(link.tenant_id);
        // Match membership administration: owner first, oldest admin as fallback.
        if (!current || (current.role !== 'owner' && link.role === 'owner')) {
            ownersByTenant.set(link.tenant_id, link);
        }
    }

    const ownerIds = [...new Set([...ownersByTenant.values()].map(link => link.user_id))];
    if (!ownerIds.length) return [];

    const { data: memberships, error: membershipsError } = await supabase
        .from('memberships')
        .select('owner_id, status')
        .in('owner_id', ownerIds)
        .order('updated_at', { ascending: false });

    if (membershipsError) throw new Error(membershipsError.message);

    const membershipsByOwner = new Map();
    for (const membership of memberships || []) {
        if (!membershipsByOwner.has(membership.owner_id)) {
            membershipsByOwner.set(membership.owner_id, membership);
        }
    }

    const eligibleTenants = tenants.filter(tenant => {
        const ownerId = ownersByTenant.get(tenant.id)?.user_id;
        return membershipsByOwner.get(ownerId)?.status === 'live';
    });

    if (!includeBuildings || !eligibleTenants.length) return eligibleTenants;

    const today = new Date().toISOString().slice(0, 10);
    const { data: allocations, error: allocationsError } = await supabase
        .from('work_unit_allocations')
        .select('tenant_id, work_unit:work_units(building)')
        .in('tenant_id', eligibleTenants.map(tenant => tenant.id))
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gt.${today}`);

    if (allocationsError) throw new Error(allocationsError.message);

    const buildingsByTenant = new Map();
    for (const allocation of allocations || []) {
        const workUnit = Array.isArray(allocation?.work_unit) ? allocation.work_unit[0] : allocation?.work_unit;
        const building = String(workUnit?.building || '').trim();
        if (building !== '116' && building !== '122') continue;
        if (!buildingsByTenant.has(allocation.tenant_id)) buildingsByTenant.set(allocation.tenant_id, new Set());
        buildingsByTenant.get(allocation.tenant_id).add(building);
    }

    return eligibleTenants.map(tenant => ({
        ...tenant,
        buildings: ['122', '116'].filter(building => buildingsByTenant.get(tenant.id)?.has(building))
    }));
}
