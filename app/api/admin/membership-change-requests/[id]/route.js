import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/adminGuard';

export const runtime = 'nodejs';

const PLAN_MONTHLY_CENTS = {
    member: 9900,
    desk: 24900,
    pod: 34900,
    office: 69900,
    premium: 49900
};

const OFFICE_MONTHLY_CENTS = {
    'office-a': 69900,
    'office-b': 109900,
    'office-c': 149900
};

const FRIDGE_MONTHLY_CENTS = 2500;

function computeMonthlyCents({ plan, officeId, donationCents, fridgeEnabled }) {
    const base =
        plan === 'office'
            ? OFFICE_MONTHLY_CENTS[officeId] || PLAN_MONTHLY_CENTS.office
            : PLAN_MONTHLY_CENTS[plan] || 0;
    const fridge = fridgeEnabled ? FRIDGE_MONTHLY_CENTS : 0;
    return Math.max(0, base + (donationCents || 0) + fridge);
}

export async function POST(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const id = params?.id;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const payload = await request.json().catch(() => ({}));
    const action = payload?.action;
    const decisionNote = typeof payload?.decision_note === 'string' ? payload.decision_note.slice(0, 500) : null;

    if (action !== 'approve' && action !== 'reject') {
        return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
    }

    const { data: reqRow, error: reqError } = await guard.admin
        .from('membership_change_requests')
        .select('*')
        .eq('id', id)
        .single();

    if (reqError) return NextResponse.json({ error: reqError.message }, { status: 404 });
    if (reqRow.status !== 'pending') return NextResponse.json({ error: 'Request is not pending.' }, { status: 400 });

    const { error: updateReqError } = await guard.admin
        .from('membership_change_requests')
        .update({
            status: action === 'approve' ? 'approved' : 'rejected',
            decided_at: new Date().toISOString(),
            decided_by: guard.user.id,
            decision_note: decisionNote
        })
        .eq('id', id);

    if (updateReqError) return NextResponse.json({ error: updateReqError.message }, { status: 500 });

    if (action === 'reject') {
        return NextResponse.json({ ok: true });
    }

    const note = String(reqRow.note || '').toLowerCase();
    if (note.includes('cancel')) {
        await guard.admin
            .from('memberships')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('owner_id', reqRow.owner_id);
        return NextResponse.json({ ok: true });
    }

    const nextPlan = reqRow.requested_plan;
    const nextOffice = reqRow.requested_office_id;
    const donationCents = reqRow.requested_donation_cents || 0;
    const fridgeEnabled = Boolean(reqRow.requested_fridge_enabled);

    const monthly = computeMonthlyCents({
        plan: nextPlan,
        officeId: nextOffice,
        donationCents,
        fridgeEnabled
    });

    const membershipPayload = {
        owner_id: reqRow.owner_id,
        status: 'live',
        plan: nextPlan,
        office_id: nextPlan === 'office' ? nextOffice : null,
        donation_cents: donationCents,
        fridge_enabled: fridgeEnabled,
        monthly_amount_cents: monthly,
        updated_at: new Date().toISOString()
    };

    const { data: existingMembership, error: findError } = await guard.admin
        .from('memberships')
        .select('id')
        .eq('owner_id', reqRow.owner_id)
        .maybeSingle();
    if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });

    if (existingMembership?.id) {
        const { error: updateError } = await guard.admin.from('memberships').update(membershipPayload).eq('id', existingMembership.id);
        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    } else {
        const { error: insertError } = await guard.admin.from('memberships').insert(membershipPayload);
        if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
