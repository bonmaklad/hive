import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseAuth';
import { ensureStripeCustomer, stripeRequest } from '../../_lib/stripe';

export const runtime = 'nodejs';

function getSiteUrl() {
    return (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(
        /\/$/,
        ''
    );
}

async function isAdminUser(admin, userId) {
    const { data, error } = await admin.from('profiles').select('is_admin, email').eq('id', userId).maybeSingle();
    if (error) return { ok: false, email: null };
    return { ok: Boolean(data?.is_admin), email: data?.email || null };
}

async function getTenantOwnerTenantId(admin, userId) {
    const { data, error } = await admin.from('tenant_users').select('tenant_id').eq('user_id', userId).eq('role', 'owner').limit(1);
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : null;
    return row?.tenant_id || null;
}

export async function POST(request) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const adminCheck = await isAdminUser(admin, user.id);

    const tenantId = await getTenantOwnerTenantId(admin, user.id);
    if (!adminCheck.ok && !tenantId) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

    const resolvedTenantId = tenantId || null;
    if (!resolvedTenantId) return NextResponse.json({ error: 'Tenant not found for user.' }, { status: 404 });

    const { data: tenant, error: tenantError } = await admin.from('tenants').select('*').eq('id', resolvedTenantId).maybeSingle();
    if (tenantError) return NextResponse.json({ error: tenantError.message }, { status: 500 });
    if (!tenant) return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 });

    // Ensure the caller also owns a membership record (avoids opening billing portal for unrelated tenant in edge cases).
    const { data: membership, error: membershipError } = await admin
        .from('memberships')
        .select('id')
        .eq('owner_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
    if (!membership && !adminCheck.ok) return NextResponse.json({ error: 'Membership not found.' }, { status: 404 });

    const customerId = await ensureStripeCustomer({
        tenant,
        tenantId: resolvedTenantId,
        email: adminCheck.email
    });

    if (!tenant?.stripe_customer_id) {
        await admin.from('tenants').update({ stripe_customer_id: customerId }).eq('id', resolvedTenantId);
    }

    const siteUrl = getSiteUrl();
    const portal = await stripeRequest('POST', '/v1/billing_portal/sessions', {
        customer: customerId,
        return_url: `${siteUrl}/platform/membership`
    });

    const url = typeof portal?.url === 'string' ? portal.url : '';
    if (!url) return NextResponse.json({ error: 'Stripe portal session did not return a URL.' }, { status: 500 });

    return NextResponse.json({ ok: true, url });
}
