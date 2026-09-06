function toDateOnlyIso(input = new Date()) {
    return input.toISOString().slice(0, 10);
}

function normalizeTenantIds(rows) {
    const values = Array.isArray(rows) ? rows : [];
    const unique = new Set();
    for (const row of values) {
        const tenantId = typeof row?.tenant_id === 'string' ? row.tenant_id.trim() : '';
        if (tenantId) unique.add(tenantId);
    }
    return Array.from(unique);
}

export async function releaseTenantWorkspaceAllocations(admin, ownerUserId) {
    if (!ownerUserId) return { error: 'Missing owner user id.' };

    const { data: tenantUsers, error: tenantUsersError } = await admin
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', ownerUserId);

    if (tenantUsersError) return { error: tenantUsersError.message || 'Failed to load tenant memberships.' };

    const tenantIds = normalizeTenantIds(tenantUsers);
    if (!tenantIds.length) return { tenantIds, released: 0 };

    const today = toDateOnlyIso();
    const { data: activeAllocations, error: allocationsError } = await admin
        .from('work_unit_allocations')
        .select('id')
        .in('tenant_id', tenantIds)
        .or(`end_date.is.null,end_date.gt.${today}`);

    if (allocationsError) return { error: allocationsError.message || 'Failed to load workspace allocations.' };

    const ids = (Array.isArray(activeAllocations) ? activeAllocations : [])
        .map(row => row?.id)
        .filter(Boolean);
    if (!ids.length) return { tenantIds, released: 0 };

    const { error: updateError } = await admin.from('work_unit_allocations').update({ end_date: today }).in('id', ids);
    if (updateError) return { error: updateError.message || 'Failed to release workspace allocations.' };

    return { tenantIds, released: ids.length };
}
