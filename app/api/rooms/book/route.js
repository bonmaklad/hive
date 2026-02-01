import { NextResponse } from 'next/server';
import { requireTenantContext } from '../_lib/tenantBilling';
import { computeCashDueCents, computeHours, getPricingCents, overlaps } from '../_lib/bookingMath';
import { createCheckoutSession, ensureStripeCustomer, findPromotionCode, getCouponForPromotionCode } from '../../_lib/stripe';
import { fetchCreditsSummary } from '../_lib/credits';

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

function timeToMinutes(value) {
    const v = typeof value === 'string' ? value : '';
    const [hh, mm] = v.split(':');
    return Number(hh) * 60 + Number(mm);
}

function isWeekdayDate(dateString) {
    const d = new Date(`${dateString}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return false;
    const day = d.getUTCDay();
    return day >= 1 && day <= 5;
}

function validateBusinessHours({ spaceSlug, bookingDate, startTime, endTime }) {
    // Hive Lounge is after-hours fixed slot (5pm–10pm).
    if (spaceSlug === 'hive-lounge') {
        if (startTime !== '17:00' || endTime !== '22:00') {
            return { ok: false, error: 'Hive Lounge can only be booked for 5:00pm–10:00pm.' };
        }
        return { ok: true };
    }

    // Meeting rooms: Monday–Friday, 9am–5pm.
    if (!isWeekdayDate(bookingDate)) {
        return { ok: false, error: 'Meeting rooms can only be booked Monday to Friday.' };
    }

    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    if (!(endMin > startMin)) return { ok: false, error: 'Invalid time range.' };

    const minStart = 9 * 60;
    const maxEnd = 17 * 60;
    if (startMin < minStart || endMin > maxEnd) {
        return { ok: false, error: 'Bookings must be within 9:00am–5:00pm.' };
    }

    return { ok: true };
}

export async function POST(request) {
    let bookingId = null;
    let ctx = null;
    try {
        ctx = await requireTenantContext(request);
        if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

        const payload = await request.json().catch(() => ({}));
        const spaceSlug = safeText(payload?.space_slug, 64);
        const bookingDate = safeText(payload?.booking_date, 20);
        const startTime = safeText(payload?.start_time, 10);
        const endTime = safeText(payload?.end_time, 10);
        const couponCode = safeText(payload?.coupon_code, 40);

        if (!spaceSlug) return NextResponse.json({ error: 'space_slug required.' }, { status: 400 });
        if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
            return NextResponse.json({ error: 'booking_date must be YYYY-MM-DD.' }, { status: 400 });
        }
        if (!startTime || !endTime) return NextResponse.json({ error: 'start_time and end_time required.' }, { status: 400 });

        const hoursCheck = validateBusinessHours({ spaceSlug, bookingDate, startTime, endTime });
        if (!hoursCheck.ok) return NextResponse.json({ error: hoursCheck.error }, { status: 400 });

        const hours = computeHours({ startTime, endTime });
        if (!hours) return NextResponse.json({ error: 'Invalid time range.' }, { status: 400 });

        // Load room pricing/token cost.
        const { data: space, error: spaceError } = await ctx.admin
            .from('spaces')
            .select('slug, title, pricing_half_day_cents, pricing_full_day_cents, pricing_per_event_cents, tokens_per_hour')
            .eq('slug', spaceSlug)
            .maybeSingle();

        if (spaceError) return NextResponse.json({ error: spaceError.message }, { status: 500 });
        if (!space) return NextResponse.json({ error: 'Room not found.' }, { status: 404 });

        // Prevent overlap (server-side).
        const [{ data: existing, error: existingError }, publicExistingResult] = await Promise.all([
            ctx.admin
                .from('room_bookings')
                .select('start_time, end_time, status')
                .eq('space_slug', spaceSlug)
                .eq('booking_date', bookingDate)
                .in('status', ['requested', 'approved']),
            ctx.admin
                .from('public_room_bookings')
                .select('start_time, end_time, status')
                .eq('space_slug', spaceSlug)
                .eq('booking_date', bookingDate)
                .in('status', ['pending_payment', 'confirmed'])
        ]);

        if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
        const publicExistingError = publicExistingResult?.error || null;
        const publicExisting = publicExistingError?.code === '42P01' ? [] : (publicExistingResult?.data || []);
        if (publicExistingError && publicExistingError.code !== '42P01') {
            return NextResponse.json({ error: publicExistingError.message }, { status: 500 });
        }

        for (const b of existing || []) {
            if (overlaps({ aStart: startTime, aEnd: endTime, bStart: b.start_time, bEnd: b.end_time })) {
                return NextResponse.json({ error: 'That time range includes unavailable time.' }, { status: 409 });
            }
        }
        for (const b of publicExisting || []) {
            if (overlaps({ aStart: startTime, aEnd: endTime, bStart: b.start_time, bEnd: b.end_time })) {
                return NextResponse.json({ error: 'That time range includes unavailable time.' }, { status: 409 });
            }
        }

        const tokensPerHour = toInt(space.tokens_per_hour ?? 1, 1);
        const requiredTokens = Math.max(0, hours * tokensPerHour);

        const credits = await fetchCreditsSummary({ admin: ctx.admin, ownerId: ctx.tokenOwnerId });
        if (!credits.ok) return NextResponse.json({ error: credits.error }, { status: 500 });

        const tokensLeft = credits.tokensLeft;
        const tokensApplied = Math.min(tokensLeft, requiredTokens);

        const pricing = getPricingCents(space, hours);
        const basePriceCents = toInt(pricing.amount, 0);
        const cashDueBeforeDiscountCents = computeCashDueCents({ basePriceCents, requiredTokens, tokensApplied });

        let promotionCodeId = null;
        let discountCents = 0;

        if (couponCode && cashDueBeforeDiscountCents > 0) {
            const promo = await findPromotionCode({ code: couponCode });
            if (!promo?.id) return NextResponse.json({ error: 'Coupon not found.' }, { status: 400 });
            promotionCodeId = promo.id;
            const result = await getCouponForPromotionCode({ promotionCodeId });
            discountCents = computeDiscountCents({ coupon: result?.coupon || null, amountCents: cashDueBeforeDiscountCents });
        }

        const finalCashDueCents = Math.max(0, cashDueBeforeDiscountCents - discountCents);

        // Create booking. If payment required, keep status requested until webhook marks it approved.
        const bookingStatus = finalCashDueCents === 0 ? 'approved' : 'requested';

        const { data: booking, error: bookingError } = await ctx.admin
            .from('room_bookings')
            .insert({
                owner_id: ctx.user.id,
                space_slug: spaceSlug,
                booking_date: bookingDate,
                start_time: startTime,
                end_time: endTime,
                hours,
                // Always record the tokens actually applied (can be partial if a coupon covers the remainder).
                tokens_used: tokensApplied,
                price_cents: bookingStatus === 'approved' ? 0 : finalCashDueCents,
                status: bookingStatus
            })
            .select('id, owner_id, space_slug, booking_date, start_time, end_time, hours, tokens_used, price_cents, status')
            .single();

        if (bookingError) return NextResponse.json({ error: bookingError.message }, { status: 500 });
        bookingId = booking.id;

        if (bookingStatus === 'approved') {
            // Deduct tokens immediately (tenant token owner).
            if (tokensApplied > 0) {
                const latestPeriodStart = credits.latestRow?.period_start || null;
                if (!latestPeriodStart) {
                    return NextResponse.json(
                        { error: 'Booking created but failed to update token usage.', detail: 'No token credits found.', booking },
                        { status: 500 }
                    );
                }

                const currentUsed = toInt(credits.latestRow?.tokens_used, 0);
                const newUsed = Math.max(0, currentUsed + tokensApplied);
                const { error: updateCreditsError } = await ctx.admin
                    .from('room_credits')
                    .update({ tokens_used: newUsed })
                    .eq('owner_id', ctx.tokenOwnerId)
                    .eq('period_start', latestPeriodStart);

                if (updateCreditsError) {
                    return NextResponse.json(
                        { error: 'Booking created but failed to update token usage.', detail: updateCreditsError.message, booking },
                        { status: 500 }
                    );
                }
            }

            return NextResponse.json({
                ok: true,
                booking,
                payment: { required: false, amount_cents: 0, currency: 'NZD' }
            });
        }

        // Payment required: create/ensure Stripe customer, create Checkout session, track payment row.
        const tenantCustomerId = await ensureStripeCustomer({ tenant: ctx.tenant, tenantId: ctx.tenantId, email: ctx.tokenOwnerEmail });

        // Persist customer id if missing/different (best-effort).
        if (ctx.tenant?.stripe_customer_id !== tenantCustomerId) {
            await ctx.admin.from('tenants').update({ stripe_customer_id: tenantCustomerId }).eq('id', ctx.tenantId);
        }

        const siteUrl = getSiteUrl(request);
        const successUrl = `${siteUrl}/platform/rooms?stripe=success&booking=${booking.id}`;
        const cancelUrl = `${siteUrl}/platform/rooms?stripe=cancel&booking=${booking.id}`;
        const returnUrl = `${siteUrl}/platform/rooms?stripe=return&booking=${booking.id}&session_id={CHECKOUT_SESSION_ID}`;

        const session = await createCheckoutSession({
            customerId: tenantCustomerId,
            // IMPORTANT: pass the pre-discount amount and let Stripe apply the promotion code.
            // Otherwise we'd double-discount (once here and again in Stripe).
            amountCents: cashDueBeforeDiscountCents,
            currency: 'NZD',
            description: `Room booking: ${space.title || space.slug} (${bookingDate} ${startTime}–${endTime})`,
            successUrl,
            cancelUrl,
            returnUrl,
            uiMode: 'embedded',
            metadata: {
                booking_id: booking.id,
                tenant_id: ctx.tenantId,
                token_owner_id: ctx.tokenOwnerId,
                booking_date: bookingDate,
                space_slug: spaceSlug,
                tokens_applied: String(tokensApplied),
                required_tokens: String(requiredTokens),
                base_price_cents: String(basePriceCents),
                discount_cents: String(discountCents),
                coupon_code: couponCode || ''
            },
            promotionCodeId
        });

        const { error: paymentInsertError } = await ctx.admin.from('room_booking_payments').insert({
            room_booking_id: booking.id,
            tenant_id: ctx.tenantId,
            token_owner_id: ctx.tokenOwnerId,
            stripe_customer_id: tenantCustomerId,
            stripe_checkout_session_id: session.id,
            amount_cents: finalCashDueCents,
            currency: 'NZD',
            status: 'requires_payment',
            coupon_code: couponCode || null,
            discount_cents: discountCents
        });

        if (paymentInsertError) {
            return NextResponse.json(
                { error: 'Booking created but failed to record Stripe checkout session.', detail: paymentInsertError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            ok: true,
            booking,
            payment: {
                required: true,
                amount_cents: finalCashDueCents,
                discount_cents: discountCents,
                currency: 'NZD',
                checkout_url: session.url,
                stripe_checkout_session_id: session.id,
                stripe_checkout_client_secret: session.client_secret || null,
                ui_mode: 'embedded'
            }
        });
    } catch (err) {
        const message = err?.message || 'Failed to create booking.';
        // If we created a booking but Stripe failed, cancel it so it doesn't block the slot.
        if (ctx?.admin && bookingId) {
            try {
                await ctx.admin.from('room_bookings').update({ status: 'cancelled' }).eq('id', bookingId);
            } catch {
                // ignore
            }
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
