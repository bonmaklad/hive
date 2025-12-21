import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseAuth';
import { stripeRequest } from '../../_lib/stripe';

export const runtime = 'nodejs';

async function isAdminUser(admin, userId) {
    const { data, error } = await admin.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
    if (error) return false;
    return Boolean(data?.is_admin);
}

async function isTenantOwner(admin, userId) {
    const { data, error } = await admin.from('tenant_users').select('role').eq('user_id', userId).eq('role', 'owner').limit(1);
    if (error) return false;
    return Boolean(data?.length);
}

export async function POST(request) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const isAdmin = await isAdminUser(admin, user.id);
    const isOwner = await isTenantOwner(admin, user.id);
    if (!isAdmin && !isOwner) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

    const { data: membership, error: membershipError } = await admin
        .from('memberships')
        .select('*')
        .eq('owner_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
    if (!membership) return NextResponse.json({ error: 'Membership not found.' }, { status: 404 });

    const subId = typeof membership?.stripe_subscription_id === 'string' ? membership.stripe_subscription_id.trim() : '';

    if (subId) {
        try {
            await stripeRequest('DELETE', `/v1/subscriptions/${encodeURIComponent(subId)}`, {});
        } catch (err) {
            return NextResponse.json({ error: err?.message || 'Failed to cancel subscription.' }, { status: 500 });
        }
    }

    const { data: updated, error: updateError } = await admin
        .from('memberships')
        .update({
            payment_terms: 'invoice',
            stripe_subscription_id: null,
            updated_at: new Date().toISOString()
        })
        .eq('id', membership.id)
        .select('*')
        .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({ ok: true, membership: updated, cancelled: Boolean(subId) });
}
