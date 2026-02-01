import { NextResponse } from 'next/server';
import { requireTenantContext } from '../../_lib/tenantBilling';
import { createCheckoutSession, ensureStripeCustomer } from '../../../_lib/stripe';

export const runtime = 'nodejs';

const TOKEN_PRICE_CENTS = 1000;
const MIN_TOKENS = 10;

function toInt(value, fallback = 0) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
}

function safeText(value, limit = 120) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function safeReturnPath(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith('/platform')) return null;
    return trimmed;
}

function appendParams(path, params) {
    if (!path) return '';
    const joiner = path.includes('?') ? '&' : '?';
    const usp = new URLSearchParams(params);
    return `${path}${joiner}${usp.toString()}`;
}

function getSiteUrl(request) {
    const configured = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
    if (configured) return configured.replace(/\/$/, '');
    try {
        return new URL(request.url).origin.replace(/\/$/, '');
    } catch {
        return 'http://localhost:3000';
    }
}

export async function POST(request) {
    try {
        const ctx = await requireTenantContext(request);
        if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

        const payload = await request.json().catch(() => ({}));
        const rawQty = payload?.quantity ?? payload?.tokens ?? payload?.count;
        const quantity = toInt(rawQty, NaN);
        if (!Number.isFinite(quantity) || quantity < MIN_TOKENS) {
            return NextResponse.json({ error: `quantity must be at least ${MIN_TOKENS}.` }, { status: 400 });
        }

        const amountCents = Math.max(0, quantity * TOKEN_PRICE_CENTS);
        if (!amountCents) return NextResponse.json({ error: 'Invalid token quantity.' }, { status: 400 });

        const returnPath = safeReturnPath(payload?.return_path) || '/platform';

        const customerId = await ensureStripeCustomer({
            tenant: ctx.tenant,
            tenantId: ctx.tenantId,
            email: ctx.tokenOwnerEmail
        });

        if (ctx.tenant?.stripe_customer_id !== customerId) {
            await ctx.admin.from('tenants').update({ stripe_customer_id: customerId }).eq('id', ctx.tenantId);
        }

        const siteUrl = getSiteUrl(request);
        const successUrl = `${siteUrl}${appendParams(returnPath, { stripe: 'tokens-success', tokens: String(quantity) })}`;
        const cancelUrl = `${siteUrl}${appendParams(returnPath, { stripe: 'tokens-cancel' })}`;

        const purchaserEmail = safeText(ctx.user?.email || '', 200);

        const session = await createCheckoutSession({
            customerId,
            amountCents,
            currency: 'NZD',
            description: `Token top-up (${quantity} token${quantity === 1 ? '' : 's'})`,
            successUrl,
            cancelUrl,
            metadata: {
                token_purchase: 'true',
                token_owner_id: ctx.tokenOwnerId,
                tenant_id: ctx.tenantId,
                purchaser_id: ctx.user.id,
                token_quantity: String(quantity),
                unit_price_cents: String(TOKEN_PRICE_CENTS),
                amount_cents: String(amountCents),
                currency: 'NZD',
                purchaser_email: purchaserEmail || undefined
            }
        });

        return NextResponse.json({
            ok: true,
            stripe_checkout_session_id: session.id,
            checkout_url: session.url || null
        });
    } catch (err) {
        const message = err?.message || 'Failed to start token checkout.';
        const status = Number.isFinite(err?.status) ? err.status : 500;
        return NextResponse.json({ error: message }, { status: status >= 400 && status < 600 ? status : 500 });
    }
}
