import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../_lib/supabaseAuth';
import { sendPublicRoomBookingConfirmationEmail } from '../../_lib/email';
import { cancelStripeSubscription, getStripeWebhookSecret, refundStripePayment, stripeRequest, verifyStripeWebhookSignature } from '../../_lib/stripe';
import { provisionPaidPublicMembershipSignup } from '../../membership/_lib/publicSignup';

export const runtime = 'nodejs';

function toInt(value, fallback = 0) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
}

function databaseError(context, error) {
    const err = new Error(`${context}: ${error?.message || 'Unknown database error.'}`);
    err.code = error?.code || 'database_error';
    return err;
}

function sessionIsPaid(session) {
    return session?.payment_status === 'paid' || session?.payment_status === 'no_payment_required';
}

async function refundCancelledBookingSession({ admin, session, payment, source }) {
    if (!sessionIsPaid(session)) return;
    if (payment?.status === 'refunded' || payment?.status === 'refund_pending') return;

    const amountCents = Math.max(0, toInt(session?.amount_total ?? payment?.amount_cents, 0));
    const paymentIntentId =
        typeof session?.payment_intent === 'string' ? session.payment_intent : session?.payment_intent?.id || payment?.stripe_payment_intent_id || null;
    const paymentTable = source === 'public' ? 'public_room_booking_payments' : 'room_booking_payments';
    let refund = null;
    let refundStatus = 'refunded';

    if (amountCents > 0) {
        refund = await refundStripePayment({
            paymentIntentId,
            idempotencyKey: `cancelled-room-booking-refund-${source}-${payment.id}-${payment.stripe_refund_id || 'initial'}`,
            metadata: {
                booking_id: source === 'member' ? session?.metadata?.booking_id : null,
                public_room_booking_id: source === 'public' ? session?.metadata?.public_room_booking_id : null,
                source,
                initiated_by: 'stripe_webhook_after_cancellation'
            }
        });
        if (refund?.status === 'failed' || refund?.failure_reason) {
            const { error } = await admin
                .from(paymentTable)
                .update({
                    status: 'paid',
                    stripe_payment_intent_id: paymentIntentId,
                    stripe_refund_id: refund?.id || payment.stripe_refund_id || null,
                    refunded_at: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', payment.id);
            if (error) throw databaseError('Failed to record failed booking refund', error);
            throw new Error(refund?.failure_reason || 'Stripe could not refund the cancelled booking payment.');
        }
        refundStatus = refund?.status === 'succeeded' || refund?.already_refunded ? 'refunded' : 'refund_pending';
    }

    const { error } = await admin
        .from(paymentTable)
        .update({
            status: refundStatus,
            stripe_payment_intent_id: paymentIntentId,
            stripe_refund_id: refund?.id || payment?.stripe_refund_id || null,
            refunded_at: refundStatus === 'refunded' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
        })
        .eq('id', payment.id);
    if (error) throw databaseError('Failed to record cancelled booking refund', error);
}

async function syncBookingRefund({ admin, refund }) {
    const refundId = typeof refund?.id === 'string' ? refund.id : null;
    if (!refundId) return;

    let status = 'refund_pending';
    if (refund.status === 'succeeded') status = 'refunded';
    if (refund.status === 'failed' || refund.status === 'canceled') status = 'paid';
    const updates = {
        status,
        refunded_at: status === 'refunded' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
    };

    const [memberResult, publicResult] = await Promise.all([
        admin.from('room_booking_payments').update(updates).eq('stripe_refund_id', refundId),
        admin.from('public_room_booking_payments').update(updates).eq('stripe_refund_id', refundId)
    ]);
    if (memberResult.error) throw databaseError('Failed to sync member room booking refund', memberResult.error);
    if (publicResult.error) throw databaseError('Failed to sync public room booking refund', publicResult.error);
}

async function claimEvent(admin, eventId) {
    const { error } = await admin.from('stripe_events').insert({ id: eventId });
    if (!error) return true;
    if (error.code === '23505') return false;
    throw databaseError('Failed to claim Stripe event', error);
}

async function releaseEvent(admin, eventId) {
    const { error } = await admin.from('stripe_events').delete().eq('id', eventId);
    if (error) {
        console.error('Failed to release Stripe event for retry.', {
            eventId,
            code: error.code,
            message: error.message
        });
    }
}

async function approveBookingFromSession({ admin, session }) {
    const bookingId = session?.metadata?.booking_id;
    if (!bookingId) return;
    if (!sessionIsPaid(session)) return;

    const { data: booking, error: bookingError } = await admin
        .from('room_bookings')
        .select('id, status, booking_date, token_owner_id, token_period_start, tokens_used, price_cents')
        .eq('id', bookingId)
        .maybeSingle();

    if (bookingError) throw databaseError('Failed to load member room booking', bookingError);
    if (!booking) throw new Error(`Member room booking ${bookingId} was not found.`);

    const { data: payment, error: paymentError } = await admin
        .from('room_booking_payments')
        .select('id, token_owner_id, amount_cents, discount_cents, currency, status, stripe_payment_intent_id, stripe_refund_id')
        .eq('stripe_checkout_session_id', session.id)
        .maybeSingle();

    if (paymentError) throw databaseError('Failed to load member room booking payment', paymentError);
    if (!payment) throw new Error(`Member room booking payment for Stripe session ${session.id} was not found.`);

    if (booking.status === 'cancelled') {
        await refundCancelledBookingSession({ admin, session, payment, source: 'member' });
        return;
    }

    const invoiceId = session?.invoice || null;
    const paymentIntentId = session?.payment_intent || null;
    const amountTotal = typeof session?.amount_total === 'number' ? session.amount_total : null;
    const currency = typeof session?.currency === 'string' ? session.currency.toUpperCase() : null;
    const amountDiscount =
        typeof session?.total_details?.amount_discount === 'number' ? session.total_details.amount_discount : null;

    if (payment.status !== 'paid') {
        const { error: paymentUpdateError } = await admin
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
        if (paymentUpdateError) throw databaseError('Failed to mark member room booking payment paid', paymentUpdateError);
    }

    // Approve the booking and debit tokens atomically so webhook retries cannot
    // charge the same tokens twice.
    const tokenOwnerId = booking.token_owner_id || payment.token_owner_id || session?.metadata?.token_owner_id || null;
    const { data: bookingTransitioned, error: finalizeError } = await admin.rpc('finalize_paid_room_booking', {
        p_booking_id: bookingId,
        p_token_owner_id: tokenOwnerId
    });
    if (finalizeError) throw databaseError('Failed to approve member room booking', finalizeError);

    // Create internal invoice record (paid) for visibility in the platform admin UI.
    const ownerId = payment.token_owner_id || session?.metadata?.token_owner_id || null;
    if (bookingTransitioned && ownerId) {
        const amountCents = Math.max(0, toInt(amountTotal !== null ? amountTotal : payment.amount_cents, 0));
        const invoiceNumber = typeof invoiceId === 'string' && invoiceId ? `stripe:${invoiceId}` : `stripe_session:${session.id}`;
        const { error: invoiceError } = await admin.from('invoices').insert({
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
        if (invoiceError && invoiceError.code !== '23505') {
            console.error('Failed to create internal invoice for paid booking.', {
                bookingId,
                code: invoiceError.code,
                message: invoiceError.message
            });
        }
    }
}

async function confirmPublicRoomBookingFromSession({ admin, session }) {
    const bookingId = session?.metadata?.public_room_booking_id;
    if (!bookingId) return;
    if (!sessionIsPaid(session)) return;

    const { data: booking, error: bookingError } = await admin
        .from('public_room_bookings')
        .select('id, status, booking_date, start_time, end_time, space_slug, customer_email, customer_name')
        .eq('id', bookingId)
        .maybeSingle();

    if (bookingError) throw databaseError('Failed to load public room booking', bookingError);
    if (!booking) throw new Error(`Public room booking ${bookingId} was not found.`);

    const { data: payment, error: paymentError } = await admin
        .from('public_room_booking_payments')
        .select('id, amount_cents, currency, status, stripe_payment_intent_id, stripe_refund_id')
        .eq('stripe_checkout_session_id', session.id)
        .maybeSingle();

    if (paymentError) throw databaseError('Failed to load public room booking payment', paymentError);
    if (!payment) throw new Error(`Public room booking payment for Stripe session ${session.id} was not found.`);

    if (booking.status === 'cancelled' || booking.status === 'expired') {
        await refundCancelledBookingSession({ admin, session, payment, source: 'public' });
        return;
    }

    const invoiceId = session?.invoice || null;
    const paymentIntentId = session?.payment_intent || null;
    const amountTotal = typeof session?.amount_total === 'number' ? session.amount_total : null;
    const currency = typeof session?.currency === 'string' ? session.currency.toUpperCase() : null;
    const amountDiscount =
        typeof session?.total_details?.amount_discount === 'number' ? session.total_details.amount_discount : null;

    if (payment.status !== 'paid') {
        const { error: paymentUpdateError } = await admin
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
        if (paymentUpdateError) throw databaseError('Failed to mark public room booking payment paid', paymentUpdateError);
    }

    const bookingTransitioned = booking.status !== 'confirmed';
    if (bookingTransitioned) {
        const { error: bookingUpdateError } = await admin
            .from('public_room_bookings')
            .update({ status: 'confirmed', updated_at: new Date().toISOString() })
            .eq('id', bookingId);
        if (bookingUpdateError) throw databaseError('Failed to confirm public room booking', bookingUpdateError);
    }

    // Email confirmation with invoice link (best-effort).
    if (!bookingTransitioned) return;
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

async function applyRoomBookingInvoicePaid({ admin, invoice }) {
    const invoiceId = typeof invoice?.id === 'string' ? invoice.id : null;
    const memberBookingId = invoice?.metadata?.booking_id || null;
    const publicBookingId = invoice?.metadata?.public_room_booking_id || null;
    if (!invoiceId || (!memberBookingId && !publicBookingId)) return;

    const source = memberBookingId ? 'member' : 'public';
    const bookingId = memberBookingId || publicBookingId;
    const bookingTable = source === 'member' ? 'room_bookings' : 'public_room_bookings';
    const paymentTable = source === 'member' ? 'room_booking_payments' : 'public_room_booking_payments';
    const paymentBookingColumn = source === 'member' ? 'room_booking_id' : 'public_room_booking_id';
    const paymentColumns =
        source === 'member'
            ? `id, ${paymentBookingColumn}, token_owner_id, amount_cents, currency, status, stripe_payment_intent_id, stripe_refund_id`
            : `id, ${paymentBookingColumn}, amount_cents, currency, status, stripe_payment_intent_id, stripe_refund_id`;
    const bookingColumns =
        source === 'member'
            ? 'id, status, booking_date, token_owner_id, space_slug'
            : 'id, status, booking_date, start_time, end_time, space_slug, customer_email, customer_name';

    const [{ data: booking, error: bookingError }, { data: payment, error: paymentError }] = await Promise.all([
        admin.from(bookingTable).select(bookingColumns).eq('id', bookingId).maybeSingle(),
        admin
            .from(paymentTable)
            .select(paymentColumns)
            .eq('stripe_invoice_id', invoiceId)
            .maybeSingle()
    ]);

    if (bookingError) throw databaseError(`Failed to load ${source} room booking for Stripe invoice`, bookingError);
    if (!booking) throw new Error(`${source === 'member' ? 'Member' : 'Public'} room booking ${bookingId} was not found.`);
    if (paymentError) throw databaseError(`Failed to load ${source} room booking payment for Stripe invoice`, paymentError);
    if (!payment) throw new Error(`Room booking payment for Stripe invoice ${invoiceId} was not found.`);

    const paymentIntentId =
        typeof invoice?.payment_intent === 'string' ? invoice.payment_intent : invoice?.payment_intent?.id || payment.stripe_payment_intent_id || null;
    const amountPaid = Math.max(0, toInt(invoice?.amount_paid ?? invoice?.total ?? payment.amount_cents, 0));
    const currency = typeof invoice?.currency === 'string' ? invoice.currency.toUpperCase() : payment.currency || 'NZD';

    if (booking.status === 'cancelled' || booking.status === 'expired') {
        await refundCancelledBookingSession({
            admin,
            payment,
            source,
            session: {
                payment_status: 'paid',
                amount_total: amountPaid,
                payment_intent: paymentIntentId,
                metadata: invoice.metadata || {}
            }
        });
        return;
    }

    if (payment.status !== 'paid') {
        const { error: paymentUpdateError } = await admin
            .from(paymentTable)
            .update({
                status: 'paid',
                stripe_payment_intent_id: paymentIntentId,
                amount_cents: amountPaid,
                currency,
                updated_at: new Date().toISOString()
            })
            .eq('id', payment.id);
        if (paymentUpdateError) throw databaseError(`Failed to mark ${source} room booking invoice paid`, paymentUpdateError);
    }

    if (source === 'member') {
        const tokenOwnerId = booking.token_owner_id || payment.token_owner_id || invoice?.metadata?.token_owner_id || null;
        const { error: finalizeError } = await admin.rpc('finalize_paid_room_booking', {
            p_booking_id: bookingId,
            p_token_owner_id: tokenOwnerId
        });
        if (finalizeError) throw databaseError('Failed to finalize member room booking from Stripe invoice', finalizeError);

        if (tokenOwnerId) {
            const issuedOn = toIsoDate(typeof invoice?.created === 'number' ? invoice.created : NaN) || new Date().toISOString().slice(0, 10);
            const dueOn = toIsoDate(typeof invoice?.due_date === 'number' ? invoice.due_date : NaN) || issuedOn;
            const { error: invoiceError } = await admin.from('invoices').insert({
                owner_id: tokenOwnerId,
                membership_id: null,
                invoice_number: `stripe:${invoiceId}`,
                amount_cents: amountPaid,
                currency,
                status: 'paid',
                issued_on: issuedOn,
                due_on: dueOn,
                paid_at: new Date().toISOString()
            });
            if (invoiceError && invoiceError.code !== '23505') {
                throw databaseError('Failed to record paid member room booking invoice', invoiceError);
            }
        }
        return;
    }

    const bookingTransitioned = booking.status !== 'confirmed';
    if (bookingTransitioned) {
        const { error: bookingUpdateError } = await admin
            .from('public_room_bookings')
            .update({ status: 'confirmed', updated_at: new Date().toISOString() })
            .eq('id', bookingId);
        if (bookingUpdateError) throw databaseError('Failed to confirm public room booking from Stripe invoice', bookingUpdateError);
    }

    if (!bookingTransitioned || !booking.customer_email) return;
    let spaceTitle = booking.space_slug;
    const { data: space, error: spaceError } = await admin.from('spaces').select('title').eq('slug', booking.space_slug).maybeSingle();
    if (spaceError) throw databaseError('Failed to load room title for confirmation email', spaceError);
    if (space?.title) spaceTitle = space.title;

    try {
        await sendPublicRoomBookingConfirmationEmail({
            to: booking.customer_email,
            customerName: booking.customer_name,
            spaceTitle,
            bookingDate: booking.booking_date,
            startTime: String(booking.start_time).slice(0, 5),
            endTime: String(booking.end_time).slice(0, 5),
            invoiceUrl: invoice?.hosted_invoice_url || invoice?.invoice_pdf || null,
            manageUrl: null
        });
    } catch {
        // Confirmation email is best-effort; Stripe has already sent the invoice and receipt.
    }
}

async function cancelBookingFromSession({ admin, session }) {
    const bookingId = session?.metadata?.booking_id;
    if (!bookingId) return;
    const { error: bookingError } = await admin
        .from('room_bookings')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', bookingId);
    if (bookingError) throw databaseError('Failed to cancel member room booking', bookingError);

    const { error: paymentError } = await admin
        .from('room_booking_payments')
        .update({ status: 'failed' })
        .eq('stripe_checkout_session_id', session.id);
    if (paymentError) throw databaseError('Failed to mark member room booking payment failed', paymentError);
}

async function cancelPublicRoomBookingFromSession({ admin, session, status }) {
    const bookingId = session?.metadata?.public_room_booking_id;
    if (!bookingId) return;
    const nextStatus = status || 'expired';
    const { error: bookingError } = await admin
        .from('public_room_bookings')
        .update({ status: nextStatus, cancelled_at: new Date().toISOString() })
        .eq('id', bookingId);
    if (bookingError) throw databaseError('Failed to expire public room booking', bookingError);

    const { error: paymentError } = await admin
        .from('public_room_booking_payments')
        .update({ status: 'cancelled' })
        .eq('stripe_checkout_session_id', session.id);
    if (paymentError) throw databaseError('Failed to cancel public room booking payment', paymentError);
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
        .select('id, owner_id, currency, status')
        .eq('id', membershipId)
        .maybeSingle();
    if (membershipError) throw new Error(membershipError.message);
    if (!membership) {
        await cancelStripeSubscription(stripeSubscriptionId);
        return;
    }

    if (membership.status !== 'live') {
        await cancelStripeSubscription(stripeSubscriptionId);
        return;
    }

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
    const type = event?.type;
    const obj = event?.data?.object;
    let claimed = false;

    try {
        if (typeof eventId === 'string' && eventId) {
            claimed = await claimEvent(admin, eventId);
            if (!claimed) return NextResponse.json({ ok: true, skipped: true });
        }

        if (type === 'checkout.session.completed') {
            await provisionPaidPublicMembershipSignup({ admin, session: obj, request });
            if (sessionIsPaid(obj)) {
                await approveBookingFromSession({ admin, session: obj });
                await confirmPublicRoomBookingFromSession({ admin, session: obj });
                await activateMembershipFromSession({ admin, session: obj });
                await applyTokenPurchaseFromSession({ admin, session: obj });
            }
        }

        if (type === 'checkout.session.async_payment_succeeded') {
            await provisionPaidPublicMembershipSignup({ admin, session: obj, request });
            await approveBookingFromSession({ admin, session: obj });
            await confirmPublicRoomBookingFromSession({ admin, session: obj });
            await activateMembershipFromSession({ admin, session: obj });
            await applyTokenPurchaseFromSession({ admin, session: obj });
        }

        if (type === 'checkout.session.async_payment_failed' || type === 'checkout.session.expired') {
            await cancelBookingFromSession({ admin, session: obj });
            await cancelPublicRoomBookingFromSession({ admin, session: obj, status: 'expired' });
        }

        if (type === 'refund.updated') {
            await syncBookingRefund({ admin, refund: obj });
        }

        if (type === 'invoice.paid' || type === 'invoice.payment_succeeded') {
            await applyRoomBookingInvoicePaid({ admin, invoice: obj });
        }

        if (type === 'customer.subscription.deleted') {
            await cancelMembershipFromStripeSubscription({ admin, subscription: obj });
        }
    } catch (error) {
        if (claimed && typeof eventId === 'string' && eventId) {
            await releaseEvent(admin, eventId);
        }
        console.error('Stripe webhook processing failed', {
            eventId: eventId || null,
            type: type || null,
            message: error?.message || 'Unknown webhook error'
        });
        return NextResponse.json(
            { error: 'Stripe webhook processing failed.' },
            { status: 500 }
        );
    }

    return NextResponse.json({ ok: true });
}
