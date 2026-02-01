import { NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/adminGuard';

export const runtime = 'nodejs';

function safeText(value) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, 120);
}

function getMonthStart() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-01`;
}

export async function GET(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const monthStart = getMonthStart();

    const { data: tenants, error: tenantsError } = await guard.admin
        .from('tenants')
        .select('id, name, created_at, stripe_customer_id')
        .order('created_at', { ascending: false })
        .limit(200);

    if (tenantsError) return NextResponse.json({ error: tenantsError.message }, { status: 500 });

    const tenantIds = (tenants || []).map(t => t.id).filter(Boolean);
    if (!tenantIds.length) return NextResponse.json({ tenants: [] });

    const today = new Date().toISOString().slice(0, 10);
    const workUnitCodesByTenant = {};

    const { data: allocations, error: allocationsError } = await guard.admin
        .from('work_unit_allocations')
        .select('tenant_id, work_unit:work_units(building, unit_number)')
        .in('tenant_id', tenantIds)
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gt.${today}`);

    if (allocationsError && allocationsError.code !== '42P01') {
        return NextResponse.json({ error: allocationsError.message }, { status: 500 });
    }

    for (const row of allocations || []) {
        const tenantId = row?.tenant_id;
        const workUnit = row?.work_unit;
        if (!tenantId || !workUnit?.building || workUnit?.unit_number === null || workUnit?.unit_number === undefined) continue;
        const code = `${String(workUnit.building).trim()}.${String(workUnit.unit_number).trim()}`;
        (workUnitCodesByTenant[tenantId] ||= []).push(code);
    }

    for (const tenantId of Object.keys(workUnitCodesByTenant)) {
        workUnitCodesByTenant[tenantId] = Array.from(new Set(workUnitCodesByTenant[tenantId])).sort((a, b) => a.localeCompare(b));
    }

    const { data: tenantUsers, error: tuError } = await guard.admin
        .from('tenant_users')
        .select('tenant_id, user_id, role, created_at')
        .in('tenant_id', tenantIds);

    if (tuError) return NextResponse.json({ error: tuError.message }, { status: 500 });

    const userIds = Array.from(new Set((tenantUsers || []).map(tu => tu.user_id).filter(Boolean)));

    const groupedUsers = tenantUsers?.reduce((acc, tu) => {
        (acc[tu.tenant_id] ||= []).push({
            ...tu
        });
        return acc;
    }, {});

    const resolvePrimaryUser = users => {
        const list = Array.isArray(users) ? users : [];
        return list.find(u => u.role === 'owner') || list.find(u => u.role === 'admin') || list[0] || null;
    };

    const resolveMembershipOwnerUser = users => {
        const list = Array.isArray(users) ? users : [];
        return list.find(u => u.role === 'owner') || list.find(u => u.role === 'admin') || null;
    };

    const primaryUserIds = Array.from(
        new Set(
            (tenantIds || [])
                .map(tenantId => resolveMembershipOwnerUser(groupedUsers?.[tenantId])?.user_id)
                .filter(Boolean)
        )
    );

    const profilesById = {};
    const creditsByOwner = {};
    const creditsSummaryByOwner = {};
    const membershipsByOwner = {};
    const invoicesByOwner = {};

    if (userIds.length) {
        const { data: profiles, error: profilesError } = await guard.admin
            .from('profiles')
            .select('id, name, email, is_admin')
            .in('id', userIds);

        if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 });

        const { data: credits, error: creditsError } = await guard.admin
            .from('room_credits')
            .select('owner_id, period_start, tokens_total, tokens_used')
            .in('owner_id', userIds);

        if (creditsError) return NextResponse.json({ error: creditsError.message }, { status: 500 });

        for (const profile of profiles || []) profilesById[profile.id] = profile;
        for (const credit of credits || []) {
            if (!credit?.owner_id) continue;
            const ownerId = credit.owner_id;
            const summary = creditsSummaryByOwner[ownerId] || { tokens_total: 0, tokens_used: 0 };
            summary.tokens_total += Number(credit.tokens_total || 0);
            summary.tokens_used += Number(credit.tokens_used || 0);
            creditsSummaryByOwner[ownerId] = summary;
            if (credit.period_start === monthStart) creditsByOwner[ownerId] = credit;
        }
    }

    if (primaryUserIds.length) {
        const { data: memberships, error: memError } = await guard.admin
            .from('memberships')
            .select('*')
            .in('owner_id', primaryUserIds);

        if (memError) return NextResponse.json({ error: memError.message }, { status: 500 });

        const { data: invoices, error: invError } = await guard.admin
            .from('invoices')
            .select('id, owner_id, invoice_number, amount_cents, status, issued_on, created_at')
            .in('owner_id', primaryUserIds)
            .order('created_at', { ascending: false })
            .limit(500);

        if (invError) return NextResponse.json({ error: invError.message }, { status: 500 });

        for (const membership of memberships || []) membershipsByOwner[membership.owner_id] = membership;
        for (const invoice of invoices || []) {
            (invoicesByOwner[invoice.owner_id] ||= []).push(invoice);
        }
    }

    const hydratedUsers = tenantUsers?.reduce((acc, tu) => {
        (acc[tu.tenant_id] ||= []).push({
            ...tu,
            profile: profilesById[tu.user_id] || null,
            room_credits: creditsByOwner[tu.user_id] || null,
            room_credits_summary: creditsSummaryByOwner[tu.user_id] || null
        });
        return acc;
    }, {});

    const result = (tenants || []).map(t => {
        const users = hydratedUsers?.[t.id] || [];
        const owner = users.find(u => u.role === 'owner') || null;
        const primary = owner || users.find(u => u.role === 'admin') || users[0] || null;
        const membershipOwnerUserId = owner?.user_id || primary?.user_id || null;
        return {
            ...t,
            users,
            owner,
            primary_user: primary,
            membership: membershipOwnerUserId ? membershipsByOwner[membershipOwnerUserId] || null : null,
            invoices: membershipOwnerUserId ? invoicesByOwner?.[membershipOwnerUserId] || [] : [],
            work_unit_codes: workUnitCodesByTenant?.[t.id] || []
        };
    });

    return NextResponse.json({ tenants: result, month_start: monthStart });
}

export async function POST(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const payload = await request.json().catch(() => ({}));
    const name = safeText(payload?.name);
    if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

    const { data, error } = await guard.admin.from('tenants').insert({ name }).select('id, name, created_at').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ tenant: data });
}
