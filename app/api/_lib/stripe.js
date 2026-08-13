import crypto from 'crypto';

function getStripeSecretKey() {
    const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY;
    if (!key) throw new Error('Missing STRIPE_SECRET_KEY on the Next.js server.');
    return key;
}

function getStripeMode() {
    const key = getStripeSecretKey();
    if (key.startsWith('sk_live_')) return 'live';
    if (key.startsWith('sk_test_')) return 'test';
    return 'unknown';
}

export function getStripeWebhookSecret() {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error('Missing STRIPE_WEBHOOK_SECRET on the Next.js server.');
    return secret;
}

function encode(params) {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
        if (value === undefined) continue;
        if (value === null) continue;
        body.append(key, String(value));
    }
    return body;
}

export async function stripeRequest(method, path, params, { idempotencyKey } = {}) {
    const key = getStripeSecretKey();
    const url = `https://api.stripe.com${path}`;
    const headers = {
        Authorization: `Bearer ${key}`,
        'Stripe-Version': '2024-06-20'
    };

    let body;
    if (method !== 'GET') {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = encode(params);
    }
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const res = await fetch(url, {
        method,
        headers,
        body
    });

    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        json = { _raw: text };
    }

    if (!res.ok) {
        const message = json?.error?.message || `Stripe request failed (${res.status}).`;
        const code = json?.error?.code || json?.error?.type || 'stripe_error';
        const err = new Error(message);
        err.code = code;
        err.status = res.status;
        err.raw = json;
        err.requestId = res.headers.get('request-id') || res.headers.get('stripe-request-id') || null;
        throw err;
    }

    return json;
}

export async function cancelStripeSubscription(subscriptionId) {
    const id = typeof subscriptionId === 'string' ? subscriptionId.trim() : '';
    if (!id) return false;

    try {
        await stripeRequest('DELETE', `/v1/subscriptions/${encodeURIComponent(id)}`, {});
        return true;
    } catch (err) {
        // Treat an already-removed subscription as cancelled so retries can still
        // clear the local billing state safely.
        if (err?.status === 404 || err?.code === 'resource_missing') return false;
        throw err;
    }
}

export async function expireStripeCheckoutSession(sessionId) {
    const id = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (!id) return false;

    try {
        await stripeRequest('POST', `/v1/checkout/sessions/${encodeURIComponent(id)}/expire`, {});
        return true;
    } catch (err) {
        // A completed or already-expired session cannot be expired again. The
        // caller still updates the local booking/payment state idempotently.
        if (err?.code === 'checkout_session_not_open' || err?.code === 'resource_missing' || err?.status === 404) return false;
        throw err;
    }
}

export async function refundStripePayment({ paymentIntentId, idempotencyKey, metadata = {} }) {
    const id = typeof paymentIntentId === 'string' ? paymentIntentId.trim() : '';
    if (!id) throw new Error('The paid booking has no Stripe payment intent to refund.');

    const params = {
        payment_intent: id,
        reason: 'requested_by_customer'
    };
    for (const [key, value] of Object.entries(metadata)) {
        if (value === null || value === undefined || value === '') continue;
        params[`metadata[${key}]`] = String(value);
    }

    try {
        return await stripeRequest('POST', '/v1/refunds', params, { idempotencyKey });
    } catch (err) {
        // Allow recovery when an operator already refunded the payment in
        // Stripe but the local booking still needs to be cancelled.
        if (err?.code === 'charge_already_refunded') {
            return { id: null, status: 'succeeded', already_refunded: true };
        }
        throw err;
    }
}

export async function ensureStripeCustomer({ tenant, tenantId, email }) {
    const existing = typeof tenant?.stripe_customer_id === 'string' ? tenant.stripe_customer_id.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    if (existing) {
        // Validate the existing customer id to avoid test/live key mismatches causing downstream failures.
        try {
            await stripeRequest('GET', `/v1/customers/${encodeURIComponent(existing)}`);
            if (cleanEmail) {
                try {
                    await stripeRequest(
                        'POST',
                        `/v1/customers/${encodeURIComponent(existing)}`,
                        { email: cleanEmail },
                        { idempotencyKey: `tenant-customer-email-${tenantId}` }
                    );
                } catch {
                    // ignore best-effort updates
                }
            }
            return existing;
        } catch (err) {
            // If the customer does not exist in this Stripe mode/account, create a new one.
            if (err?.status !== 404 && err?.code !== 'resource_missing') {
                throw err;
            }
        }
    }

    const name = typeof tenant?.name === 'string' ? tenant.name : `Tenant ${tenantId}`;
    const idempotencyKey = `tenant-customer-${tenantId}`;

    const stripeMode = getStripeMode();
    const customer = await stripeRequest(
        'POST',
        '/v1/customers',
        {
            name,
            email: cleanEmail || undefined,
            'metadata[tenant_id]': tenantId,
            'metadata[stripe_mode]': stripeMode
        },
        { idempotencyKey }
    );

    return customer.id;
}

export async function findPromotionCode({ code }) {
    const clean = typeof code === 'string' ? code.trim() : '';
    if (!clean) return null;

    const json = await stripeRequest('GET', `/v1/promotion_codes?active=true&code=${encodeURIComponent(clean)}&limit=1`);
    const promo = Array.isArray(json?.data) ? json.data[0] : null;
    if (!promo) return null;
    return promo;
}

export async function getCouponForPromotionCode({ promotionCodeId }) {
    if (!promotionCodeId) return null;
    const promo = await stripeRequest('GET', `/v1/promotion_codes/${promotionCodeId}`);
    if (!promo?.coupon) return null;
    const couponId = typeof promo.coupon === 'string' ? promo.coupon : promo.coupon?.id;
    if (!couponId) return null;
    const coupon = await stripeRequest('GET', `/v1/coupons/${couponId}`);
    return { promo, coupon };
}

export async function createCheckoutSession({
    customerId,
    amountCents,
    currency,
    description,
    successUrl,
    cancelUrl,
    returnUrl,
    uiMode,
    metadata,
    promotionCodeId
}) {
    const bookingKey = metadata?.booking_id || metadata?.public_room_booking_id || crypto.randomUUID();
    const idempotencyKey = `checkout-${bookingKey}`;

    const params = {
        mode: 'payment',
        customer: customerId,
        // Enable Stripe Tax (GST/VAT) calculation.
        'automatic_tax[enabled]': 'true',
        // Collect address so Stripe can calculate the correct tax rate and show the tax breakdown on invoices.
        billing_address_collection: 'required',
        // Persist address back to the customer.
        'customer_update[address]': 'auto',
        'invoice_creation[enabled]': 'true',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': currency.toLowerCase(),
        'line_items[0][price_data][unit_amount]': String(amountCents),
        // We treat the provided amount as tax-inclusive (NZD) so Stripe backs out GST.
        'line_items[0][price_data][tax_behavior]': 'inclusive',
        'line_items[0][price_data][product_data][name]': description,
        'line_items[0][price_data][product_data][metadata][tenant_id]': metadata?.tenant_id || '',
        'line_items[0][price_data][product_data][metadata][booking_id]': metadata?.booking_id || ''
    };

    if (uiMode === 'embedded') {
        params.ui_mode = 'embedded';
        params.return_url = returnUrl || successUrl || cancelUrl;
    } else {
        params.success_url = successUrl;
        params.cancel_url = cancelUrl;
    }

    if (promotionCodeId) {
        params['discounts[0][promotion_code]'] = promotionCodeId;
    }

    for (const [k, v] of Object.entries(metadata || {})) {
        if (v === null || v === undefined) continue;
        params[`metadata[${k}]`] = String(v);
    }

    const session = await stripeRequest('POST', '/v1/checkout/sessions', params, { idempotencyKey });
    return session;
}

function timingSafeEqual(a, b) {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
}

export function verifyStripeWebhookSignature({ payload, signatureHeader, secret, toleranceSeconds = 300 }) {
    const sig = typeof signatureHeader === 'string' ? signatureHeader : '';
    const timestampPart = sig
        .split(',')
        .map(p => p.trim())
        .find(p => p.startsWith('t='));
    const timestamp = timestampPart ? Number(timestampPart.slice('t='.length)) : NaN;
    const v1s = sig
        .split(',')
        .map(p => p.trim())
        .filter(p => p.startsWith('v1='))
        .map(p => p.slice('v1='.length))
        .filter(Boolean);

    if (!Number.isFinite(timestamp) || !v1s.length) return { ok: false, error: 'Invalid Stripe-Signature header.' };

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceSeconds) return { ok: false, error: 'Stripe webhook timestamp outside tolerance.' };

    const signedPayload = `${timestamp}.${payload}`;
    const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
    const match = v1s.some(v1 => timingSafeEqual(expected, v1));
    if (!match) return { ok: false, error: 'Invalid Stripe webhook signature.' };

    return { ok: true };
}
