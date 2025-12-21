import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../../_lib/supabaseAuth';
import { createCheckoutSession, findPromotionCode, getCouponForPromotionCode, stripeRequest } from '../../../_lib/stripe';
import { computeHours, getPricingCents, overlaps } from '../../../rooms/_lib/bookingMath';
import { validateBookingWindow } from '../_lib/bookingRules';

export const runtime = 'nodejs';

function safeText(value, limit = 120) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function toInt(value, fallback = 0) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
}

function computeDiscountCents({ coupon, amountCents }) {
    const amount = Math.max(0, toInt(amountCents, 0));
    if (!coupon || !amount) return 0;
    if (coupon.amount_off) return Math.min(amount, toInt(coupon.amount_off, 0));
    if (coupon.percent_off) {
        const pct = Number(coupon.percent_off);
        if (!Number.isFinite(pct) || pct <= 0) return 0;
        return Math.min(amount, Math.round((amount * pct) / 100));
    }
    return 0;
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

async function createPublicStripeCustomer({ email, name, phone, bookingId }) {
    const idempotencyKey = `public-customer-${bookingId}`;
    const params = {
        email: safeText(email, 200).toLowerCase(),
        name: safeText(name, 200) || undefined,
        phone: safeText(phone, 40) || undefined,
        'metadata[channel]': 'public_room_booking',
        'metadata[public_room_booking_id]': bookingId
    };
    const customer = await stripeRequest('POST', '/v1/customers', params, { idempotencyKey });
    return customer?.id || null;
}

export async function POST(request) {
    let bookingId = null;
    try {
        const payload = await request.json().catch(() => ({}));
        const spaceSlug = safeText(payload?.space_slug, 64);
        const bookingDate = safeText(payload?.booking_date, 20);
        const startTime = safeText(payload?.start_time, 10);
        const endTime = safeText(payload?.end_time, 10);
        const couponCode = safeText(payload?.coupon_code, 40);
        const customerEmail = safeText(payload?.customer_email, 200).toLowerCase();
        const customerName = safeText(payload?.customer_name, 120);
        const customerPhone = safeText(payload?.customer_phone, 40);

        if (!spaceSlug) return NextResponse.json({ error: 'space_slug required.' }, { status: 400 });
        if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
            return NextResponse.json({ error: 'booking_date must be YYYY-MM-DD.' }, { status: 400 });
        }
        if (!customerEmail || !customerEmail.includes('@')) return NextResponse.json({ error: 'Valid customer_email required.' }, { status: 400 });
        if (!customerName) return NextResponse.json({ error: 'customer_name required.' }, { status: 400 });

        const windowCheck = validateBookingWindow({ spaceSlug, bookingDate, startTime, endTime });
        if (!windowCheck.ok) return NextResponse.json({ error: windowCheck.error }, { status: 400 });

        const hours = computeHours({ startTime, endTime });
        if (!hours) return NextResponse.json({ error: 'Invalid time range.' }, { status: 400 });

        const admin = createSupabaseAdminClient();

        const { data: space, error: spaceError } = await admin
            .from('spaces')
            .select('slug, title, pricing_half_day_cents, pricing_full_day_cents, pricing_per_event_cents')
            .eq('slug', spaceSlug)
            .maybeSingle();

        if (spaceError) return NextResponse.json({ error: spaceError.message }, { status: 500 });
        if (!space) return NextResponse.json({ error: 'Room not found.' }, { status: 404 });

        const pricing = getPricingCents(space, hours);
        const basePriceCents = Math.max(0, toInt(pricing.amount, 0));
        if (basePriceCents <= 0) return NextResponse.json({ error: 'This room is not currently bookable online.' }, { status: 400 });

        // Prevent overlap across both member + public bookings.
        const [{ data: memberBookings, error: memberError }, { data: publicBookings, error: publicError }] = await Promise.all([
            admin
                .from('room_bookings')
                .select('start_time, end_time, status')
                .eq('space_slug', spaceSlug)
                .eq('booking_date', bookingDate)
                .in('status', ['requested', 'approved']),
            admin
                .from('public_room_bookings')
                .select('start_time, end_time, status')
                .eq('space_slug', spaceSlug)
                .eq('booking_date', bookingDate)
                .in('status', ['pending_payment', 'confirmed'])
        ]);

        if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });
        if (publicError) return NextResponse.json({ error: publicError.message }, { status: 500 });

        for (const b of memberBookings || []) {
            if (overlaps({ aStart: startTime, aEnd: endTime, bStart: b.start_time, bEnd: b.end_time })) {
                return NextResponse.json({ error: 'That time range includes unavailable time.' }, { status: 409 });
            }
        }
        for (const b of publicBookings || []) {
            if (overlaps({ aStart: startTime, aEnd: endTime, bStart: b.start_time, bEnd: b.end_time })) {
                return NextResponse.json({ error: 'That time range includes unavailable time.' }, { status: 409 });
            }
        }

        let promotionCodeId = null;
        let discountCents = 0;

        if (couponCode && basePriceCents > 0) {
            try {
                const promo = await findPromotionCode({ code: couponCode });
                if (promo?.id) {
                    promotionCodeId = promo.id;
                    const result = await getCouponForPromotionCode({ promotionCodeId });
                    discountCents = computeDiscountCents({ coupon: result?.coupon || null, amountCents: basePriceCents });
                }
            } catch {
                // ignore; coupon will be handled by Stripe if valid, otherwise user sees it in checkout
            }
        }

        const finalPriceCents = Math.max(0, basePriceCents - discountCents);

        const { data: booking, error: bookingError } = await admin
            .from('public_room_bookings')
            .insert({
                space_slug: spaceSlug,
                booking_date: bookingDate,
                start_time: startTime,
                end_time: endTime,
                hours,
                price_cents: finalPriceCents,
                currency: 'NZD',
                status: 'pending_payment',
                customer_name: customerName,
                customer_email: customerEmail,
                customer_phone: customerPhone || null
            })
            .select('id, space_slug, booking_date, start_time, end_time, hours, price_cents, currency, status, customer_email, customer_name')
            .single();

        if (bookingError) return NextResponse.json({ error: bookingError.message }, { status: 500 });
        bookingId = booking.id;

        const customerId = await createPublicStripeCustomer({ email: customerEmail, name: customerName, phone: customerPhone, bookingId });
        if (!customerId) return NextResponse.json({ error: 'Could not create Stripe customer.' }, { status: 500 });

        const siteUrl = getSiteUrl(request);
        const successUrl = `${siteUrl}/bookings/room?stripe=success&booking=${bookingId}`;
        const cancelUrl = `${siteUrl}/bookings/room?stripe=cancel&booking=${bookingId}`;
        const returnUrl = `${siteUrl}/bookings/room?stripe=return&booking=${bookingId}&session_id={CHECKOUT_SESSION_ID}`;

        const session = await createCheckoutSession({
            customerId,
            // Pass the pre-discount amount; Stripe applies the promotion code.
            amountCents: basePriceCents,
            currency: 'NZD',
            description: `Room booking: ${space.title || space.slug} (${bookingDate} ${startTime}–${endTime})`,
            successUrl,
            cancelUrl,
            returnUrl,
            uiMode: 'embedded',
            metadata: {
                channel: 'public_room_booking',
                public_room_booking_id: bookingId,
                space_slug: spaceSlug,
                booking_date: bookingDate,
                start_time: startTime,
                end_time: endTime,
                customer_email: customerEmail,
                coupon_code: couponCode || ''
            },
            promotionCodeId
        });

        const { error: paymentInsertError } = await admin.from('public_room_booking_payments').insert({
            public_room_booking_id: bookingId,
            stripe_customer_id: customerId,
            stripe_checkout_session_id: session.id,
            amount_cents: finalPriceCents,
            currency: 'NZD',
            status: 'requires_payment',
            coupon_code: couponCode || null,
            discount_cents: discountCents
        });

        if (paymentInsertError) {
            return NextResponse.json({ error: 'Booking created but failed to record Stripe checkout session.', detail: paymentInsertError.message }, { status: 500 });
        }

        return NextResponse.json({
            ok: true,
            booking,
            payment: {
                required: true,
                amount_cents: finalPriceCents,
                currency: 'NZD',
                stripe_checkout_session_id: session.id,
                stripe_checkout_client_secret: session.client_secret || null,
                ui_mode: 'embedded'
            }
        });
    } catch (err) {
        const message = err?.message || 'Failed to create booking.';
        if (bookingId) {
            try {
                const admin = createSupabaseAdminClient();
                await admin.from('public_room_bookings').update({ status: 'cancelled' }).eq('id', bookingId);
            } catch {
                // ignore
            }
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
