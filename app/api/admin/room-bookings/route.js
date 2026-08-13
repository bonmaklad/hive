import { NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/adminGuard';
import { createStripeInvoiceDraft, ensureStripeCustomer, finalizeAndSendStripeInvoice, stripeRequest, voidStripeInvoice } from '../../_lib/stripe';
import { computeCashDueCents, getPricingCents } from '../../rooms/_lib/bookingMath';
import { fetchCreditsSummary } from '../../rooms/_lib/credits';

export const runtime = 'nodejs';

function parseDate(value) {
    const v = typeof value === 'string' ? value : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    return v;
}

function parseTime(value) {
    const v = typeof value === 'string' ? value : '';
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(v)) return null;
    return v.length === 5 ? `${v}:00` : v;
}

function timeToMinutes(t) {
    const [hh, mm] = String(t).split(':');
    return Number(hh) * 60 + Number(mm);
}

function toInt(value, fallback = 0) {
    const number = Number.isFinite(value) ? value : Number(value);
    return Number.isFinite(number) ? Math.floor(number) : fallback;
}

async function resolveMemberBillingContext(admin, email) {
    const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('id, name, email')
        .ilike('email', email)
        .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return { isMember: false, profile: null };

    const { data: links, error: linksError } = await admin
        .from('tenant_users')
        .select('tenant_id, user_id, role, created_at')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: true });
    if (linksError) throw linksError;

    for (const link of links || []) {
        const { data: tenantUsers, error: tenantUsersError } = await admin
            .from('tenant_users')
            .select('user_id, role, created_at')
            .eq('tenant_id', link.tenant_id)
            .order('created_at', { ascending: true });
        if (tenantUsersError) throw tenantUsersError;

        const tokenOwner =
            (tenantUsers || []).find(user => user.role === 'owner') ||
            (tenantUsers || []).find(user => user.role === 'admin') ||
            (tenantUsers || [])[0] ||
            null;
        if (!tokenOwner?.user_id) continue;

        const { data: membership, error: membershipError } = await admin
            .from('memberships')
            .select('id, owner_id, status, plan, updated_at')
            .eq('owner_id', tokenOwner.user_id)
            .eq('status', 'live')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) continue;

        const [{ data: tenant, error: tenantError }, { data: tokenOwnerProfile, error: tokenOwnerProfileError }] = await Promise.all([
            admin.from('tenants').select('id, name, stripe_customer_id').eq('id', link.tenant_id).maybeSingle(),
            admin.from('profiles').select('id, name, email').eq('id', tokenOwner.user_id).maybeSingle()
        ]);
        if (tenantError) throw tenantError;
        if (tokenOwnerProfileError) throw tokenOwnerProfileError;
        if (!tenant) continue;

        return {
            isMember: true,
            profile,
            tenant,
            membership,
            tokenOwnerId: tokenOwner.user_id,
            tokenOwnerEmail: tokenOwnerProfile?.email || profile.email || email
        };
    }

    return { isMember: false, profile };
}

async function createExternalStripeCustomer({ email, name, bookingId }) {
    const customer = await stripeRequest(
        'POST',
        '/v1/customers',
        {
            email,
            name: name || undefined,
            'metadata[channel]': 'admin_room_booking',
            'metadata[public_room_booking_id]': bookingId
        },
        { idempotencyKey: `admin-public-room-customer-${bookingId}` }
    );
    return customer?.id || null;
}

export async function GET(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const url = new URL(request.url);
    const from = parseDate(url.searchParams.get('from')) || null;
    const to = parseDate(url.searchParams.get('to')) || null;
    const spaceSlug = url.searchParams.get('space_slug') || null;

    let memberQuery = guard.admin
        .from('room_bookings')
        .select(
            'id, owner_id, token_owner_id, token_period_start, space_slug, booking_date, start_time, end_time, hours, tokens_used, tokens_refunded_at, price_cents, currency, status, cancelled_at, created_at, updated_at'
        )
        .order('booking_date', { ascending: false })
        .order('start_time', { ascending: false })
        .limit(300);

    let publicQuery = guard.admin
        .from('public_room_bookings')
        .select(
            'id, space_slug, booking_date, start_time, end_time, hours, price_cents, currency, status, customer_name, customer_email, customer_phone, cancelled_at, created_at, updated_at'
        )
        .order('booking_date', { ascending: false })
        .order('start_time', { ascending: false })
        .limit(300);

    if (from) {
        memberQuery = memberQuery.gte('booking_date', from);
        publicQuery = publicQuery.gte('booking_date', from);
    }
    if (to) {
        memberQuery = memberQuery.lte('booking_date', to);
        publicQuery = publicQuery.lte('booking_date', to);
    }
    if (spaceSlug) {
        memberQuery = memberQuery.eq('space_slug', spaceSlug);
        publicQuery = publicQuery.eq('space_slug', spaceSlug);
    }

    const [memberResult, publicResult] = await Promise.all([memberQuery, publicQuery]);
    if (memberResult.error) return NextResponse.json({ error: memberResult.error.message }, { status: 500 });
    if (publicResult.error && publicResult.error.code !== '42P01') {
        return NextResponse.json({ error: publicResult.error.message }, { status: 500 });
    }

    const memberBookings = memberResult.data || [];
    const publicBookings = publicResult.error?.code === '42P01' ? [] : (publicResult.data || []);

    const ownerIds = Array.from(new Set(memberBookings.map(b => b.owner_id).filter(Boolean)));
    let owners = [];
    if (ownerIds.length) {
        const ownersResult = await guard.admin.from('profiles').select('id, name, email').in('id', ownerIds);
        if (ownersResult.error) return NextResponse.json({ error: ownersResult.error.message }, { status: 500 });
        owners = ownersResult.data || [];
    }
    const ownersById = Object.fromEntries((owners || []).map(p => [p.id, p]));

    const memberBookingIds = memberBookings.map(b => b.id);
    const publicBookingIds = publicBookings.map(b => b.id);
    const memberPaymentsByBookingId = {};
    const publicPaymentsByBookingId = {};
    const [memberPaymentsResult, publicPaymentsResult] = await Promise.all([
        memberBookingIds.length
            ? guard.admin
                .from('room_booking_payments')
                .select(
                    'room_booking_id, status, amount_cents, currency, stripe_checkout_session_id, stripe_invoice_id, stripe_payment_intent_id, stripe_refund_id, refunded_at, created_at'
                )
                .in('room_booking_id', memberBookingIds)
                .order('created_at', { ascending: false })
            : Promise.resolve({ data: [], error: null }),
        publicBookingIds.length
            ? guard.admin
                .from('public_room_booking_payments')
                .select(
                    'public_room_booking_id, status, amount_cents, currency, stripe_checkout_session_id, stripe_invoice_id, stripe_payment_intent_id, stripe_refund_id, refunded_at, created_at'
                )
                .in('public_room_booking_id', publicBookingIds)
                .order('created_at', { ascending: false })
            : Promise.resolve({ data: [], error: null })
    ]);
    if (memberPaymentsResult.error && memberPaymentsResult.error.code !== '42P01') {
        return NextResponse.json({ error: memberPaymentsResult.error.message }, { status: 500 });
    }
    if (publicPaymentsResult.error && publicPaymentsResult.error.code !== '42P01') {
        return NextResponse.json({ error: publicPaymentsResult.error.message }, { status: 500 });
    }
    for (const payment of memberPaymentsResult.data || []) {
        if (!memberPaymentsByBookingId[payment.room_booking_id]) memberPaymentsByBookingId[payment.room_booking_id] = payment;
    }
    for (const payment of publicPaymentsResult.data || []) {
        if (!publicPaymentsByBookingId[payment.public_room_booking_id]) publicPaymentsByBookingId[payment.public_room_booking_id] = payment;
    }

    const bookings = [
        ...memberBookings.map(booking => ({
            ...booking,
            source: 'member',
            owner: ownersById[booking.owner_id] || null,
            customer: ownersById[booking.owner_id] || null,
            payment: memberPaymentsByBookingId[booking.id] || null
        })),
        ...publicBookings.map(booking => ({
            ...booking,
            source: 'public',
            owner_id: null,
            owner: null,
            customer: {
                name: booking.customer_name,
                email: booking.customer_email,
                phone: booking.customer_phone
            },
            payment: publicPaymentsByBookingId[booking.id] || null
        }))
    ]
        .sort((a, b) => {
            const dateOrder = String(b.booking_date).localeCompare(String(a.booking_date));
            if (dateOrder) return dateOrder;
            return String(b.start_time).localeCompare(String(a.start_time));
        })
        .slice(0, 300);

    return NextResponse.json({
        bookings
    });
}

export async function POST(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const payload = await request.json().catch(() => ({}));
    const spaceSlug = typeof payload?.space_slug === 'string' ? payload.space_slug.trim() : null;
    const date = parseDate(payload?.booking_date);
    const startTime = parseTime(payload?.start_time);
    const endTime = parseTime(payload?.end_time);
    const ownerEmail = typeof payload?.owner_email === 'string' ? payload.owner_email.trim().toLowerCase() : '';

    if (!spaceSlug || !date || !startTime || !endTime) {
        return NextResponse.json({ error: 'Missing space_slug, booking_date, start_time, end_time' }, { status: 400 });
    }
    if (!ownerEmail || !ownerEmail.includes('@')) return NextResponse.json({ error: 'A valid customer email is required.' }, { status: 400 });

    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    if (!(endMin > startMin)) return NextResponse.json({ error: 'end_time must be after start_time' }, { status: 400 });

    const hours = Math.ceil((endMin - startMin) / 60);

    const { data: space, error: spaceError } = await guard.admin
        .from('spaces')
        .select('slug, title, tokens_per_hour, pricing_half_day_cents, pricing_full_day_cents, pricing_per_event_cents')
        .eq('slug', spaceSlug)
        .maybeSingle();
    if (spaceError) return NextResponse.json({ error: spaceError.message }, { status: 500 });
    if (!space) return NextResponse.json({ error: 'Room not found.' }, { status: 404 });

    const [memberConflictsResult, publicConflictsResult] = await Promise.all([
        guard.admin
            .from('room_bookings')
            .select('id, start_time, end_time, status')
            .eq('space_slug', spaceSlug)
            .eq('booking_date', date)
            .in('status', ['requested', 'approved']),
        guard.admin
            .from('public_room_bookings')
            .select('id, start_time, end_time, status')
            .eq('space_slug', spaceSlug)
            .eq('booking_date', date)
            .in('status', ['pending_payment', 'confirmed'])
    ]);

    if (memberConflictsResult.error) {
        return NextResponse.json({ error: memberConflictsResult.error.message }, { status: 500 });
    }
    if (publicConflictsResult.error && publicConflictsResult.error.code !== '42P01') {
        return NextResponse.json({ error: publicConflictsResult.error.message }, { status: 500 });
    }

    const conflicts = [
        ...(memberConflictsResult.data || []),
        ...(publicConflictsResult.error?.code === '42P01' ? [] : (publicConflictsResult.data || []))
    ];

    const hasOverlap = conflicts.some(b => {
        const s = timeToMinutes(b.start_time);
        const e = timeToMinutes(b.end_time);
        return startMin < e && endMin > s;
    });

    if (hasOverlap) {
        return NextResponse.json({ error: 'Booking conflicts with an existing booking.' }, { status: 409 });
    }

    let memberBookingId = null;
    let publicBookingId = null;
    let paymentTable = null;
    let paymentBookingColumn = null;
    let stripeInvoiceId = null;
    let memberFinalized = false;

    try {
        const memberContext = await resolveMemberBillingContext(guard.admin, ownerEmail);
        const pricing = getPricingCents(space, hours);
        const basePriceCents = Math.max(0, toInt(pricing.amount, 0));
        const description = `Room booking: ${space.title || space.slug} (${date} ${startTime}–${endTime})`;

        if (memberContext.isMember) {
            const credits = await fetchCreditsSummary({ admin: guard.admin, ownerId: memberContext.tokenOwnerId });
            if (!credits.ok) throw new Error(credits.error);

            const tokensPerHour = Math.max(0, toInt(space.tokens_per_hour ?? 1, 1));
            const requiredTokens = Math.max(0, hours * tokensPerHour);
            const tokensApplied = Math.min(credits.tokensLeft, requiredTokens);
            if (tokensApplied < requiredTokens && basePriceCents <= 0) {
                throw new Error('This room has no cash price configured for the token shortfall.');
            }
            const cashDueCents = computeCashDueCents({ basePriceCents, requiredTokens, tokensApplied });
            const tokenPeriodStart = tokensApplied > 0 ? credits.latestRow?.period_start || null : null;

            const { data: booking, error: bookingError } = await guard.admin
                .from('room_bookings')
                .insert({
                    owner_id: memberContext.profile.id,
                    token_owner_id: memberContext.tokenOwnerId,
                    token_period_start: tokenPeriodStart,
                    space_slug: spaceSlug,
                    booking_date: date,
                    start_time: startTime,
                    end_time: endTime,
                    hours,
                    tokens_used: tokensApplied,
                    price_cents: cashDueCents,
                    currency: 'NZD',
                    status: 'requested'
                })
                .select('*')
                .single();
            if (bookingError) throw bookingError;
            memberBookingId = booking.id;

            let sentInvoice = null;
            if (cashDueCents > 0) {
                const customerId = await ensureStripeCustomer({
                    tenant: memberContext.tenant,
                    tenantId: memberContext.tenant.id,
                    email: memberContext.tokenOwnerEmail
                });
                if (memberContext.tenant.stripe_customer_id !== customerId) {
                    const { error: tenantUpdateError } = await guard.admin
                        .from('tenants')
                        .update({ stripe_customer_id: customerId })
                        .eq('id', memberContext.tenant.id);
                    if (tenantUpdateError) throw tenantUpdateError;
                }

                const invoice = await createStripeInvoiceDraft({
                    customerId,
                    amountCents: cashDueCents,
                    currency: 'NZD',
                    description,
                    metadata: {
                        booking_id: booking.id,
                        tenant_id: memberContext.tenant.id,
                        token_owner_id: memberContext.tokenOwnerId,
                        booking_source: 'member',
                        admin_created: 'true'
                    }
                });
                stripeInvoiceId = invoice.id;
                paymentTable = 'room_booking_payments';
                paymentBookingColumn = 'room_booking_id';

                const { error: paymentError } = await guard.admin.from(paymentTable).insert({
                    room_booking_id: booking.id,
                    tenant_id: memberContext.tenant.id,
                    token_owner_id: memberContext.tokenOwnerId,
                    stripe_customer_id: customerId,
                    stripe_invoice_id: invoice.id,
                    amount_cents: cashDueCents,
                    currency: 'NZD',
                    status: 'requires_payment',
                    discount_cents: 0
                });
                if (paymentError) throw paymentError;
            }

            const { error: finalizeError } = await guard.admin.rpc('finalize_paid_room_booking', {
                p_booking_id: booking.id,
                p_token_owner_id: memberContext.tokenOwnerId
            });
            if (finalizeError) throw finalizeError;
            memberFinalized = true;

            if (stripeInvoiceId) sentInvoice = await finalizeAndSendStripeInvoice(stripeInvoiceId, booking.id);

            const { data: finalizedBooking, error: finalizedBookingError } = await guard.admin
                .from('room_bookings')
                .select('*')
                .eq('id', booking.id)
                .single();
            if (finalizedBookingError) throw finalizedBookingError;

            return NextResponse.json({
                ok: true,
                booking: finalizedBooking,
                source: 'member',
                billing: {
                    member: true,
                    required_tokens: requiredTokens,
                    tokens_used: tokensApplied,
                    invoice_sent: Boolean(sentInvoice),
                    invoice_amount_cents: cashDueCents,
                    stripe_invoice_id: stripeInvoiceId
                }
            });
        }

        if (basePriceCents <= 0) {
            return NextResponse.json({ error: 'This room has no non-member price configured.' }, { status: 400 });
        }

        const customerName = memberContext.profile?.name || ownerEmail;
        const { data: booking, error: bookingError } = await guard.admin
            .from('public_room_bookings')
            .insert({
                space_slug: spaceSlug,
                booking_date: date,
                start_time: startTime,
                end_time: endTime,
                hours,
                price_cents: basePriceCents,
                currency: 'NZD',
                status: 'pending_payment',
                customer_name: customerName,
                customer_email: ownerEmail,
                customer_phone: null
            })
            .select('*')
            .single();
        if (bookingError) throw bookingError;
        publicBookingId = booking.id;

        const customerId = await createExternalStripeCustomer({ email: ownerEmail, name: customerName, bookingId: booking.id });
        if (!customerId) throw new Error('Stripe did not create a customer for this booking.');

        const invoice = await createStripeInvoiceDraft({
            customerId,
            amountCents: basePriceCents,
            currency: 'NZD',
            description,
            metadata: {
                public_room_booking_id: booking.id,
                booking_source: 'public',
                customer_email: ownerEmail,
                admin_created: 'true'
            }
        });
        stripeInvoiceId = invoice.id;
        paymentTable = 'public_room_booking_payments';
        paymentBookingColumn = 'public_room_booking_id';

        const { error: paymentError } = await guard.admin.from(paymentTable).insert({
            public_room_booking_id: booking.id,
            stripe_customer_id: customerId,
            stripe_invoice_id: invoice.id,
            amount_cents: basePriceCents,
            currency: 'NZD',
            status: 'requires_payment',
            discount_cents: 0
        });
        if (paymentError) throw paymentError;

        const sentInvoice = await finalizeAndSendStripeInvoice(invoice.id, booking.id);
        return NextResponse.json({
            ok: true,
            booking,
            source: 'public',
            billing: {
                member: false,
                tokens_used: 0,
                invoice_sent: true,
                invoice_amount_cents: basePriceCents,
                stripe_invoice_id: sentInvoice?.id || invoice.id
            }
        });
    } catch (error) {
        if (stripeInvoiceId) {
            try {
                await voidStripeInvoice(stripeInvoiceId);
            } catch {
                // The original error is more useful to the admin. Stripe can be retried manually if cleanup failed.
            }
        }
        if (paymentTable && paymentBookingColumn && (memberBookingId || publicBookingId)) {
            try {
                await guard.admin
                    .from(paymentTable)
                    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                    .eq(paymentBookingColumn, memberBookingId || publicBookingId);
            } catch {
                // Best-effort cleanup; the booking is also cancelled below.
            }
        }
        if (memberBookingId) {
            try {
                if (memberFinalized) {
                    await guard.admin.rpc('refund_room_booking_tokens', { p_booking_id: memberBookingId });
                } else {
                    await guard.admin
                        .from('room_bookings')
                        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
                        .eq('id', memberBookingId);
                }
            } catch {
                // Best-effort cleanup; surface the original billing failure.
            }
        }
        if (publicBookingId) {
            try {
                await guard.admin
                    .from('public_room_bookings')
                    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
                    .eq('id', publicBookingId);
            } catch {
                // Best-effort cleanup; surface the original billing failure.
            }
        }
        return NextResponse.json({ error: error?.message || 'Failed to create and bill booking.' }, { status: 500 });
    }
}
