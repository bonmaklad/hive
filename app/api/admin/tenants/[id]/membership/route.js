import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../_lib/adminGuard';

export const runtime = 'nodejs';

function parseIntSafe(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.floor(number);
}

const PLAN_MONTHLY_CENTS = {
    member: 9900,
    desk: 24900,
    pod: 34900,
    office: 69900,
    premium: 49900,
    custom: 0
};

const OFFICE_MONTHLY_CENTS = {
    'office-a': 69900,
    'office-b': 109900,
    'office-c': 149900
};

const FRIDGE_MONTHLY_CENTS = 2500;

function computeMonthlyCents({ plan, officeId, donationCents, fridgeEnabled, monthlyOverrideCents }) {
    const override = parseIntSafe(monthlyOverrideCents, NaN);
    if (Number.isFinite(override) && override >= 0) return override;

    const base =
        plan === 'office'
            ? OFFICE_MONTHLY_CENTS[officeId] || PLAN_MONTHLY_CENTS.office
            : PLAN_MONTHLY_CENTS[plan] ?? 0;
    const fridge = fridgeEnabled ? FRIDGE_MONTHLY_CENTS : 0;
    return Math.max(0, base + (donationCents || 0) + fridge);
}

function clampInvoiceDay(value, fallbackDay) {
    const n = Number.isFinite(value) ? value : Number(value);
    const day = Number.isFinite(n) ? Math.floor(n) : fallbackDay;
    if (!Number.isFinite(day)) return 1;
    return Math.min(31, Math.max(1, day));
}

function parseDateOnlyString(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, month, day);
    if (Number.isNaN(date.getTime())) return null;
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
    return `${match[1]}-${match[2]}-${match[3]}`;
}

export async function POST(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const tenantId = params?.id;
    if (!tenantId) return NextResponse.json({ error: 'Missing tenant id' }, { status: 400 });

    const payload = await request.json().catch(() => ({}));

    const ownerId = typeof payload?.owner_id === 'string' ? payload.owner_id : null;
    const plan = typeof payload?.plan === 'string' ? payload.plan : null;
    const officeId = typeof payload?.office_id === 'string' ? payload.office_id : null;
    const status = typeof payload?.status === 'string' ? payload.status : 'live';
    const donationCents = parseIntSafe(payload?.donation_cents, 0);
    const fridgeEnabled = Boolean(payload?.fridge_enabled);
    const monthlyOverrideCents = payload?.monthly_amount_cents;
    const invoiceDayRaw = payload?.next_invoice_at ?? payload?.next_invoice_day ?? null;
    const paymentTerms = typeof payload?.payment_terms === 'string' ? payload.payment_terms : null;
    const paidTill = parseDateOnlyString(payload?.paid_till);

    if (!plan) return NextResponse.json({ error: 'Missing plan' }, { status: 400 });
    if (!['live', 'expired', 'cancelled'].includes(status)) {
        return NextResponse.json({ error: 'status must be live/expired/cancelled' }, { status: 400 });
    }
    if (plan === 'office' && !officeId) return NextResponse.json({ error: 'office_id is required for office plan' }, { status: 400 });
    if (paymentTerms && !['invoice', 'auto_card', 'advanced'].includes(paymentTerms)) {
        return NextResponse.json({ error: 'payment_terms must be invoice, auto_card, or advanced.' }, { status: 400 });
    }
    if (paymentTerms === 'advanced' && !paidTill) {
        return NextResponse.json({ error: 'paid_till is required when payment_terms is advanced.' }, { status: 400 });
    }

    let resolvedOwnerId = ownerId;

    if (resolvedOwnerId) {
        const { data: tu, error: tuError } = await guard.admin
            .from('tenant_users')
            .select('tenant_id, user_id')
            .eq('tenant_id', tenantId)
            .eq('user_id', resolvedOwnerId)
            .maybeSingle();

        if (tuError) return NextResponse.json({ error: tuError.message }, { status: 500 });
        if (!tu) return NextResponse.json({ error: 'owner_id is not in this tenant.' }, { status: 400 });
    } else {
        const { data: primaryUsers, error: primaryError } = await guard.admin
            .from('tenant_users')
            .select('user_id, role')
            .eq('tenant_id', tenantId)
            .in('role', ['owner', 'admin'])
            .order('created_at', { ascending: true });

        if (primaryError) return NextResponse.json({ error: primaryError.message }, { status: 500 });
        const owner = (primaryUsers || []).find(u => u.role === 'owner') || (primaryUsers || [])[0] || null;
        resolvedOwnerId = owner?.user_id || null;
    }

    if (!resolvedOwnerId) return NextResponse.json({ error: 'No owner/admin found for this tenant.' }, { status: 400 });

    const monthlyAmountCents = computeMonthlyCents({
        plan,
        officeId,
        donationCents,
        fridgeEnabled,
        monthlyOverrideCents
    });

    const invoiceDay = clampInvoiceDay(invoiceDayRaw, new Date().getDate());

    const membershipPayload = {
        owner_id: resolvedOwnerId,
        status,
        plan,
        office_id: plan === 'office' ? officeId : null,
        donation_cents: Math.max(0, donationCents),
        fridge_enabled: fridgeEnabled,
        monthly_amount_cents: monthlyAmountCents,
        next_invoice_at: invoiceDay,
        updated_at: new Date().toISOString()
    };

    if (paymentTerms) {
        membershipPayload.payment_terms = paymentTerms;
        membershipPayload.paid_till = paymentTerms === 'advanced' ? paidTill : null;
    }

    const { data: existingMembership, error: findError } = await guard.admin
        .from('memberships')
        .select('id')
        .eq('owner_id', resolvedOwnerId)
        .maybeSingle();
    if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });

    if (existingMembership?.id) {
        const { error: updateError } = await guard.admin
            .from('memberships')
            .update(membershipPayload)
            .eq('id', existingMembership.id);
        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    } else {
        const { error: insertError } = await guard.admin.from('memberships').insert(membershipPayload);
        if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, owner_id: resolvedOwnerId, monthly_amount_cents: monthlyAmountCents });
}
