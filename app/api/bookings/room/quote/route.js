import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../../_lib/supabaseAuth';
import { findPromotionCode, getCouponForPromotionCode } from '../../../_lib/stripe';
import { computeHours, getPricingCents } from '../../../rooms/_lib/bookingMath';
import { validateBookingWindow } from '../_lib/bookingRules';

export const runtime = 'nodejs';

function safeText(value, limit = 80) {
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

export async function POST(request) {
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

    let promotionCodeId = null;
    let discountCents = 0;
    let couponError = null;

    if (couponCode && basePriceCents > 0) {
        try {
            const promo = await findPromotionCode({ code: couponCode });
            if (!promo?.id) {
                couponError = 'Coupon not found.';
            } else {
                promotionCodeId = promo.id;
                const result = await getCouponForPromotionCode({ promotionCodeId });
                discountCents = computeDiscountCents({ coupon: result?.coupon || null, amountCents: basePriceCents });
            }
        } catch (err) {
            couponError = err?.message || 'Failed to validate coupon.';
        }
    }

    const finalCents = Math.max(0, basePriceCents - discountCents);

    return NextResponse.json({
        ok: true,
        room: { slug: space.slug, title: space.title },
        booking: { booking_date: bookingDate, start_time: startTime, end_time: endTime, hours },
        pricing: {
            label: pricing.label,
            base_price_cents: basePriceCents,
            discount_cents: discountCents,
            final_price_cents: finalCents
        },
        coupon: couponCode
            ? {
                  code: couponCode,
                  promotion_code_id: promotionCodeId,
                  valid: Boolean(promotionCodeId && !couponError),
                  error: couponError
              }
            : null
    });
}

