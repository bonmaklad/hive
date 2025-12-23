import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../_lib/adminGuard';
import { ensureStripeCustomer } from '../../../../_lib/stripe';

export const runtime = 'nodejs';

function safeText(value, limit = 120) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

async function getTenantBillingEmail({ admin, tenantId }) {
    const { data: tenantUsers, error } = await admin
        .from('tenant_users')
        .select('user_id, role, created_at')
        .eq('tenant_id', tenantId)
        .in('role', ['owner', 'admin'])
        .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);

    const list = Array.isArray(tenantUsers) ? tenantUsers : [];
    const owner = list.find(r => r.role === 'owner') || null;
    const adminUser = list.find(r => r.role === 'admin') || null;
    const chosen = owner || adminUser || list[0] || null;
    const userId = chosen?.user_id || null;
    if (!userId) return null;

    const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    const email = typeof profile?.email === 'string' ? profile.email.trim() : '';
    return email || null;
}

export async function POST(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const tenantId = safeText(params?.id, 80);
    if (!tenantId) return NextResponse.json({ error: 'Missing tenant id.' }, { status: 400 });

    const { data: tenant, error: tenantError } = await guard.admin
        .from('tenants')
        .select('id, name, stripe_customer_id')
        .eq('id', tenantId)
        .maybeSingle();
    if (tenantError) return NextResponse.json({ error: tenantError.message }, { status: 500 });
    if (!tenant) return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 });

    try {
        const email = await getTenantBillingEmail({ admin: guard.admin, tenantId });
        const customerId = await ensureStripeCustomer({ tenant, tenantId, email });
        const { data: updated, error: updateError } = await guard.admin
            .from('tenants')
            .update({ stripe_customer_id: customerId })
            .eq('id', tenantId)
            .select('id, name, stripe_customer_id')
            .single();
        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

        return NextResponse.json({ ok: true, tenant: updated });
    } catch (err) {
        return NextResponse.json({ error: err?.message || 'Failed to create Stripe customer.' }, { status: 500 });
    }
}
