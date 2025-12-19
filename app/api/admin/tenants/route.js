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
        .select('id, name, created_at')
        .order('created_at', { ascending: false })
        .limit(200);

    if (tenantsError) return NextResponse.json({ error: tenantsError.message }, { status: 500 });

    const tenantIds = (tenants || []).map(t => t.id).filter(Boolean);
    if (!tenantIds.length) return NextResponse.json({ tenants: [] });

    const { data: tenantUsers, error: tuError } = await guard.admin
        .from('tenant_users')
        .select('tenant_id, user_id, role, created_at')
        .in('tenant_id', tenantIds);

    if (tuError) return NextResponse.json({ error: tuError.message }, { status: 500 });

    const userIds = Array.from(new Set((tenantUsers || []).map(tu => tu.user_id).filter(Boolean)));

    const { data: profiles, error: profilesError } = await guard.admin
        .from('profiles')
        .select('id, name, email, is_admin')
        .in('id', userIds);

    if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 });

    const { data: credits, error: creditsError } = await guard.admin
        .from('room_credits')
        .select('owner_id, period_start, tokens_total, tokens_used')
        .eq('period_start', monthStart)
        .in('owner_id', userIds);

    if (creditsError) return NextResponse.json({ error: creditsError.message }, { status: 500 });

    const ownerIds = Array.from(
        new Set((tenantUsers || []).filter(tu => tu.role === 'owner').map(tu => tu.user_id).filter(Boolean))
    );

    const { data: memberships, error: memError } = await guard.admin
        .from('memberships')
        .select('*')
        .in('owner_id', ownerIds);

    if (memError) return NextResponse.json({ error: memError.message }, { status: 500 });

    const { data: invoices, error: invError } = await guard.admin
        .from('invoices')
        .select('id, owner_id, invoice_number, amount_cents, status, issued_on, created_at')
        .in('owner_id', ownerIds)
        .order('created_at', { ascending: false })
        .limit(500);

    if (invError) return NextResponse.json({ error: invError.message }, { status: 500 });

    const profilesById = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    const creditsByOwner = Object.fromEntries((credits || []).map(c => [c.owner_id, c]));
    const membershipsByOwner = Object.fromEntries((memberships || []).map(m => [m.owner_id, m]));
    const invoicesByOwner = invoices?.reduce((acc, inv) => {
        (acc[inv.owner_id] ||= []).push(inv);
        return acc;
    }, {});

    const groupedUsers = tenantUsers?.reduce((acc, tu) => {
        (acc[tu.tenant_id] ||= []).push({
            ...tu,
            profile: profilesById[tu.user_id] || null,
            room_credits: creditsByOwner[tu.user_id] || null
        });
        return acc;
    }, {});

    const result = (tenants || []).map(t => {
        const users = groupedUsers?.[t.id] || [];
        const owner = users.find(u => u.role === 'owner') || null;
        const ownerId = owner?.user_id || null;
        return {
            ...t,
            users,
            owner,
            membership: ownerId ? membershipsByOwner[ownerId] || null : null,
            invoices: ownerId ? invoicesByOwner?.[ownerId] || [] : []
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

