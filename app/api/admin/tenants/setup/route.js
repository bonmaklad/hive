import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/adminGuard';
import { createSupabaseAnonClient } from '../../../_lib/supabaseAuth';

export const runtime = 'nodejs';

function getSiteUrl() {
    return (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(
        /\/$/,
        ''
    );
}

function safeText(value, limit = 120) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function parseEmail(value) {
    const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!email) return '';
    if (email.length > 254) return '';
    if (!email.includes('@')) return '';
    return email;
}

function parseIntSafe(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.floor(number);
}

function getMonthStart() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-01`;
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

const FRIDGE_WEEKLY_CENTS = 2500;
const WEEKS_PER_MONTH = 4.333;

function computeMonthlyCents({ plan, officeId, donationCents, fridgeEnabled, monthlyOverrideCents }) {
    const override = parseIntSafe(monthlyOverrideCents, NaN);
    if (Number.isFinite(override) && override >= 0) return override;

    const base =
        plan === 'office'
            ? OFFICE_MONTHLY_CENTS[officeId] || PLAN_MONTHLY_CENTS.office
            : PLAN_MONTHLY_CENTS[plan] ?? 0;
    const fridge = fridgeEnabled ? Math.round(FRIDGE_WEEKLY_CENTS * WEEKS_PER_MONTH) : 0;
    return Math.max(0, base + (donationCents || 0) + fridge);
}

async function ensureUser({ guard, email }) {
    const { data: existingProfile, error: profileError } = await guard.admin
        .from('profiles')
        .select('id, email, name')
        .eq('email', email)
        .maybeSingle();

    if (profileError) throw new Error(profileError.message);

    let userId = existingProfile?.id || null;
    let created = false;

    if (!userId) {
        const { data: createdUser, error: createError } = await guard.admin.auth.admin.createUser({
            email,
            email_confirm: true
        });
        if (createError) throw new Error(createError.message);
        userId = createdUser?.user?.id || null;
        created = true;
    }

    if (!userId) throw new Error('Could not resolve user id');

    return { userId, created };
}

async function sendMagicLink({ email }) {
    const redirectTo = `${getSiteUrl()}/auth/callback?next=${encodeURIComponent('/platform/settings')}`;
    const supabase = createSupabaseAnonClient();
    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: false }
    });
    if (error) throw new Error(error.message);
}

export async function POST(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const payload = await request.json().catch(() => ({}));

    const tenantName = safeText(payload?.tenant_name);
    const primaryEmail = parseEmail(payload?.primary_email);
    const primaryRole = typeof payload?.primary_role === 'string' ? payload.primary_role : '';

    const plan = typeof payload?.membership?.plan === 'string' ? payload.membership.plan : '';
    const officeId = typeof payload?.membership?.office_id === 'string' ? payload.membership.office_id : null;
    const status = typeof payload?.membership?.status === 'string' ? payload.membership.status : 'live';
    const donationCents = parseIntSafe(payload?.membership?.donation_cents, 0);
    const fridgeEnabled = Boolean(payload?.membership?.fridge_enabled);
    const monthlyOverrideCents = payload?.membership?.monthly_amount_cents;

    const tokensTotal = parseIntSafe(payload?.tokens_total, NaN);
    const periodStart = typeof payload?.period_start === 'string' ? payload.period_start : getMonthStart();

    const additionalUsers = Array.isArray(payload?.additional_users) ? payload.additional_users : [];
    const sendMagicLinks = Boolean(payload?.send_magic_links);

    if (!tenantName) return NextResponse.json({ error: 'Missing tenant_name' }, { status: 400 });
    if (!primaryEmail) return NextResponse.json({ error: 'Missing primary_email' }, { status: 400 });
    if (!['owner', 'admin'].includes(primaryRole)) {
        return NextResponse.json({ error: 'primary_role must be owner or admin' }, { status: 400 });
    }
    if (!plan) return NextResponse.json({ error: 'Missing membership.plan' }, { status: 400 });
    if (!['live', 'expired', 'cancelled'].includes(status)) {
        return NextResponse.json({ error: 'membership.status must be live/expired/cancelled' }, { status: 400 });
    }
    if (plan === 'office' && !officeId) return NextResponse.json({ error: 'membership.office_id is required for office plan' }, { status: 400 });
    if (!Number.isFinite(tokensTotal) || tokensTotal < 0) return NextResponse.json({ error: 'tokens_total must be >= 0' }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) return NextResponse.json({ error: 'period_start must be YYYY-MM-DD' }, { status: 400 });

    const { data: tenant, error: tenantError } = await guard.admin
        .from('tenants')
        .insert({ name: tenantName })
        .select('id, name, created_at')
        .single();

    if (tenantError) return NextResponse.json({ error: tenantError.message }, { status: 500 });

    try {
        const createdUsers = [];

        const primary = await ensureUser({ guard, email: primaryEmail });
        createdUsers.push({ email: primaryEmail, user_id: primary.userId, role: primaryRole, created: primary.created });

        const { error: upsertPrimaryError } = await guard.admin.from('tenant_users').upsert(
            { tenant_id: tenant.id, user_id: primary.userId, role: primaryRole },
            { onConflict: 'tenant_id,user_id' }
        );
        if (upsertPrimaryError) throw new Error(upsertPrimaryError.message);

        const monthlyAmountCents = computeMonthlyCents({
            plan,
            officeId,
            donationCents,
            fridgeEnabled,
            monthlyOverrideCents
        });

        const { error: membershipError } = await guard.admin.from('memberships').upsert(
            {
                owner_id: primary.userId,
                status,
                plan,
                office_id: plan === 'office' ? officeId : null,
                donation_cents: Math.max(0, donationCents),
                fridge_enabled: fridgeEnabled,
                monthly_amount_cents: monthlyAmountCents,
                next_invoice_at: null,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'owner_id' }
        );
        if (membershipError) throw new Error(membershipError.message);

        const { error: creditsError } = await guard.admin.from('room_credits').upsert(
            {
                owner_id: primary.userId,
                period_start: periodStart,
                tokens_total: tokensTotal,
                tokens_used: 0
            },
            { onConflict: 'owner_id,period_start' }
        );
        if (creditsError) throw new Error(creditsError.message);

        const seenEmails = new Set([primaryEmail]);

        for (const raw of additionalUsers) {
            const email = parseEmail(raw?.email);
            if (!email) continue;
            if (seenEmails.has(email)) continue;
            seenEmails.add(email);

            const role = typeof raw?.role === 'string' ? raw.role : 'member';
            if (!['member', 'admin'].includes(role)) continue;

            const user = await ensureUser({ guard, email });
            createdUsers.push({ email, user_id: user.userId, role, created: user.created });

            const { error: upsertUserError } = await guard.admin.from('tenant_users').upsert(
                { tenant_id: tenant.id, user_id: user.userId, role },
                { onConflict: 'tenant_id,user_id' }
            );
            if (upsertUserError) throw new Error(upsertUserError.message);
        }

        if (sendMagicLinks) {
            for (const u of createdUsers) {
                await sendMagicLink({ email: u.email });
            }
        }

        return NextResponse.json({
            ok: true,
            tenant,
            users: createdUsers,
            magic_links_sent: sendMagicLinks
        });
    } catch (err) {
        return NextResponse.json(
            {
                error: err?.message || 'Failed to set up tenant.',
                tenant
            },
            { status: 500 }
        );
    }
}
