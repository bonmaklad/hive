import { NextResponse } from 'next/server';
import { requireTenantContext } from '../_lib/tenantBilling';
import { computeCashDueCents, computeHours, getPricingCents, monthStart } from '../_lib/bookingMath';
import { findPromotionCode, getCouponForPromotionCode } from '../../_lib/stripe';

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
    if (coupon.amount_off) {
        return Math.min(amount, toInt(coupon.amount_off, 0));
    }
    if (coupon.percent_off) {
        const pct = Number(coupon.percent_off);
        if (!Number.isFinite(pct) || pct <= 0) return 0;
        return Math.min(amount, Math.round((amount * pct) / 100));
    }
    return 0;
}

export async function POST(request) {
    const ctx = await requireTenantContext(request);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const payload = await request.json().catch(() => ({}));
    const spaceSlug = safeText(payload?.space_slug, 64);
    const bookingDate = safeText(payload?.booking_date, 20);
    const startTime = safeText(payload?.start_time, 10);
    const endTime = safeText(payload?.end_time, 10);
    const couponCode = safeText(payload?.coupon_code, 40);

    if (!spaceSlug) return NextResponse.json({ error: 'space_slug required.' }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) return NextResponse.json({ error: 'booking_date must be YYYY-MM-DD.' }, { status: 400 });
    if (!startTime || !endTime) return NextResponse.json({ error: 'start_time and end_time required.' }, { status: 400 });

    const hours = computeHours({ startTime, endTime });
    if (!hours) return NextResponse.json({ error: 'Invalid time range.' }, { status: 400 });

    const { data: space, error: spaceError } = await ctx.admin
        .from('spaces')
        .select('slug, title, pricing_half_day_cents, pricing_full_day_cents, pricing_per_event_cents, tokens_per_hour')
        .eq('slug', spaceSlug)
        .maybeSingle();

    if (spaceError) return NextResponse.json({ error: spaceError.message }, { status: 500 });
    if (!space) return NextResponse.json({ error: 'Room not found.' }, { status: 404 });

    const tokensPerHour = toInt(space.tokens_per_hour ?? 1, 1);
    const requiredTokens = Math.max(0, hours * tokensPerHour);

    const periodStart = monthStart(bookingDate);
    if (!periodStart) return NextResponse.json({ error: 'Invalid booking_date.' }, { status: 400 });

    const { data: credits, error: creditsError } = await ctx.admin
        .from('room_credits')
        .select('tokens_total, tokens_used')
        .eq('owner_id', ctx.tokenOwnerId)
        .eq('period_start', periodStart)
        .maybeSingle();

    if (creditsError) return NextResponse.json({ error: creditsError.message }, { status: 500 });

    const tokensTotal = credits?.tokens_total ?? 0;
    const tokensUsed = credits?.tokens_used ?? 0;
    const tokensLeft = Math.max(0, tokensTotal - tokensUsed);
    const tokensApplied = Math.min(tokensLeft, requiredTokens);

    const pricing = getPricingCents(space, hours);
    const basePriceCents = toInt(pricing.amount, 0);
    const cashDueBeforeDiscountCents = computeCashDueCents({
        basePriceCents,
        requiredTokens,
        tokensApplied
    });

    let promotionCodeId = null;
    let discountCents = 0;
    let coupon = null;
    let couponError = null;

    if (couponCode && cashDueBeforeDiscountCents > 0) {
        try {
            const promo = await findPromotionCode({ code: couponCode });
            if (!promo?.id) {
                couponError = 'Coupon not found.';
            } else {
                promotionCodeId = promo.id;
                const result = await getCouponForPromotionCode({ promotionCodeId });
                coupon = result?.coupon || null;
                discountCents = computeDiscountCents({ coupon, amountCents: cashDueBeforeDiscountCents });
            }
        } catch (err) {
            couponError = err?.message || 'Failed to validate coupon.';
        }
    }

    const finalCashDueCents = Math.max(0, cashDueBeforeDiscountCents - discountCents);

    return NextResponse.json({
        ok: true,
        tenant_id: ctx.tenantId,
        token_owner_id: ctx.tokenOwnerId,
        room: { slug: space.slug, title: space.title },
        booking: { booking_date: bookingDate, start_time: startTime, end_time: endTime, hours },
        tokens: {
            period_start: periodStart,
            tokens_per_hour: tokensPerHour,
            required_tokens: requiredTokens,
            tokens_total: tokensTotal,
            tokens_used: tokensUsed,
            tokens_left: tokensLeft,
            tokens_applied: tokensApplied
        },
        pricing: {
            label: pricing.label,
            base_price_cents: basePriceCents,
            cash_due_before_discount_cents: cashDueBeforeDiscountCents,
            discount_cents: discountCents,
            final_cash_due_cents: finalCashDueCents
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

