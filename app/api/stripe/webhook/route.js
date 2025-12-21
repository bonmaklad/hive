import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../_lib/supabaseAuth';
import { getStripeWebhookSecret, verifyStripeWebhookSignature } from '../../_lib/stripe';
import { monthStart } from '../../rooms/_lib/bookingMath';

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
    await admin.from('stripe_events').insert({ id: eventId });
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

    await admin
        .from('room_booking_payments')
        .update({
            status: 'paid',
            stripe_invoice_id: typeof invoiceId === 'string' ? invoiceId : null,
            stripe_payment_intent_id: typeof paymentIntentId === 'string' ? paymentIntentId : null,
            updated_at: new Date().toISOString()
        })
        .eq('id', payment.id);

    await admin.from('room_bookings').update({ status: 'approved' }).eq('id', bookingId);

    // Deduct tokens from the tenant token owner (only if a token owner exists).
    const tokenOwnerId = payment.token_owner_id || session?.metadata?.token_owner_id || null;
    const periodStart = monthStart(booking.booking_date);
    const tokensToDeduct = Math.max(0, toInt(booking.tokens_used, 0));

    if (tokenOwnerId && periodStart && tokensToDeduct) {
        const { data: credits } = await admin
            .from('room_credits')
            .select('tokens_used')
            .eq('owner_id', tokenOwnerId)
            .eq('period_start', periodStart)
            .maybeSingle();

        const currentUsed = credits?.tokens_used ?? 0;
        const newUsed = Math.max(0, toInt(currentUsed, 0) + tokensToDeduct);
        await admin.from('room_credits').update({ tokens_used: newUsed }).eq('owner_id', tokenOwnerId).eq('period_start', periodStart);
    }

    // Create internal invoice record (paid) for visibility in the platform admin UI.
    const ownerId = payment.token_owner_id || session?.metadata?.token_owner_id || null;
    if (ownerId) {
        const amountCents = Math.max(0, toInt(payment.amount_cents, 0));
        const invoiceNumber = typeof invoiceId === 'string' && invoiceId ? `stripe:${invoiceId}` : `stripe_session:${session.id}`;
        try {
            await admin.from('invoices').insert({
                owner_id: ownerId,
                membership_id: null,
                invoice_number: invoiceNumber,
                amount_cents: amountCents,
                currency: payment.currency || 'NZD',
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

async function cancelBookingFromSession({ admin, session }) {
    const bookingId = session?.metadata?.booking_id;
    if (!bookingId) return;
    await admin.from('room_bookings').update({ status: 'cancelled' }).eq('id', bookingId);
    await admin.from('room_booking_payments').update({ status: 'failed' }).eq('stripe_checkout_session_id', session.id);
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
    }

    if (type === 'checkout.session.async_payment_failed' || type === 'checkout.session.expired') {
        await cancelBookingFromSession({ admin, session: obj });
    }

    return NextResponse.json({ ok: true });
}
