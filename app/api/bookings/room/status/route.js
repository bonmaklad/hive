import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../../_lib/supabaseAuth';
import { sendPublicRoomBookingConfirmationEmail } from '../../../_lib/email';
import { stripeRequest } from '../../../_lib/stripe';

export const runtime = 'nodejs';

function safeText(value, limit = 200) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function toInt(value, fallback = 0) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
}

async function fetchStripeSession(checkoutSessionId) {
    const id = safeText(checkoutSessionId, 200);
    if (!id) return null;
    try {
        const session = await stripeRequest('GET', `/v1/checkout/sessions/${encodeURIComponent(id)}?expand[]=invoice&expand[]=payment_intent`);
        return session;
    } catch {
        return null;
    }
}

function sessionIsPaid(session) {
    return session?.payment_status === 'paid' || session?.payment_status === 'no_payment_required';
}

function sessionInvoiceInfo(session) {
    const invoice = session?.invoice;
    const invoiceId = typeof invoice === 'string' ? invoice : invoice?.id || null;
    const hostedInvoiceUrl = invoice?.hosted_invoice_url || null;
    const invoicePdf = invoice?.invoice_pdf || null;
    return { invoiceId, hostedInvoiceUrl, invoicePdf };
}

export async function GET(request) {
    const url = new URL(request.url);
    const bookingId = safeText(url.searchParams.get('booking'), 64);
    const sessionIdFromReturn = safeText(url.searchParams.get('session_id'), 200);

    if (!bookingId) return NextResponse.json({ error: 'booking required.' }, { status: 400 });

    const admin = createSupabaseAdminClient();

    const { data: booking, error: bookingError } = await admin
        .from('public_room_bookings')
        .select('id, status, space_slug, booking_date, start_time, end_time, customer_name, customer_email')
        .eq('id', bookingId)
        .maybeSingle();

    if (bookingError) return NextResponse.json({ error: bookingError.message }, { status: 500 });
    if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });

    const paymentRes = await admin
        .from('public_room_booking_payments')
        .select('id, stripe_checkout_session_id, stripe_invoice_id, stripe_payment_intent_id, status, amount_cents, currency')
        .eq('public_room_booking_id', bookingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    const payment = paymentRes?.data || null;
    const paymentError = paymentRes?.error || null;
    if (paymentError && paymentError.code !== '42P01') {
        return NextResponse.json({ error: paymentError.message }, { status: 500 });
    }

    let reconciled = false;
    let reconciledSession = null;
    let invoiceUrl = null;
    let email = { ok: false, skipped: true, error: null };

    // If webhook didn't run (common on localhost), reconcile by querying Stripe.
    if (booking.status === 'pending_payment' && payment?.stripe_checkout_session_id) {
        const session = await fetchStripeSession(sessionIdFromReturn || payment.stripe_checkout_session_id);
        if (session && sessionIsPaid(session)) {
            const { invoiceId, hostedInvoiceUrl, invoicePdf } = sessionInvoiceInfo(session);
            invoiceUrl = hostedInvoiceUrl || invoicePdf || null;

            const { error: paymentUpdateError } = await admin.from('public_room_booking_payments')
                .update({
                    status: 'paid',
                    stripe_invoice_id: invoiceId || (typeof session?.invoice === 'string' ? session.invoice : null),
                    stripe_payment_intent_id: typeof session?.payment_intent === 'string' ? session.payment_intent : (session?.payment_intent?.id || null),
                    amount_cents: typeof session?.amount_total === 'number' ? session.amount_total : undefined,
                    currency: typeof session?.currency === 'string' ? session.currency.toUpperCase() : undefined,
                    updated_at: new Date().toISOString()
                })
                .eq('id', payment.id);
            if (paymentUpdateError) {
                return NextResponse.json({ error: paymentUpdateError.message }, { status: 500 });
            }

            const { error: bookingUpdateError } = await admin.from('public_room_bookings')
                .update({ status: 'confirmed', updated_at: new Date().toISOString() })
                .eq('id', bookingId);
            if (bookingUpdateError) {
                return NextResponse.json({ error: bookingUpdateError.message }, { status: 500 });
            }

            reconciled = true;
            reconciledSession = session;

            let spaceTitle = booking.space_slug;
            try {
                const { data: space } = await admin.from('spaces').select('title').eq('slug', booking.space_slug).maybeSingle();
                if (space?.title) spaceTitle = space.title;
            } catch {
                // ignore
            }

            try {
                const result = await sendPublicRoomBookingConfirmationEmail({
                    to: booking.customer_email,
                    customerName: booking.customer_name,
                    spaceTitle,
                    bookingDate: booking.booking_date,
                    startTime: String(booking.start_time).slice(0, 5),
                    endTime: String(booking.end_time).slice(0, 5),
                    invoiceUrl,
                    manageUrl: null
                });
                email = result || { ok: true };
            } catch (err) {
                email = { ok: false, skipped: false, error: err?.message || 'Email send failed.' };
            }
        }
    }

    const finalStatus = reconciled ? 'confirmed' : booking.status;

    return NextResponse.json({
        ok: true,
        booking: {
            id: booking.id,
            status: finalStatus,
            space_slug: booking.space_slug,
            booking_date: booking.booking_date,
            start_time: String(booking.start_time).slice(0, 5),
            end_time: String(booking.end_time).slice(0, 5),
            customer_email: booking.customer_email,
            customer_name: booking.customer_name
        },
        payment: payment
            ? {
                  status: reconciled ? 'paid' : payment.status,
                  currency:
                      reconciled && typeof reconciledSession?.currency === 'string'
                          ? reconciledSession.currency.toUpperCase()
                          : payment.currency,
                  amount_cents:
                      reconciled && typeof reconciledSession?.amount_total === 'number'
                          ? reconciledSession.amount_total
                          : payment.amount_cents,
                  stripe_checkout_session_id: payment.stripe_checkout_session_id,
                  stripe_invoice_id: reconciled
                      ? (typeof reconciledSession?.invoice === 'string'
                          ? reconciledSession.invoice
                          : reconciledSession?.invoice?.id || null)
                      : payment.stripe_invoice_id,
                  stripe_payment_intent_id: reconciled
                      ? (typeof reconciledSession?.payment_intent === 'string'
                          ? reconciledSession.payment_intent
                          : reconciledSession?.payment_intent?.id || null)
                      : payment.stripe_payment_intent_id
              }
            : null,
        reconciled,
        invoice_url: invoiceUrl,
        email
    });
}
