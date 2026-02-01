import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../_lib/supabaseAuth';
import { sendPublicRoomBookingConfirmationEmail } from '../../_lib/email';
import { getStripeWebhookSecret, stripeRequest, verifyStripeWebhookSignature } from '../../_lib/stripe';
import { fetchCreditsSummary } from '../../rooms/_lib/credits';

export const runtime = 'nodejs';

function toInt(value, fallback = 0) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
}

async function alreadyProcessed(admin, eventId) {
    const { data, error } = await admin.from('stripe_events').select('id').eq('id', eventId).maybeSingle();
    if (error) return false;
    return Boolean(data?.id);
}

async function markProcessed(admin, eventId) {
    try {
        await admin.from('stripe_events').insert({ id: eventId });
    } catch {
        // If the idempotency table is missing/misconfigured, don't block webhook handling.
    }
}

async function approveBookingFromSession({ admin, session }) {
    const bookingId = session?.metadata?.booking_id;
    if (!bookingId) return;

    const { data: booking, error: bookingError } = await admin
        .from('room_bookings')
        .select('id, status, booking_date, tokens_used, price_cents')
        .eq('id', bookingId)
        .maybeSingle();

    if (bookingError || !booking) return;
    if (booking.status === 'approved') return;

    const { data: payment, error: paymentError } = await admin
        .from('room_booking_payments')
        .select('id, token_owner_id, amount_cents, discount_cents, currency, status')
        .eq('stripe_checkout_session_id', session.id)
        .maybeSingle();

    if (paymentError || !payment) return;
    if (payment.status === 'paid') return;

    const invoiceId = session?.invoice || null;
    const paymentIntentId = session?.payment_intent || null;
    const amountTotal = typeof session?.amount_total === 'number' ? session.amount_total : null;
    const currency = typeof session?.currency === 'string' ? session.currency.toUpperCase() : null;
    const amountDiscount =
        typeof session?.total_details?.amount_discount === 'number' ? session.total_details.amount_discount : null;

    await admin
        .from('room_booking_payments')
        .update({
            status: 'paid',
            stripe_invoice_id: typeof invoiceId === 'string' ? invoiceId : null,
            stripe_payment_intent_id: typeof paymentIntentId === 'string' ? paymentIntentId : null,
            amount_cents: amountTotal !== null ? amountTotal : undefined,
            currency: currency || undefined,
            discount_cents: amountDiscount !== null ? amountDiscount : undefined,
            updated_at: new Date().toISOString()
        })
        .eq('id', payment.id);

    await admin.from('room_bookings').update({ status: 'approved' }).eq('id', bookingId);

    // Deduct tokens from the tenant token owner (only if a token owner exists).
    const tokenOwnerId = payment.token_owner_id || session?.metadata?.token_owner_id || null;
    const tokensToDeduct = Math.max(0, toInt(booking.tokens_used, 0));

    if (tokenOwnerId && tokensToDeduct) {
        const credits = await fetchCreditsSummary({ admin, ownerId: tokenOwnerId });
        const latestPeriodStart = credits.ok ? credits.latestRow?.period_start : null;
        if (latestPeriodStart) {
            const currentUsed = toInt(credits.latestRow?.tokens_used, 0);
            const newUsed = Math.max(0, currentUsed + tokensToDeduct);
            await admin.from('room_credits').update({ tokens_used: newUsed }).eq('owner_id', tokenOwnerId).eq('period_start', latestPeriodStart);
        }
    }

    // Create internal invoice record (paid) for visibility in the platform admin UI.
    const ownerId = payment.token_owner_id || session?.metadata?.token_owner_id || null;
    if (ownerId) {
        const amountCents = Math.max(0, toInt(amountTotal !== null ? amountTotal : payment.amount_cents, 0));
        const invoiceNumber = typeof invoiceId === 'string' && invoiceId ? `stripe:${invoiceId}` : `stripe_session:${session.id}`;
        try {
            await admin.from('invoices').insert({
                owner_id: ownerId,
                membership_id: null,
                invoice_number: invoiceNumber,
                amount_cents: amountCents,
                currency: currency || payment.currency || 'NZD',
                status: 'paid',
                issued_on: booking.booking_date,
                due_on: booking.booking_date,
                paid_at: new Date().toISOString()
            });
        } catch {
            // ignore duplicates / invoice-number collisions
        }
    }
}

async function confirmPublicRoomBookingFromSession({ admin, session }) {
    const bookingId = session?.metadata?.public_room_booking_id;
    if (!bookingId) return;

    const { data: booking, error: bookingError } = await admin
        .from('public_room_bookings')
        .select('id, status, booking_date, start_time, end_time, space_slug, customer_email, customer_name')
        .eq('id', bookingId)
        .maybeSingle();

    if (bookingError || !booking) return;
    if (booking.status === 'confirmed') return;

    const { data: payment, error: paymentError } = await admin
        .from('public_room_booking_payments')
        .select('id, amount_cents, currency, status')
        .eq('stripe_checkout_session_id', session.id)
        .maybeSingle();

    if (paymentError || !payment) return;
    if (payment.status === 'paid') return;

    const invoiceId = session?.invoice || null;
    const paymentIntentId = session?.payment_intent || null;
    const amountTotal = typeof session?.amount_total === 'number' ? session.amount_total : null;
    const currency = typeof session?.currency === 'string' ? session.currency.toUpperCase() : null;
    const amountDiscount =
        typeof session?.total_details?.amount_discount === 'number' ? session.total_details.amount_discount : null;

    await admin
        .from('public_room_booking_payments')
        .update({
            status: 'paid',
            stripe_invoice_id: typeof invoiceId === 'string' ? invoiceId : null,
            stripe_payment_intent_id: typeof paymentIntentId === 'string' ? paymentIntentId : null,
            amount_cents: amountTotal !== null ? amountTotal : undefined,
            currency: currency || undefined,
            discount_cents: amountDiscount !== null ? amountDiscount : undefined,
            updated_at: new Date().toISOString()
        })
        .eq('id', payment.id);

    await admin.from('public_room_bookings').update({ status: 'confirmed' }).eq('id', bookingId);

    // Email confirmation with invoice link (best-effort).
    const to = booking.customer_email || session?.customer_details?.email || session?.metadata?.customer_email || null;
    if (!to) return;

    let invoiceUrl = null;
    try {
        const stripeInvoiceId = typeof invoiceId === 'string' ? invoiceId : null;
        if (stripeInvoiceId) {
            const inv = await stripeRequest('GET', `/v1/invoices/${encodeURIComponent(stripeInvoiceId)}`);
            invoiceUrl = inv?.hosted_invoice_url || inv?.invoice_pdf || null;
        }
    } catch {
        invoiceUrl = null;
    }

    let spaceTitle = booking.space_slug;
    try {
        const { data: space } = await admin.from('spaces').select('title').eq('slug', booking.space_slug).maybeSingle();
        if (space?.title) spaceTitle = space.title;
    } catch {
        // ignore
    }

    try {
        await sendPublicRoomBookingConfirmationEmail({
            to,
            customerName: booking.customer_name,
            spaceTitle,
            bookingDate: booking.booking_date,
            startTime: String(booking.start_time).slice(0, 5),
            endTime: String(booking.end_time).slice(0, 5),
            invoiceUrl,
            manageUrl: null
        });
    } catch {
        // ignore
    }
}

async function cancelBookingFromSession({ admin, session }) {
    const bookingId = session?.metadata?.booking_id;
    if (!bookingId) return;
    await admin.from('room_bookings').update({ status: 'cancelled' }).eq('id', bookingId);
    await admin.from('room_booking_payments').update({ status: 'failed' }).eq('stripe_checkout_session_id', session.id);
}

async function cancelPublicRoomBookingFromSession({ admin, session, status }) {
    const bookingId = session?.metadata?.public_room_booking_id;
    if (!bookingId) return;
    const nextStatus = status || 'expired';
    await admin.from('public_room_bookings').update({ status: nextStatus }).eq('id', bookingId);
    await admin.from('public_room_booking_payments').update({ status: 'cancelled' }).eq('stripe_checkout_session_id', session.id);
}

function toIsoDate(tsSeconds) {
    if (!Number.isFinite(tsSeconds)) return null;
    const d = new Date(tsSeconds * 1000);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

function toDayOfMonth(tsSeconds) {
    if (!Number.isFinite(tsSeconds)) return null;
    const d = new Date(tsSeconds * 1000);
    if (Number.isNaN(d.getTime())) return null;
    return d.getUTCDate();
}

function monthStartIsoLocal() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-01`;
}

async function applyTokenPurchaseFromSession({ admin, session }) {
    const isTokenPurchase = session?.metadata?.token_purchase === 'true';
    if (!isTokenPurchase) return;

    const tokenOwnerId = session?.metadata?.token_owner_id || null;
    const quantity = Math.max(0, toInt(session?.metadata?.token_quantity, 0));
    if (!tokenOwnerId || !quantity) return;

    const periodStart = monthStartIsoLocal();
    const { data: existing, error: existingError } = await admin
        .from('room_credits')
        .select('tokens_total, tokens_used')
        .eq('owner_id', tokenOwnerId)
        .eq('period_start', periodStart)
        .maybeSingle();

    if (existingError) return;

    if (existing) {
        const nextTotal = Math.max(0, toInt(existing.tokens_total, 0) + quantity);
        await admin.from('room_credits').update({ tokens_total: nextTotal }).eq('owner_id', tokenOwnerId).eq('period_start', periodStart);
    } else {
        await admin.from('room_credits').insert({
            owner_id: tokenOwnerId,
            period_start: periodStart,
            tokens_total: quantity,
            tokens_used: 0
        });
    }

    const invoiceId = typeof session?.invoice === 'string' ? session.invoice : session?.invoice?.id || null;
    const amountTotal = typeof session?.amount_total === 'number' ? session.amount_total : null;
    const currency = typeof session?.currency === 'string' ? session.currency.toUpperCase() : (session?.metadata?.currency || 'NZD');
    const issuedOn = toIsoDate(typeof session?.created === 'number' ? session.created : NaN) || new Date().toISOString().slice(0, 10);
    const amountFromMeta = toInt(session?.metadata?.amount_cents, 0);
    const amountCents = Math.max(0, toInt(amountTotal !== null ? amountTotal : amountFromMeta, 0));

    const invoiceNumber = invoiceId ? `stripe:${invoiceId}` : `stripe_session:${session.id}`;
    try {
        await admin.from('invoices').insert({
            owner_id: tokenOwnerId,
            membership_id: null,
            invoice_number: invoiceNumber,
            amount_cents: amountCents,
            currency,
            status: 'paid',
            issued_on: issuedOn,
            due_on: issuedOn,
            paid_at: new Date().toISOString()
        });
    } catch {
        // ignore duplicates
    }
}

async function activateMembershipFromSession({ admin, session }) {
    const membershipId = session?.metadata?.membership_id;
    if (!membershipId) return;

    const stripeSubscriptionId = typeof session?.subscription === 'string' ? session.subscription : session?.subscription?.id;
    if (!stripeSubscriptionId) return;

    const { data: membership, error: membershipError } = await admin
        .from('memberships')
        .select('id, owner_id, currency')
        .eq('id', membershipId)
        .maybeSingle();
    if (membershipError || !membership) return;

    let nextInvoiceAt = null;
    try {
        const sub = await stripeRequest('GET', `/v1/subscriptions/${encodeURIComponent(stripeSubscriptionId)}`);
        nextInvoiceAt = toDayOfMonth(typeof sub?.current_period_end === 'number' ? sub.current_period_end : NaN);
    } catch {
        nextInvoiceAt = null;
    }

    await admin
        .from('memberships')
        .update({
            payment_terms: 'auto_card',
            stripe_subscription_id: stripeSubscriptionId,
            next_invoice_at: nextInvoiceAt || undefined,
            updated_at: new Date().toISOString()
        })
        .eq('id', membershipId);

    // Record the initial invoice in the internal invoices table if Stripe generated one.
    const invoiceId = typeof session?.invoice === 'string' ? session.invoice : session?.invoice?.id;
    const amountTotal = typeof session?.amount_total === 'number' ? session.amount_total : null;
    const currency = typeof session?.currency === 'string' ? session.currency.toUpperCase() : (membership.currency || 'NZD');
    const issuedOn = toIsoDate(typeof session?.created === 'number' ? session.created : NaN) || new Date().toISOString().slice(0, 10);

    if (membership?.owner_id) {
        const invoiceNumber = invoiceId ? `stripe:${invoiceId}` : `stripe_session:${session.id}`;
        const amountCents = Math.max(0, toInt(amountTotal !== null ? amountTotal : 0, 0));
        try {
            await admin.from('invoices').insert({
                owner_id: membership.owner_id,
                membership_id: membershipId,
                invoice_number: invoiceNumber,
                amount_cents: amountCents,
                currency,
                status: 'paid',
                issued_on: issuedOn,
                due_on: issuedOn,
                paid_at: new Date().toISOString()
            });
        } catch {
            // ignore duplicates
        }
    }
}

async function cancelMembershipFromStripeSubscription({ admin, subscription }) {
    const stripeSubscriptionId = typeof subscription?.id === 'string' ? subscription.id : null;
    if (!stripeSubscriptionId) return;
    await admin
        .from('memberships')
        .update({
            payment_terms: 'invoice',
            stripe_subscription_id: null,
            updated_at: new Date().toISOString()
        })
        .eq('stripe_subscription_id', stripeSubscriptionId);
}

export async function POST(request) {
    const payload = await request.text();
    const signature = request.headers.get('stripe-signature') || '';

    try {
        const secret = getStripeWebhookSecret();
        const verified = verifyStripeWebhookSignature({ payload, signatureHeader: signature, secret });
        if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: 400 });
    } catch (err) {
        return NextResponse.json({ error: err?.message || 'Webhook verification failed.' }, { status: 400 });
    }

    let event;
    try {
        event = JSON.parse(payload);
    } catch {
        return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();

    const eventId = event?.id;
    if (typeof eventId === 'string' && eventId) {
        const processed = await alreadyProcessed(admin, eventId);
        if (processed) return NextResponse.json({ ok: true, skipped: true });
        await markProcessed(admin, eventId);
    }

    const type = event?.type;
    const obj = event?.data?.object;

    if (type === 'checkout.session.completed') {
        await approveBookingFromSession({ admin, session: obj });
        await confirmPublicRoomBookingFromSession({ admin, session: obj });
        await activateMembershipFromSession({ admin, session: obj });
        await applyTokenPurchaseFromSession({ admin, session: obj });
    }

    if (type === 'checkout.session.async_payment_failed' || type === 'checkout.session.expired') {
        await cancelBookingFromSession({ admin, session: obj });
        await cancelPublicRoomBookingFromSession({ admin, session: obj, status: 'expired' });
    }

    if (type === 'customer.subscription.deleted') {
        await cancelMembershipFromStripeSubscription({ admin, subscription: obj });
    }

    return NextResponse.json({ ok: true });
}
