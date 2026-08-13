import { NextResponse } from 'next/server';
import { expireStripeCheckoutSession, refundStripePayment, stripeRequest } from '../../../_lib/stripe';
import { requireAdmin } from '../../../_lib/adminGuard';

export const runtime = 'nodejs';

const MEMBER_FIELDS =
    'id, owner_id, token_owner_id, token_period_start, space_slug, booking_date, start_time, end_time, hours, tokens_used, tokens_refunded_at, price_cents, currency, status, cancelled_at, created_at, updated_at';
const PUBLIC_FIELDS =
    'id, space_slug, booking_date, start_time, end_time, hours, price_cents, currency, status, customer_name, customer_email, customer_phone, cancelled_at, created_at, updated_at';

function sourceFromRequest(request) {
    const source = new URL(request.url).searchParams.get('source');
    return source === 'member' || source === 'public' ? source : null;
}

function parseDate(value) {
    const clean = typeof value === 'string' ? value.trim() : '';
    const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.toISOString().slice(0, 10) === clean ? clean : null;
}

function parseTime(value) {
    const clean = typeof value === 'string' ? value.trim() : '';
    const match = clean.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3] || 0);
    if (hours > 23 || minutes > 59 || seconds > 59) return null;
    return `${match[1]}:${match[2]}:${String(seconds).padStart(2, '0')}`;
}

function timeToMinutes(value) {
    const [hours, minutes] = String(value).split(':');
    return Number(hours) * 60 + Number(minutes);
}

function isPaidSession(session) {
    return session?.payment_status === 'paid' || session?.payment_status === 'no_payment_required';
}

function tableConfig(source) {
    if (source === 'public') {
        return {
            bookingTable: 'public_room_bookings',
            bookingFields: PUBLIC_FIELDS,
            paymentTable: 'public_room_booking_payments',
            paymentBookingColumn: 'public_room_booking_id',
            activeStatuses: ['pending_payment', 'confirmed']
        };
    }
    return {
        bookingTable: 'room_bookings',
        bookingFields: MEMBER_FIELDS,
        paymentTable: 'room_booking_payments',
        paymentBookingColumn: 'room_booking_id',
        activeStatuses: ['requested', 'approved']
    };
}

async function loadBooking({ admin, id, source }) {
    const config = tableConfig(source);
    const { data, error } = await admin.from(config.bookingTable).select(config.bookingFields).eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
}

async function loadLatestPayment({ admin, id, source }) {
    const config = tableConfig(source);
    const { data, error } = await admin
        .from(config.paymentTable)
        .select(
            `id, ${config.paymentBookingColumn}, amount_cents, currency, status, stripe_checkout_session_id, stripe_payment_intent_id, stripe_refund_id, refunded_at, created_at`
        )
        .eq(config.paymentBookingColumn, id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error && error.code !== '42P01') throw error;
    return error?.code === '42P01' ? null : data;
}

async function findConflicts({ admin, id, source, spaceSlug, bookingDate, startTime, endTime }) {
    let memberQuery = admin
        .from('room_bookings')
        .select('id, start_time, end_time')
        .eq('space_slug', spaceSlug)
        .eq('booking_date', bookingDate)
        .in('status', ['requested', 'approved']);
    let publicQuery = admin
        .from('public_room_bookings')
        .select('id, start_time, end_time')
        .eq('space_slug', spaceSlug)
        .eq('booking_date', bookingDate)
        .in('status', ['pending_payment', 'confirmed']);

    if (source === 'member') memberQuery = memberQuery.neq('id', id);
    if (source === 'public') publicQuery = publicQuery.neq('id', id);

    const [memberResult, publicResult] = await Promise.all([memberQuery, publicQuery]);
    if (memberResult.error) throw memberResult.error;
    if (publicResult.error && publicResult.error.code !== '42P01') throw publicResult.error;

    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    return [...(memberResult.data || []), ...(publicResult.error?.code === '42P01' ? [] : publicResult.data || [])].some(existing => {
        const existingStart = timeToMinutes(existing.start_time);
        const existingEnd = timeToMinutes(existing.end_time);
        return startMinutes < existingEnd && endMinutes > existingStart;
    });
}

async function cancelPayment({ admin, booking, payment, source }) {
    if (!payment) return { method: 'none', amount_cents: 0, status: null };
    if (payment.status === 'refunded' || payment.status === 'refund_pending') {
        return {
            method: 'stripe',
            amount_cents: Number(payment.amount_cents || 0),
            status: payment.status,
            stripe_refund_id: payment.stripe_refund_id || null
        };
    }

    const config = tableConfig(source);
    let session = null;
    const shouldLoadSession =
        payment.stripe_checkout_session_id &&
        (payment.status === 'requires_payment' || (payment.status === 'paid' && !payment.stripe_payment_intent_id));
    if (shouldLoadSession) {
        session = await stripeRequest('GET', `/v1/checkout/sessions/${encodeURIComponent(payment.stripe_checkout_session_id)}`);
    }

    const paid = payment.status === 'paid' || isPaidSession(session);
    const amountCents = Math.max(0, Number(session?.amount_total ?? payment.amount_cents ?? 0));
    const paymentIntentId =
        payment.stripe_payment_intent_id ||
        (typeof session?.payment_intent === 'string' ? session.payment_intent : session?.payment_intent?.id || null);

    if (paid && amountCents > 0) {
        const refund = await refundStripePayment({
            paymentIntentId,
            idempotencyKey: `admin-room-booking-refund-${source}-${booking.id}-${payment.stripe_refund_id || 'initial'}`,
            metadata: {
                booking_id: source === 'member' ? booking.id : null,
                public_room_booking_id: source === 'public' ? booking.id : null,
                source,
                initiated_by: 'admin_booking_cancellation'
            }
        });
        if (refund?.status === 'failed' || refund?.failure_reason) {
            const { error: failedRefundUpdateError } = await admin
                .from(config.paymentTable)
                .update({
                    status: 'paid',
                    stripe_payment_intent_id: paymentIntentId,
                    stripe_refund_id: refund?.id || payment.stripe_refund_id || null,
                    refunded_at: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', payment.id);
            if (failedRefundUpdateError) throw failedRefundUpdateError;
            throw new Error(refund?.failure_reason || 'Stripe could not refund this booking payment.');
        }

        const refundStatus = refund?.status === 'succeeded' || refund?.already_refunded ? 'refunded' : 'refund_pending';
        const now = new Date().toISOString();
        const { error: updateError } = await admin
            .from(config.paymentTable)
            .update({
                status: refundStatus,
                stripe_payment_intent_id: paymentIntentId,
                stripe_refund_id: refund?.id || payment.stripe_refund_id || null,
                refunded_at: refundStatus === 'refunded' ? now : null,
                updated_at: now
            })
            .eq('id', payment.id);
        if (updateError) throw updateError;

        return {
            method: 'stripe',
            amount_cents: amountCents,
            status: refundStatus,
            stripe_refund_id: refund?.id || null
        };
    }

    if (payment.stripe_checkout_session_id && !paid) {
        await expireStripeCheckoutSession(payment.stripe_checkout_session_id);
    }
    const { error: updateError } = await admin
        .from(config.paymentTable)
        .update({ status: paid ? 'refunded' : 'cancelled', refunded_at: paid ? new Date().toISOString() : null })
        .eq('id', payment.id);
    if (updateError) throw updateError;

    return { method: paid ? 'stripe' : 'none', amount_cents: amountCents, status: paid ? 'refunded' : 'cancelled' };
}

export async function PATCH(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const id = params?.id;
    const source = sourceFromRequest(request);
    if (!id) return NextResponse.json({ error: 'Missing booking id.' }, { status: 400 });
    if (!source) return NextResponse.json({ error: 'source must be member or public.' }, { status: 400 });

    try {
        const booking = await loadBooking({ admin: guard.admin, id, source });
        if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
        if (['cancelled', 'expired', 'rejected'].includes(booking.status)) {
            return NextResponse.json({ error: 'Cancelled, expired, or rejected bookings cannot be edited.' }, { status: 409 });
        }

        const payload = await request.json().catch(() => ({}));
        const editableKeys = ['space_slug', 'booking_date', 'start_time', 'end_time'];
        if (!editableKeys.some(key => Object.prototype.hasOwnProperty.call(payload, key))) {
            return NextResponse.json({ error: 'No room, date, or time updates were provided.' }, { status: 400 });
        }

        const spaceSlug = Object.prototype.hasOwnProperty.call(payload, 'space_slug')
            ? typeof payload.space_slug === 'string' && payload.space_slug.trim()
                ? payload.space_slug.trim()
                : null
            : booking.space_slug;
        const bookingDate = Object.prototype.hasOwnProperty.call(payload, 'booking_date') ? parseDate(payload.booking_date) : booking.booking_date;
        const startTime = Object.prototype.hasOwnProperty.call(payload, 'start_time') ? parseTime(payload.start_time) : parseTime(booking.start_time);
        const endTime = Object.prototype.hasOwnProperty.call(payload, 'end_time') ? parseTime(payload.end_time) : parseTime(booking.end_time);

        if (!spaceSlug || !bookingDate || !startTime || !endTime) {
            return NextResponse.json({ error: 'A valid room, date, start time, and end time are required.' }, { status: 400 });
        }
        const startMinutes = timeToMinutes(startTime);
        const endMinutes = timeToMinutes(endTime);
        if (!(endMinutes > startMinutes)) {
            return NextResponse.json({ error: 'End time must be after start time.' }, { status: 400 });
        }

        const { data: space, error: spaceError } = await guard.admin.from('spaces').select('slug').eq('slug', spaceSlug).maybeSingle();
        if (spaceError) throw spaceError;
        if (!space) return NextResponse.json({ error: 'Room not found.' }, { status: 404 });

        const conflict = await findConflicts({
            admin: guard.admin,
            id,
            source,
            spaceSlug,
            bookingDate,
            startTime,
            endTime
        });
        if (conflict) return NextResponse.json({ error: 'Booking conflicts with an existing booking.' }, { status: 409 });

        const config = tableConfig(source);
        const { data: updated, error: updateError } = await guard.admin
            .from(config.bookingTable)
            .update({
                space_slug: spaceSlug,
                booking_date: bookingDate,
                start_time: startTime,
                end_time: endTime,
                hours: Math.ceil((endMinutes - startMinutes) / 60)
            })
            .eq('id', id)
            .select(config.bookingFields)
            .single();
        if (updateError) throw updateError;

        return NextResponse.json({ ok: true, source, booking: updated });
    } catch (error) {
        return NextResponse.json({ error: error?.message || 'Failed to edit booking.' }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const id = params?.id;
    const source = sourceFromRequest(request);
    if (!id) return NextResponse.json({ error: 'Missing booking id.' }, { status: 400 });
    if (!source) return NextResponse.json({ error: 'source must be member or public.' }, { status: 400 });

    try {
        const booking = await loadBooking({ admin: guard.admin, id, source });
        if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });

        const payment = await loadLatestPayment({ admin: guard.admin, id, source });
        const stripeRefund = await cancelPayment({ admin: guard.admin, booking, payment, source });

        let tokensRefunded = booking.tokens_refunded_at ? Number(booking.tokens_used || 0) : 0;
        let cancelled;
        if (source === 'member') {
            const { data, error } = await guard.admin.rpc('refund_room_booking_tokens', { p_booking_id: id });
            if (error) throw error;
            tokensRefunded = tokensRefunded || Number(data || 0);
            cancelled = await loadBooking({ admin: guard.admin, id, source });
        } else {
            const config = tableConfig(source);
            const now = new Date().toISOString();
            const { data, error: cancelError } = await guard.admin
                .from(config.bookingTable)
                .update({ status: 'cancelled', cancelled_at: booking.cancelled_at || now })
                .eq('id', id)
                .select(config.bookingFields)
                .single();
            if (cancelError) throw cancelError;
            cancelled = data;
        }

        return NextResponse.json({
            ok: true,
            source,
            booking: cancelled,
            refund: {
                tokens: tokensRefunded,
                stripe: stripeRefund
            }
        });
    } catch (error) {
        return NextResponse.json({ error: error?.message || 'Failed to cancel booking.' }, { status: 500 });
    }
}
