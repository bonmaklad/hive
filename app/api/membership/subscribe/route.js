import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseAuth';
import { ensureStripeCustomer, stripeRequest } from '../../_lib/stripe';

export const runtime = 'nodejs';

function toInt(value, fallback = 0) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
}

function clampInvoiceDay(value, fallbackDay) {
    const n = Number.isFinite(value) ? value : Number(value);
    const day = Number.isFinite(n) ? Math.floor(n) : fallbackDay;
    if (!Number.isFinite(day)) return 1;
    return Math.min(31, Math.max(1, day));
}

function daysInMonthUtc(year, monthIndex) {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function nextBillingAnchorUtc(dayOfMonth) {
    const now = new Date();
    const nowMs = now.getTime();
    const yyyy = now.getUTCFullYear();
    const mm = now.getUTCMonth();
    const safeDayThisMonth = Math.min(dayOfMonth, daysInMonthUtc(yyyy, mm));
    let candidate = new Date(Date.UTC(yyyy, mm, safeDayThisMonth, 12, 0, 0)); // midday UTC avoids DST edges

    // If we're too close or past, bump to next month.
    if (candidate.getTime() <= nowMs + 60 * 60 * 1000) {
        const next = new Date(Date.UTC(yyyy, mm + 1, 1, 12, 0, 0));
        const safeDayNextMonth = Math.min(dayOfMonth, daysInMonthUtc(next.getUTCFullYear(), next.getUTCMonth()));
        candidate = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), safeDayNextMonth, 12, 0, 0));
    }

    return Math.floor(candidate.getTime() / 1000);
}

function safeText(value, limit = 120) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function getSiteUrl() {
    return (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(
        /\/$/,
        ''
    );
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

    const tenantId = await getTenantOwnerTenantId(admin, user.id);
    if (!tenantId) return NextResponse.json({ error: 'Only tenant owners can enable automatic payments.' }, { status: 403 });

    const { data: tenant, error: tenantError } = await admin.from('tenants').select('*').eq('id', tenantId).maybeSingle();
    if (tenantError) return NextResponse.json({ error: tenantError.message }, { status: 500 });
    if (!tenant) return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 });

    const { data: membership, error: membershipError } = await admin
        .from('memberships')
        .select('*')
        .eq('owner_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
    if (!membership) return NextResponse.json({ error: 'Membership not found.' }, { status: 404 });

    const monthlyAmountCents = Math.max(0, toInt(membership.monthly_amount_cents, 0));
    if (monthlyAmountCents <= 0) {
        return NextResponse.json({ error: 'Automatic card payment requires a monthly amount greater than $0.00.' }, { status: 400 });
    }

    const currency = safeText(membership.currency || 'NZD', 10).toLowerCase() || 'nzd';
    const invoiceDay = clampInvoiceDay(membership?.next_invoice_at, new Date().getUTCDate());
    const billingAnchor = nextBillingAnchorUtc(invoiceDay);

    // Best-effort email to reduce Stripe prompting.
    const { data: ownerProfile } = await admin.from('profiles').select('email').eq('id', user.id).maybeSingle();
    const ownerEmail = ownerProfile?.email || null;

    const customerId = await ensureStripeCustomer({ tenant, tenantId, email: ownerEmail });
    if (!tenant?.stripe_customer_id) {
        await admin.from('tenants').update({ stripe_customer_id: customerId }).eq('id', tenantId);
    }

    const siteUrl = getSiteUrl();
    const returnUrl = `${siteUrl}/platform/membership?stripe=return`;

    const planName = safeText(membership.plan || 'membership', 50);
    const productName = `HiveHQ Membership (${planName})`;

    const session = await stripeRequest(
        'POST',
        '/v1/checkout/sessions',
        {
            mode: 'subscription',
            ui_mode: 'embedded',
            customer: customerId,
            return_url: returnUrl,
            allow_promotion_codes: 'true',

            'line_items[0][quantity]': '1',
            'line_items[0][price_data][currency]': currency,
            'line_items[0][price_data][unit_amount]': String(monthlyAmountCents),
            'line_items[0][price_data][recurring][interval]': 'month',
            'line_items[0][price_data][product_data][name]': productName,

            // Session metadata (easy to read in webhook).
            'metadata[membership_id]': membership.id,
            'metadata[tenant_id]': tenantId,
            'metadata[owner_id]': user.id,

            // Subscription metadata (persists on Stripe subscription).
            'subscription_data[metadata][membership_id]': membership.id,
            'subscription_data[metadata][tenant_id]': tenantId,
            'subscription_data[metadata][owner_id]': user.id,

            // Align monthly renewal to the configured billing day-of-month.
            'subscription_data[billing_cycle_anchor]': String(billingAnchor),
            'subscription_data[proration_behavior]': 'none',
            // Start charging on the anchor (no immediate charge).
            'subscription_data[trial_end]': String(billingAnchor)
        },
        { idempotencyKey: `sub-checkout-${membership.id}-${monthlyAmountCents}` }
    );

    const clientSecret = typeof session?.client_secret === 'string' ? session.client_secret : '';
    if (!clientSecret) return NextResponse.json({ error: 'Stripe did not return an embedded client_secret.' }, { status: 500 });

    return NextResponse.json({
        ok: true,
        stripe_checkout_session_id: session.id,
        stripe_checkout_client_secret: clientSecret
    });
}
