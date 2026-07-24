import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../_lib/supabaseAuth';
import {
    createPublicMembershipCheckout,
    preparePublicMembershipSignup
} from '../_lib/publicSignup';

export const runtime = 'nodejs';

export async function POST(request) {
    try {
        const payload = await request.json().catch(() => ({}));
        const admin = createSupabaseAdminClient();

        // This phase is deliberately read-only in HIVE. The auth user, tenant,
        // membership, workspace allocation, and magic links are created only
        // after Stripe sends a verified paid Checkout Session webhook.
        const signup = await preparePublicMembershipSignup({ admin, payload });
        const session = await createPublicMembershipCheckout({ request, signup });
        const checkoutUrl = typeof session?.url === 'string' ? session.url : '';
        if (!checkoutUrl) throw new Error('Stripe did not return a checkout URL.');

        return NextResponse.json({
            ok: true,
            checkout_url: checkoutUrl,
            plan: signup.planConfig.planId,
            weekly_ex_gst_cents: signup.weeklyExGstCents,
            monthly_amount_cents: signup.monthlyAmountCents,
            work_unit_id: signup.selectedWorkUnit?.id || null,
            additional_members_count: signup.additionalMemberEmails.length
        });
    } catch (err) {
        const status = Number.isFinite(err?.status) ? err.status : 500;
        return NextResponse.json(
            {
                error: err?.message || 'Failed to start membership checkout.',
                code: err?.code || null,
                stripe_request_id: err?.requestId || null
            },
            { status: status >= 400 && status < 600 ? status : 500 }
        );
    }
}
