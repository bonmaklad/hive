import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, createSupabaseAnonClient } from '../../_lib/supabaseAuth';
import { ensureStripeCustomer, stripeRequest } from '../../_lib/stripe';
import { HIVE_MEMBER_WEEKLY_EX_GST_CENTS, computeMonthlyFromWeeklyExGstCents } from '@/lib/membershipPricing';

export const runtime = 'nodejs';

const DEFAULT_TOKENS_TOTAL = 10;
const ADDITIONAL_MEMBER_WEEKLY_EX_GST_CENTS = HIVE_MEMBER_WEEKLY_EX_GST_CENTS;

const PLAN_CONFIG = {
    member: {
        planId: 'member',
        label: 'Hive membership',
        productName: 'HIVE Membership (Hive membership)',
        requiresWorkUnit: false,
        allowedUnitTypes: [],
        defaultWeeklyExGstCents: HIVE_MEMBER_WEEKLY_EX_GST_CENTS
    },
    desk: {
        planId: 'desk',
        label: 'Assigned desk',
        productName: 'HIVE Membership (Assigned desk)',
        requiresWorkUnit: true,
        allowedUnitTypes: ['desk', 'desk_pod'],
        defaultWeeklyExGstCents: 5000
    },
    office: {
        planId: 'office',
        label: 'Private office',
        productName: 'HIVE Membership (Private office)',
        requiresWorkUnit: true,
        allowedUnitTypes: ['private_office', 'small_office', 'premium_office'],
        defaultWeeklyExGstCents: 12500
    }
};

function createHttpError(message, status = 400) {
    const err = new Error(message);
    err.status = status;
    return err;
}

function safeText(value, limit = 160) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function parseEmail(value) {
    const email = safeText(value, 254).toLowerCase();
    if (!email || !email.includes('@')) return '';
    return email;
}

function parseAdditionalMemberEmails(rawValue, ownerEmail) {
    const source = Array.isArray(rawValue) ? rawValue : [];
    const owner = parseEmail(ownerEmail);
    const seen = new Set();
    const out = [];

    for (let i = 0; i < source.length; i += 1) {
        const item = source[i];
        const email = parseEmail(typeof item === 'string' ? item : item?.email);
        if (!email) {
            throw createHttpError(`Additional member ${i + 1} must have a valid email address.`, 400);
        }
        if (owner && email === owner) {
            throw createHttpError(`Additional member ${i + 1} cannot use the primary business email.`, 400);
        }
        if (seen.has(email)) {
            throw createHttpError(`Additional member ${i + 1} duplicates another additional member email.`, 400);
        }
        seen.add(email);
        out.push(email);
    }

    return out;
}

function toPositiveInt(value, fallback = 1) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.floor(n));
}

function toIsoDate(date) {
    return date.toISOString().slice(0, 10);
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

function getMonthStart() {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-01`;
}

function resolvePlanConfig(rawPlan) {
    const plan = safeText(rawPlan, 24).toLowerCase() || 'member';
    const config = PLAN_CONFIG[plan] || null;
    if (!config) {
        throw createHttpError('Unsupported plan. Choose member, desk, or office.', 400);
    }
    return { key: plan, config };
}

function resolveUnitPriceCents(unit) {
    const candidates = [unit?.price_cents, unit?.custom_price_cents, unit?.base_price_cents];
    for (const value of candidates) {
        const n = Number.isFinite(value) ? value : Number(value);
        if (Number.isFinite(n) && n > 0) return Math.floor(n);
    }
    return 0;
}

function resolveUnitIsActive(unit) {
    const active = unit?.active;
    const isActive = unit?.is_active;
    if (typeof active === 'boolean') return active;
    if (typeof isActive === 'boolean') return isActive;
    return true;
}

function toUnitCode(building, unitNumber) {
    const b = safeText(building, 50);
    const n = Number.isFinite(unitNumber) ? String(unitNumber) : safeText(unitNumber, 30);
    if (!b || !n) return '';
    return `${b}.${n}`;
}

async function findUserByEmail(admin, email) {
    const { data, error } = await admin.from('profiles').select('id, email').ilike('email', email).limit(1);
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : null;
    return row || null;
}

async function ensureUser({ admin, email, displayName }) {
    const existing = await findUserByEmail(admin, email);
    if (existing?.id) return { userId: existing.id, created: false };

    const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: displayName ? { name: displayName } : undefined
    });
    if (error) throw new Error(error.message || 'Could not create user.');

    const userId = data?.user?.id || null;
    if (!userId) throw new Error('Could not resolve user id.');
    return { userId, created: true };
}

async function resolveOrCreateOwnerTenant({ admin, userId, tenantName }) {
    const { data: ownerLinks, error: ownerLinkError } = await admin
        .from('tenant_users')
        .select('tenant_id, created_at')
        .eq('user_id', userId)
        .eq('role', 'owner')
        .order('created_at', { ascending: true })
        .limit(1);
    if (ownerLinkError) throw new Error(ownerLinkError.message);

    const ownerTenantId = Array.isArray(ownerLinks) ? ownerLinks[0]?.tenant_id : null;
    if (ownerTenantId) {
        const { data: existingTenant, error: existingTenantError } = await admin
            .from('tenants')
            .select('id, name, stripe_customer_id')
            .eq('id', ownerTenantId)
            .maybeSingle();
        if (existingTenantError) throw new Error(existingTenantError.message);
        if (!existingTenant) throw new Error('Linked tenant could not be found.');
        return existingTenant;
    }

    const { data: tenant, error: tenantError } = await admin
        .from('tenants')
        .insert({ name: tenantName })
        .select('id, name, stripe_customer_id')
        .single();
    if (tenantError) throw new Error(tenantError.message);

    const { error: tenantUserError } = await admin.from('tenant_users').upsert(
        { tenant_id: tenant.id, user_id: userId, role: 'owner' },
        { onConflict: 'tenant_id,user_id' }
    );
    if (tenantUserError) throw new Error(tenantUserError.message);

    return tenant;
}

async function ensureAdditionalMembers({ admin, tenantId, emails }) {
    const list = Array.isArray(emails) ? emails : [];
    for (const email of list) {
        const user = await ensureUser({ admin, email, displayName: '' });
        const { error: tenantUserError } = await admin.from('tenant_users').upsert(
            { tenant_id: tenantId, user_id: user.userId, role: 'member' },
            { onConflict: 'tenant_id,user_id' }
        );
        if (tenantUserError) throw new Error(tenantUserError.message);
    }
}

async function ensureWorkspaceSelection({ admin, tenantId, planConfig, workUnitId }) {
    if (!planConfig.requiresWorkUnit) {
        return { weeklyExGstCents: planConfig.defaultWeeklyExGstCents, selectedWorkUnit: null, officeCode: null };
    }

    const safeWorkUnitId = safeText(workUnitId, 80);
    if (!safeWorkUnitId) {
        throw createHttpError('Please choose an available workspace before continuing.', 400);
    }

    const { data: unit, error: unitError } = await admin.from('work_units').select('*').eq('id', safeWorkUnitId).maybeSingle();
    if (unitError) throw new Error(unitError.message);
    if (!unit) throw createHttpError('The selected workspace could not be found.', 404);

    if (!resolveUnitIsActive(unit)) {
        throw createHttpError('This workspace is no longer available.', 409);
    }

    const unitType = safeText(unit?.unit_type, 50);
    if (!planConfig.allowedUnitTypes.includes(unitType)) {
        throw createHttpError('The selected workspace does not match this plan type.', 400);
    }

    const weeklyExGstCents = resolveUnitPriceCents(unit);
    if (weeklyExGstCents <= 0) {
        throw createHttpError('Pricing for the selected workspace is not configured yet. Please contact HIVE admin.', 400);
    }

    const today = toIsoDate(new Date());

    const { data: unitAllocations, error: unitAllocError } = await admin
        .from('work_unit_allocations')
        .select('id, tenant_id')
        .eq('work_unit_id', safeWorkUnitId)
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gt.${today}`);
    if (unitAllocError) throw new Error(unitAllocError.message);

    const currentAllocations = Array.isArray(unitAllocations) ? unitAllocations : [];
    const tenantAlreadyOnUnit = currentAllocations.some(row => row?.tenant_id === tenantId);
    const occupiedCount = currentAllocations.length;
    const capacity = toPositiveInt(unit?.capacity, 1);

    if (!tenantAlreadyOnUnit && occupiedCount >= capacity) {
        throw createHttpError('That workspace was just taken. Please choose another available option.', 409);
    }

    const { data: tenantAllocations, error: tenantAllocError } = await admin
        .from('work_unit_allocations')
        .select('id, work_unit_id')
        .eq('tenant_id', tenantId)
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gt.${today}`);
    if (tenantAllocError) throw new Error(tenantAllocError.message);

    const activeTenantAllocations = Array.isArray(tenantAllocations) ? tenantAllocations : [];
    const hasDifferentActiveAllocation = activeTenantAllocations.some(row => row?.work_unit_id && row.work_unit_id !== safeWorkUnitId);
    if (hasDifferentActiveAllocation) {
        throw createHttpError('This tenant already has an active workspace. Contact HIVE admin to switch units.', 409);
    }

    if (!tenantAlreadyOnUnit && !activeTenantAllocations.some(row => row?.work_unit_id === safeWorkUnitId)) {
        const { error: insertAllocationError } = await admin.from('work_unit_allocations').insert({
            work_unit_id: safeWorkUnitId,
            tenant_id: tenantId,
            start_date: today,
            end_date: null,
            price_cents: weeklyExGstCents
        });
        if (insertAllocationError) throw new Error(insertAllocationError.message);
    }

    return {
        weeklyExGstCents,
        selectedWorkUnit: {
            id: unit.id,
            building: unit?.building ?? null,
            unit_number: unit?.unit_number ?? null,
            unit_type: unitType
        },
        officeCode: toUnitCode(unit?.building, unit?.unit_number) || safeWorkUnitId
    };
}

async function upsertMembership({ admin, ownerId, planId, monthlyAmountCents, officeId }) {
    const { data: memberships, error: membershipsError } = await admin
        .from('memberships')
        .select('id, stripe_subscription_id')
        .eq('owner_id', ownerId)
        .order('updated_at', { ascending: false })
        .limit(1);
    if (membershipsError) throw new Error(membershipsError.message);

    const existing = Array.isArray(memberships) ? memberships[0] : null;
    if (existing?.stripe_subscription_id) {
        throw createHttpError('Automatic payments are already active for this account. Use your magic link to sign in.', 409);
    }

    const nowIso = new Date().toISOString();
    const payload = {
        owner_id: ownerId,
        status: 'live',
        plan: planId,
        office_id: planId === 'office' ? officeId : null,
        donation_cents: 0,
        fridge_enabled: false,
        currency: 'NZD',
        monthly_amount_cents: monthlyAmountCents,
        payment_terms: 'invoice',
        stripe_subscription_id: null,
        next_invoice_at: new Date().getUTCDate(),
        updated_at: nowIso
    };

    if (existing?.id) {
        const { data: updated, error: updateError } = await admin.from('memberships').update(payload).eq('id', existing.id).select('id').single();
        if (updateError) throw new Error(updateError.message);
        return updated;
    }

    const { data: inserted, error: insertError } = await admin.from('memberships').insert(payload).select('id').single();
    if (insertError) throw new Error(insertError.message);
    return inserted;
}

async function ensureTokenGrant({ admin, ownerId }) {
    const periodStart = getMonthStart();
    const { data: credit, error } = await admin
        .from('room_credits')
        .select('owner_id, period_start, tokens_total')
        .eq('owner_id', ownerId)
        .eq('period_start', periodStart)
        .maybeSingle();

    if (error && error.code !== 'PGRST116') throw new Error(error.message);

    if (!credit) {
        const { error: insertError } = await admin.from('room_credits').insert({
            owner_id: ownerId,
            period_start: periodStart,
            tokens_total: DEFAULT_TOKENS_TOTAL,
            tokens_used: 0
        });
        if (insertError) throw new Error(insertError.message);
        return;
    }

    if (Number(credit.tokens_total || 0) >= DEFAULT_TOKENS_TOTAL) return;

    const { error: updateError } = await admin
        .from('room_credits')
        .update({ tokens_total: DEFAULT_TOKENS_TOTAL })
        .eq('owner_id', ownerId)
        .eq('period_start', periodStart);
    if (updateError) throw new Error(updateError.message);
}

async function upsertTenantInfo({ admin, tenantId, email, contactName, phone, profileName, officeLocation }) {
    const { error } = await admin.from('tenant_info').upsert(
        {
            tenant_id: tenantId,
            email: email || null,
            phone: phone || null,
            key_contact_name: contactName || null,
            profile_name: profileName || null,
            office_location: officeLocation || null
        },
        { onConflict: 'tenant_id' }
    );
    if (error && error.code !== '42P01') throw new Error(error.message);
}

async function provisionTenantStorage({ admin, tenantId }) {
    const BUCKET = 'tenant-docs';
    try {
        await admin.storage.createBucket(BUCKET, { public: false });
    } catch {
        // ignore bucket already exists
    }

    try {
        await admin.storage.from(BUCKET).upload(`${tenantId}/.keep`, Buffer.from(''), {
            contentType: 'text/plain',
            upsert: false
        });
    } catch {
        // ignore existing placeholder
    }
}

async function sendMagicLink({ email, request }) {
    const siteUrl = getSiteUrl(request);
    const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent('/platform/membership')}`;
    const supabase = createSupabaseAnonClient();
    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
            emailRedirectTo: redirectTo,
            shouldCreateUser: false
        }
    });
    if (error) throw new Error(error.message);
}

async function createMembershipCheckout({
    request,
    customerId,
    membershipId,
    tenantId,
    ownerId,
    monthlyAmountCents,
    weeklyExGstCents,
    planConfig,
    selectedWorkUnit,
    additionalMembersCount
}) {
    const siteUrl = getSiteUrl(request);
    const successUrl = `${siteUrl}/login?next=${encodeURIComponent('/platform/membership')}&signup=success`;
    const cancelUrl = `${siteUrl}/?membershipSignup=cancelled#memberships`;
    const idempotencyKey = `public-membership-signup-${membershipId}-${monthlyAmountCents}`;

    const unitLabel = selectedWorkUnit ? toUnitCode(selectedWorkUnit.building, selectedWorkUnit.unit_number) : '';

    const additionalMembersLabel = additionalMembersCount > 0 ? ` + ${additionalMembersCount} additional member(s)` : '';
    const description = unitLabel
        ? `${planConfig.label} (${unitLabel})${additionalMembersLabel} • ${Math.round(weeklyExGstCents / 100)} + GST per week, billed monthly`
        : `${planConfig.label}${additionalMembersLabel} • ${Math.round(weeklyExGstCents / 100)} + GST per week, billed monthly`;

    const session = await stripeRequest(
        'POST',
        '/v1/checkout/sessions',
        {
            mode: 'subscription',
            customer: customerId,
            success_url: successUrl,
            cancel_url: cancelUrl,
            billing_address_collection: 'required',
            'customer_update[address]': 'auto',
            'automatic_tax[enabled]': 'true',
            'line_items[0][quantity]': '1',
            'line_items[0][price_data][currency]': 'nzd',
            'line_items[0][price_data][unit_amount]': String(monthlyAmountCents),
            'line_items[0][price_data][tax_behavior]': 'inclusive',
            'line_items[0][price_data][recurring][interval]': 'month',
            'line_items[0][price_data][product_data][name]': planConfig.productName,
            'line_items[0][price_data][product_data][description]': description,
            'metadata[membership_id]': membershipId,
            'metadata[tenant_id]': tenantId,
            'metadata[owner_id]': ownerId,
            'metadata[channel]': 'public_membership_signup',
            'metadata[plan]': planConfig.planId,
            'metadata[work_unit_id]': selectedWorkUnit?.id || '',
            'metadata[additional_members_count]': String(Math.max(0, Number(additionalMembersCount || 0))),
            'subscription_data[metadata][membership_id]': membershipId,
            'subscription_data[metadata][tenant_id]': tenantId,
            'subscription_data[metadata][owner_id]': ownerId,
            'subscription_data[metadata][channel]': 'public_membership_signup',
            'subscription_data[metadata][plan]': planConfig.planId,
            'subscription_data[metadata][work_unit_id]': selectedWorkUnit?.id || '',
            'subscription_data[metadata][additional_members_count]': String(Math.max(0, Number(additionalMembersCount || 0)))
        },
        { idempotencyKey }
    );

    return session;
}

export async function POST(request) {
    try {
        const payload = await request.json().catch(() => ({}));

        const tenantName = safeText(payload?.tenant_name, 120);
        const email = parseEmail(payload?.email);
        const contactName = safeText(payload?.contact_name, 120);
        const phone = safeText(payload?.phone, 40);
        const workUnitId = safeText(payload?.work_unit_id, 80);
        const { config: planConfig } = resolvePlanConfig(payload?.plan);
        const additionalMemberEmailsRaw = payload?.additional_members;

        if (!tenantName) return NextResponse.json({ error: 'Business name is required.' }, { status: 400 });
        if (!email) return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });

        const admin = createSupabaseAdminClient();

        const { userId } = await ensureUser({ admin, email, displayName: contactName || tenantName });
        const tenant = await resolveOrCreateOwnerTenant({ admin, userId, tenantName });

        const workspace = await ensureWorkspaceSelection({
            admin,
            tenantId: tenant.id,
            planConfig,
            workUnitId
        });

        const additionalMemberEmails = planConfig.planId === 'office'
            ? parseAdditionalMemberEmails(additionalMemberEmailsRaw, email)
            : [];
        if (additionalMemberEmails.length > 25) {
            throw createHttpError('Maximum 25 additional members for office signup.', 400);
        }

        const baseWeeklyExGstCents = workspace.weeklyExGstCents || planConfig.defaultWeeklyExGstCents;
        const additionalWeeklyExGstCents = planConfig.planId === 'office'
            ? additionalMemberEmails.length * ADDITIONAL_MEMBER_WEEKLY_EX_GST_CENTS
            : 0;
        const weeklyExGstCents = baseWeeklyExGstCents + additionalWeeklyExGstCents;

        const monthlyAmountCents = computeMonthlyFromWeeklyExGstCents(weeklyExGstCents);

        const membership = await upsertMembership({
            admin,
            ownerId: userId,
            planId: planConfig.planId,
            monthlyAmountCents,
            officeId: workspace.officeCode
        });

        await ensureTokenGrant({ admin, ownerId: userId });
        if (planConfig.planId === 'office' && additionalMemberEmails.length) {
            await ensureAdditionalMembers({ admin, tenantId: tenant.id, emails: additionalMemberEmails });
        }
        await upsertTenantInfo({
            admin,
            tenantId: tenant.id,
            email,
            contactName,
            phone,
            profileName: tenantName,
            officeLocation: workspace.officeCode
        });
        await provisionTenantStorage({ admin, tenantId: tenant.id });

        const customerId = await ensureStripeCustomer({ tenant, tenantId: tenant.id, email });
        if (tenant?.stripe_customer_id !== customerId) {
            await admin.from('tenants').update({ stripe_customer_id: customerId }).eq('id', tenant.id);
        }

        const session = await createMembershipCheckout({
            request,
            customerId,
            membershipId: membership.id,
            tenantId: tenant.id,
            ownerId: userId,
            monthlyAmountCents,
            weeklyExGstCents,
            planConfig,
            selectedWorkUnit: workspace.selectedWorkUnit,
            additionalMembersCount: additionalMemberEmails.length
        });
        const checkoutUrl = typeof session?.url === 'string' ? session.url : '';
        if (!checkoutUrl) throw new Error('Stripe did not return a checkout URL.');

        const magicLinkRecipients = Array.from(new Set([email, ...additionalMemberEmails]));
        for (const recipient of magicLinkRecipients) {
            await sendMagicLink({ email: recipient, request });
        }

        return NextResponse.json({
            ok: true,
            checkout_url: checkoutUrl,
            plan: planConfig.planId,
            weekly_ex_gst_cents: weeklyExGstCents,
            monthly_amount_cents: monthlyAmountCents,
            work_unit_id: workspace.selectedWorkUnit?.id || null,
            additional_members_count: additionalMemberEmails.length
        });
    } catch (err) {
        const status = Number.isFinite(err?.status) ? err.status : 500;
        return NextResponse.json(
            {
                error: err?.message || 'Failed to set up membership.',
                code: err?.code || null,
                stripe_request_id: err?.requestId || null
            },
            { status: status >= 400 && status < 600 ? status : 500 }
        );
    }
}
