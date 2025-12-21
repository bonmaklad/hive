import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../../_lib/supabaseAuth';
import { stripeRequest } from '../../../_lib/stripe';

export const runtime = 'nodejs';

function safeText(value, limit = 120) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
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

export async function POST(request) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const payload = await request.json().catch(() => ({}));
    const sessionId = safeText(payload?.stripe_checkout_session_id, 200);
    if (!sessionId) return NextResponse.json({ error: 'stripe_checkout_session_id required.' }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const { data: membership, error: membershipError } = await admin
        .from('memberships')
        .select('*')
        .eq('owner_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
    if (!membership) return NextResponse.json({ error: 'Membership not found.' }, { status: 404 });

    let session;
    try {
        session = await stripeRequest('GET', `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Failed to load Stripe session.' }, { status: 500 });
    }

    const metaMembershipId = safeText(session?.metadata?.membership_id, 80);
    const metaOwnerId = safeText(session?.metadata?.owner_id, 80);
    if (!metaMembershipId || metaMembershipId !== membership.id) {
        return NextResponse.json({ error: 'Stripe session does not match this membership.' }, { status: 403 });
    }
    if (!metaOwnerId || metaOwnerId !== user.id) {
        return NextResponse.json({ error: 'Stripe session does not match this user.' }, { status: 403 });
    }

    const stripeSubscriptionId = typeof session?.subscription === 'string' ? session.subscription : session?.subscription?.id;
    if (!stripeSubscriptionId) return NextResponse.json({ error: 'Stripe subscription id missing on session.' }, { status: 400 });

    let nextInvoiceAt = null;
    try {
        const sub = await stripeRequest('GET', `/v1/subscriptions/${encodeURIComponent(stripeSubscriptionId)}`);
        nextInvoiceAt = toDayOfMonth(typeof sub?.current_period_end === 'number' ? sub.current_period_end : NaN);
    } catch {
        nextInvoiceAt = null;
    }

    const { data: updated, error: updateError } = await admin
        .from('memberships')
        .update({
            payment_terms: 'auto_card',
            stripe_subscription_id: stripeSubscriptionId,
            next_invoice_at: nextInvoiceAt || undefined,
            updated_at: new Date().toISOString()
        })
        .eq('id', membership.id)
        .select('*')
        .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({ ok: true, membership: updated });
}
