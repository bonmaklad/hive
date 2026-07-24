import crypto from 'crypto';
import { createSupabaseAnonClient } from '../../_lib/supabaseAuth';
import { stripeRequest } from '../../_lib/stripe';
import {
    HIVE_MEMBER_WEEKLY_EX_GST_CENTS,
    computeMonthlyFromWeeklyExGstCents
} from '@/lib/membershipPricing';

const DEFAULT_TOKENS_TOTAL = 10;
const MAX_ADDITIONAL_MEMBERS = 25;
const ADDITIONAL_MEMBER_WEEKLY_EX_GST_CENTS = HIVE_MEMBER_WEEKLY_EX_GST_CENTS;
const PUBLIC_SIGNUP_CHANNEL = 'public_membership_signup';
const PUBLIC_SIGNUP_VERSION = '2';

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

function toPositiveInt(value, fallback = 1) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.floor(n));
}

function toNonNegativeInt(value, fallback = 0) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.floor(n));
}

function toIsoDate(date) {
    return date.toISOString().slice(0, 10);
}

function getMonthStart() {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-01`;
}

function toDayOfMonth(tsSeconds) {
    if (!Number.isFinite(tsSeconds)) return null;
    const date = new Date(tsSeconds * 1000);
    if (Number.isNaN(date.getTime())) return null;
    return date.getUTCDate();
}

function resolvePlanConfig(rawPlan) {
    const plan = safeText(rawPlan, 24).toLowerCase() || 'member';
    const config = PLAN_CONFIG[plan] || null;
    if (!config) {
        throw createHttpError('Unsupported plan. Choose member, desk, or office.', 400);
    }
    return config;
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

    if (out.length > MAX_ADDITIONAL_MEMBERS) {
        throw createHttpError(`Maximum ${MAX_ADDITIONAL_MEMBERS} additional members for office signup.`, 400);
    }

    return out;
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
    if (typeof unit?.active === 'boolean') return unit.active;
    if (typeof unit?.is_active === 'boolean') return unit.is_active;
    return true;
}

function toUnitCode(building, unitNumber) {
    const b = safeText(building, 50);
    const n = Number.isFinite(unitNumber) ? String(unitNumber) : safeText(unitNumber, 30);
    if (!b || !n) return '';
    return `${b}.${n}`;
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

async function findExistingAccount(admin, email) {
    const { data: profiles, error: profileError } = await admin
        .from('profiles')
        .select('id, email')
        .ilike('email', email)
        .limit(1);
    if (profileError) throw new Error(profileError.message);

    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile?.id) return { userId: null, tenantId: null, membership: null };

    const [{ data: ownerLinks, error: ownerLinkError }, { data: memberships, error: membershipError }] = await Promise.all([
        admin
            .from('tenant_users')
            .select('tenant_id, created_at')
            .eq('user_id', profile.id)
            .eq('role', 'owner')
            .order('created_at', { ascending: true })
            .limit(1),
        admin
            .from('memberships')
            .select('id, stripe_subscription_id')
            .eq('owner_id', profile.id)
            .order('updated_at', { ascending: false })
            .limit(1)
    ]);

    if (ownerLinkError) throw new Error(ownerLinkError.message);
    if (membershipError) throw new Error(membershipError.message);

    return {
        userId: profile.id,
        tenantId: Array.isArray(ownerLinks) ? (ownerLinks[0]?.tenant_id || null) : null,
        membership: Array.isArray(memberships) ? (memberships[0] || null) : null
    };
}

async function inspectWorkspace({ admin, planConfig, workUnitId, existingTenantId = null }) {
    if (!planConfig.requiresWorkUnit) {
        return {
            baseWeeklyExGstCents: planConfig.defaultWeeklyExGstCents,
            selectedWorkUnit: null,
            officeCode: null
        };
    }

    const safeWorkUnitId = safeText(workUnitId, 80);
    if (!safeWorkUnitId) {
        throw createHttpError('Please choose an available workspace before continuing.', 400);
    }

    const { data: unit, error: unitError } = await admin
        .from('work_units')
        .select('*')
        .eq('id', safeWorkUnitId)
        .maybeSingle();
    if (unitError) throw new Error(unitError.message);
    if (!unit) throw createHttpError('The selected workspace could not be found.', 404);

    if (!resolveUnitIsActive(unit)) {
        throw createHttpError('This workspace is no longer available.', 409);
    }

    const unitType = safeText(unit?.unit_type, 50);
    if (!planConfig.allowedUnitTypes.includes(unitType)) {
        throw createHttpError('The selected workspace does not match this plan type.', 400);
    }

    const baseWeeklyExGstCents = resolveUnitPriceCents(unit);
    if (baseWeeklyExGstCents <= 0) {
        throw createHttpError('Pricing for the selected workspace is not configured yet. Please contact HIVE admin.', 400);
    }

    const today = toIsoDate(new Date());
    const { data: allocations, error: allocationsError } = await admin
        .from('work_unit_allocations')
        .select('tenant_id')
        .eq('work_unit_id', safeWorkUnitId)
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gt.${today}`);
    if (allocationsError) throw new Error(allocationsError.message);

    const currentAllocations = Array.isArray(allocations) ? allocations : [];
    const existingTenantAlreadyAllocated = existingTenantId
        ? currentAllocations.some(row => row?.tenant_id === existingTenantId)
        : false;
    const capacity = toPositiveInt(unit?.capacity, 1);
    if (!existingTenantAlreadyAllocated && currentAllocations.length >= capacity) {
        throw createHttpError('That workspace was just taken. Please choose another available option.', 409);
    }

    if (existingTenantId) {
        const { data: tenantAllocations, error: tenantAllocationsError } = await admin
            .from('work_unit_allocations')
            .select('work_unit_id')
            .eq('tenant_id', existingTenantId)
            .lte('start_date', today)
            .or(`end_date.is.null,end_date.gt.${today}`);
        if (tenantAllocationsError) throw new Error(tenantAllocationsError.message);

        const hasDifferentActiveAllocation = (tenantAllocations || []).some(
            row => row?.work_unit_id && row.work_unit_id !== safeWorkUnitId
        );
        if (hasDifferentActiveAllocation) {
            throw createHttpError('This tenant already has an active workspace. Contact HIVE admin to switch units.', 409);
        }
    }

    return {
        baseWeeklyExGstCents,
        selectedWorkUnit: {
            id: unit.id,
            building: unit?.building ?? null,
            unit_number: unit?.unit_number ?? null,
            unit_type: unitType
        },
        officeCode: toUnitCode(unit?.building, unit?.unit_number) || safeWorkUnitId
    };
}

export async function preparePublicMembershipSignup({
    admin,
    payload,
    allowStripeSubscriptionId = null,
    pricingOverride = null
}) {
    const tenantName = safeText(payload?.tenant_name, 120);
    const email = parseEmail(payload?.email);
    const contactName = safeText(payload?.contact_name, 120);
    const phone = safeText(payload?.phone, 40);
    const workUnitId = safeText(payload?.work_unit_id, 80);
    const planConfig = resolvePlanConfig(payload?.plan);

    if (!tenantName) throw createHttpError('Business name is required.', 400);
    if (!email) throw createHttpError('A valid email address is required.', 400);

    const additionalMemberEmails = planConfig.planId === 'office'
        ? parseAdditionalMemberEmails(payload?.additional_members, email)
        : [];

    const existingAccount = await findExistingAccount(admin, email);
    const existingSubscriptionId = safeText(existingAccount?.membership?.stripe_subscription_id, 200);
    if (existingSubscriptionId && existingSubscriptionId !== allowStripeSubscriptionId) {
        throw createHttpError('Automatic payments are already active for this account. Use your magic link to sign in.', 409);
    }

    const workspace = await inspectWorkspace({
        admin,
        planConfig,
        workUnitId,
        existingTenantId: existingAccount.tenantId
    });

    const baseWeeklyExGstCents = pricingOverride
        ? toPositiveInt(pricingOverride?.baseWeeklyExGstCents, 0)
        : workspace.baseWeeklyExGstCents;
    const additionalWeeklyExGstCents = planConfig.planId === 'office'
        ? additionalMemberEmails.length * ADDITIONAL_MEMBER_WEEKLY_EX_GST_CENTS
        : 0;
    const weeklyExGstCents = pricingOverride
        ? toPositiveInt(pricingOverride?.weeklyExGstCents, 0)
        : baseWeeklyExGstCents + additionalWeeklyExGstCents;
    const monthlyAmountCents = pricingOverride
        ? toPositiveInt(pricingOverride?.monthlyAmountCents, 0)
        : computeMonthlyFromWeeklyExGstCents(weeklyExGstCents);

    if (!baseWeeklyExGstCents || !weeklyExGstCents || !monthlyAmountCents) {
        throw createHttpError('Pricing could not be calculated for the selected option.', 400);
    }
    if (pricingOverride && computeMonthlyFromWeeklyExGstCents(weeklyExGstCents) !== monthlyAmountCents) {
        throw createHttpError('The paid membership pricing metadata is invalid.', 400);
    }
    if (weeklyExGstCents !== baseWeeklyExGstCents + additionalWeeklyExGstCents) {
        throw createHttpError('The paid membership member count does not match its pricing.', 400);
    }

    return {
        tenantName,
        email,
        contactName,
        phone,
        planConfig,
        workUnitId,
        additionalMemberEmails,
        baseWeeklyExGstCents,
        weeklyExGstCents,
        monthlyAmountCents,
        selectedWorkUnit: workspace.selectedWorkUnit,
        officeCode: workspace.officeCode
    };
}

function buildSignupMetadata(signup, signupIntentId) {
    const metadata = {
        channel: PUBLIC_SIGNUP_CHANNEL,
        signup_version: PUBLIC_SIGNUP_VERSION,
        signup_intent_id: signupIntentId,
        tenant_name: signup.tenantName,
        signup_email: signup.email,
        contact_name: signup.contactName,
        phone: signup.phone,
        plan: signup.planConfig.planId,
        work_unit_id: signup.selectedWorkUnit?.id || '',
        base_weekly_ex_gst_cents: String(signup.baseWeeklyExGstCents),
        weekly_ex_gst_cents: String(signup.weeklyExGstCents),
        monthly_amount_cents: String(signup.monthlyAmountCents),
        additional_members_count: String(signup.additionalMemberEmails.length)
    };

    signup.additionalMemberEmails.forEach((email, index) => {
        metadata[`additional_member_${index + 1}`] = email;
    });

    return metadata;
}

export async function createPublicMembershipCheckout({ request, signup }) {
    const siteUrl = getSiteUrl(request);
    const successUrl = `${siteUrl}/login?next=${encodeURIComponent('/platform/membership')}&signup=success`;
    const cancelUrl = `${siteUrl}/?membershipSignup=cancelled#memberships`;
    const signupIntentId = crypto.randomUUID();
    const metadata = buildSignupMetadata(signup, signupIntentId);

    const unitLabel = signup.selectedWorkUnit
        ? toUnitCode(signup.selectedWorkUnit.building, signup.selectedWorkUnit.unit_number)
        : '';
    const additionalMembersLabel = signup.additionalMemberEmails.length > 0
        ? ` + ${signup.additionalMemberEmails.length} additional member(s)`
        : '';
    const description = unitLabel
        ? `${signup.planConfig.label} (${unitLabel})${additionalMembersLabel} • ${Math.round(signup.weeklyExGstCents / 100)} + GST per week, billed monthly`
        : `${signup.planConfig.label}${additionalMembersLabel} • ${Math.round(signup.weeklyExGstCents / 100)} + GST per week, billed monthly`;

    const params = {
        mode: 'subscription',
        customer_email: signup.email,
        client_reference_id: signupIntentId,
        success_url: successUrl,
        cancel_url: cancelUrl,
        billing_address_collection: 'required',
        'automatic_tax[enabled]': 'true',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'nzd',
        'line_items[0][price_data][unit_amount]': String(signup.monthlyAmountCents),
        'line_items[0][price_data][tax_behavior]': 'inclusive',
        'line_items[0][price_data][recurring][interval]': 'month',
        'line_items[0][price_data][product_data][name]': signup.planConfig.productName,
        'line_items[0][price_data][product_data][description]': description,
        'subscription_data[metadata][channel]': PUBLIC_SIGNUP_CHANNEL,
        'subscription_data[metadata][signup_intent_id]': signupIntentId,
        'subscription_data[metadata][plan]': signup.planConfig.planId,
        'subscription_data[metadata][work_unit_id]': signup.selectedWorkUnit?.id || ''
    };

    for (const [key, value] of Object.entries(metadata)) {
        params[`metadata[${key}]`] = value;
    }

    return stripeRequest(
        'POST',
        '/v1/checkout/sessions',
        params,
        { idempotencyKey: `public-membership-signup-v2-${signupIntentId}` }
    );
}

function payloadFromCheckoutSession(session) {
    const metadata = session?.metadata || {};
    const count = Math.min(
        MAX_ADDITIONAL_MEMBERS,
        toNonNegativeInt(metadata?.additional_members_count, 0)
    );
    const additionalMembers = [];
    for (let index = 1; index <= count; index += 1) {
        additionalMembers.push(metadata?.[`additional_member_${index}`] || '');
    }

    return {
        payload: {
            tenant_name: metadata?.tenant_name,
            email: metadata?.signup_email,
            contact_name: metadata?.contact_name,
            phone: metadata?.phone,
            plan: metadata?.plan,
            work_unit_id: metadata?.work_unit_id,
            additional_members: additionalMembers
        },
        pricingOverride: {
            baseWeeklyExGstCents: metadata?.base_weekly_ex_gst_cents,
            weeklyExGstCents: metadata?.weekly_ex_gst_cents,
            monthlyAmountCents: metadata?.monthly_amount_cents
        }
    };
}

async function ensureUser({ admin, email, displayName }) {
    const { data: profiles, error: profileError } = await admin
        .from('profiles')
        .select('id, email')
        .ilike('email', email)
        .limit(1);
    if (profileError) throw new Error(profileError.message);

    const existing = Array.isArray(profiles) ? profiles[0] : null;
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

async function resolveOrCreateOwnerTenant({ admin, userId, tenantName, stripeCustomerId }) {
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

        if (existingTenant.stripe_customer_id !== stripeCustomerId) {
            const { error: updateError } = await admin
                .from('tenants')
                .update({ stripe_customer_id: stripeCustomerId })
                .eq('id', existingTenant.id);
            if (updateError) throw new Error(updateError.message);
        }
        return { ...existingTenant, stripe_customer_id: stripeCustomerId };
    }

    const { data: tenant, error: tenantError } = await admin
        .from('tenants')
        .insert({ name: tenantName, stripe_customer_id: stripeCustomerId })
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

async function allocateWorkspace({ admin, tenantId, signup }) {
    if (!signup.planConfig.requiresWorkUnit) return;

    const today = toIsoDate(new Date());
    const unitId = signup.selectedWorkUnit?.id;
    if (!unitId) throw createHttpError('The paid signup is missing its selected workspace.', 400);

    const { data: unit, error: unitError } = await admin
        .from('work_units')
        .select('*')
        .eq('id', unitId)
        .maybeSingle();
    if (unitError) throw new Error(unitError.message);
    if (!unit || !resolveUnitIsActive(unit)) {
        throw createHttpError('The paid workspace is no longer available. HIVE admin assistance is required.', 409);
    }

    const unitType = safeText(unit?.unit_type, 50);
    if (!signup.planConfig.allowedUnitTypes.includes(unitType)) {
        throw createHttpError('The paid workspace no longer matches this membership plan.', 409);
    }

    const { data: unitAllocations, error: unitAllocError } = await admin
        .from('work_unit_allocations')
        .select('id, tenant_id')
        .eq('work_unit_id', unitId)
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gt.${today}`);
    if (unitAllocError) throw new Error(unitAllocError.message);

    const currentAllocations = Array.isArray(unitAllocations) ? unitAllocations : [];
    const tenantAlreadyOnUnit = currentAllocations.some(row => row?.tenant_id === tenantId);
    const capacity = toPositiveInt(unit?.capacity, 1);
    if (!tenantAlreadyOnUnit && currentAllocations.length >= capacity) {
        throw createHttpError('The paid workspace was taken before payment completed. HIVE admin assistance is required.', 409);
    }

    const { data: tenantAllocations, error: tenantAllocError } = await admin
        .from('work_unit_allocations')
        .select('id, work_unit_id')
        .eq('tenant_id', tenantId)
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gt.${today}`);
    if (tenantAllocError) throw new Error(tenantAllocError.message);

    const activeTenantAllocations = Array.isArray(tenantAllocations) ? tenantAllocations : [];
    const hasDifferentActiveAllocation = activeTenantAllocations.some(
        row => row?.work_unit_id && row.work_unit_id !== unitId
    );
    if (hasDifferentActiveAllocation) {
        throw createHttpError('This tenant already has an active workspace. HIVE admin assistance is required.', 409);
    }

    if (!tenantAlreadyOnUnit) {
        const { error: insertError } = await admin.from('work_unit_allocations').insert({
            work_unit_id: unitId,
            tenant_id: tenantId,
            start_date: today,
            end_date: null,
            price_cents: signup.baseWeeklyExGstCents
        });
        if (insertError) throw new Error(insertError.message);
    }
}

async function upsertMembership({
    admin,
    ownerId,
    signup,
    stripeSubscriptionId,
    nextInvoiceAt
}) {
    const { data: memberships, error: membershipsError } = await admin
        .from('memberships')
        .select('id, stripe_subscription_id')
        .eq('owner_id', ownerId)
        .order('updated_at', { ascending: false })
        .limit(1);
    if (membershipsError) throw new Error(membershipsError.message);

    const existing = Array.isArray(memberships) ? memberships[0] : null;
    if (existing?.stripe_subscription_id && existing.stripe_subscription_id !== stripeSubscriptionId) {
        throw createHttpError('Automatic payments are already active for this account.', 409);
    }

    const payload = {
        owner_id: ownerId,
        status: 'live',
        plan: signup.planConfig.planId,
        office_id: signup.planConfig.planId === 'office' ? signup.officeCode : null,
        donation_cents: 0,
        fridge_enabled: false,
        currency: 'NZD',
        monthly_amount_cents: signup.monthlyAmountCents,
        payment_terms: 'auto_card',
        stripe_subscription_id: stripeSubscriptionId,
        next_invoice_at: nextInvoiceAt || new Date().getUTCDate(),
        updated_at: new Date().toISOString()
    };

    if (existing?.id) {
        const { data: updated, error: updateError } = await admin
            .from('memberships')
            .update(payload)
            .eq('id', existing.id)
            .select('id, owner_id, currency')
            .single();
        if (updateError) throw new Error(updateError.message);
        return updated;
    }

    const { data: inserted, error: insertError } = await admin
        .from('memberships')
        .insert(payload)
        .select('id, owner_id, currency')
        .single();
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

async function ensureAdditionalMembers({ admin, tenantId, emails }) {
    for (const email of emails || []) {
        const user = await ensureUser({ admin, email, displayName: '' });
        const { error } = await admin.from('tenant_users').upsert(
            { tenant_id: tenantId, user_id: user.userId, role: 'member' },
            { onConflict: 'tenant_id,user_id' }
        );
        if (error) throw new Error(error.message);
    }
}

async function upsertTenantInfo({ admin, tenantId, signup }) {
    const { error } = await admin.from('tenant_info').upsert(
        {
            tenant_id: tenantId,
            email: signup.email || null,
            phone: signup.phone || null,
            key_contact_name: signup.contactName || null,
            profile_name: signup.tenantName || null,
            office_location: signup.officeCode || null
        },
        { onConflict: 'tenant_id' }
    );
    if (error && error.code !== '42P01') throw new Error(error.message);
}

async function provisionTenantStorage({ admin, tenantId }) {
    const bucket = 'tenant-docs';
    try {
        await admin.storage.createBucket(bucket, { public: false });
    } catch {
        // Bucket already exists or storage provisioning is managed elsewhere.
    }

    try {
        await admin.storage.from(bucket).upload(`${tenantId}/.keep`, Buffer.from(''), {
            contentType: 'text/plain',
            upsert: false
        });
    } catch {
        // Existing placeholders are safe to reuse.
    }
}

async function recordPaidInvoice({ admin, session, membership, signup }) {
    const invoiceId = typeof session?.invoice === 'string' ? session.invoice : session?.invoice?.id;
    const invoiceNumber = invoiceId ? `stripe:${invoiceId}` : `stripe_session:${session.id}`;
    const amountCents = session?.amount_total === null || session?.amount_total === undefined
        ? signup.monthlyAmountCents
        : toNonNegativeInt(session.amount_total, signup.monthlyAmountCents);
    const currency = safeText(session?.currency, 10).toUpperCase() || membership?.currency || 'NZD';
    const issuedOn = toIsoDate(
        Number.isFinite(session?.created) ? new Date(session.created * 1000) : new Date()
    );

    const { error } = await admin.from('invoices').upsert(
        {
            owner_id: membership.owner_id,
            membership_id: membership.id,
            invoice_number: invoiceNumber,
            amount_cents: amountCents,
            currency,
            status: 'paid',
            issued_on: issuedOn,
            due_on: issuedOn,
            paid_at: new Date().toISOString()
        },
        { onConflict: 'invoice_number' }
    );
    if (error) throw new Error(error.message);
}

async function sendMagicLink({ email, siteUrl }) {
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

export async function provisionPaidPublicMembershipSignup({ admin, session, request }) {
    const metadata = session?.metadata || {};
    if (metadata?.channel !== PUBLIC_SIGNUP_CHANNEL) return { handled: false };
    if (metadata?.signup_version !== PUBLIC_SIGNUP_VERSION) {
        return { handled: false, legacy: true };
    }

    if (session?.payment_status !== 'paid') {
        return { handled: true, provisioned: false, awaitingPayment: true };
    }

    const stripeSubscriptionId = typeof session?.subscription === 'string'
        ? session.subscription
        : session?.subscription?.id;
    const stripeCustomerId = typeof session?.customer === 'string'
        ? session.customer
        : session?.customer?.id;
    if (!stripeSubscriptionId) throw new Error('Paid membership checkout is missing its Stripe subscription id.');
    if (!stripeCustomerId) throw new Error('Paid membership checkout is missing its Stripe customer id.');

    const { payload, pricingOverride } = payloadFromCheckoutSession(session);
    const signup = await preparePublicMembershipSignup({
        admin,
        payload,
        allowStripeSubscriptionId: stripeSubscriptionId,
        pricingOverride
    });

    const subscription = await stripeRequest(
        'GET',
        `/v1/subscriptions/${encodeURIComponent(stripeSubscriptionId)}`
    );
    const nextInvoiceAt = toDayOfMonth(
        typeof subscription?.current_period_end === 'number'
            ? subscription.current_period_end
            : NaN
    );

    const { userId } = await ensureUser({
        admin,
        email: signup.email,
        displayName: signup.contactName || signup.tenantName
    });
    const tenant = await resolveOrCreateOwnerTenant({
        admin,
        userId,
        tenantName: signup.tenantName,
        stripeCustomerId
    });

    await allocateWorkspace({ admin, tenantId: tenant.id, signup });
    const membership = await upsertMembership({
        admin,
        ownerId: userId,
        signup,
        stripeSubscriptionId,
        nextInvoiceAt
    });
    await ensureTokenGrant({ admin, ownerId: userId });
    if (signup.planConfig.planId === 'office') {
        await ensureAdditionalMembers({
            admin,
            tenantId: tenant.id,
            emails: signup.additionalMemberEmails
        });
    }
    await upsertTenantInfo({ admin, tenantId: tenant.id, signup });
    await provisionTenantStorage({ admin, tenantId: tenant.id });
    await recordPaidInvoice({ admin, session, membership, signup });

    await stripeRequest(
        'POST',
        `/v1/customers/${encodeURIComponent(stripeCustomerId)}`,
        {
            name: signup.tenantName,
            email: signup.email,
            'metadata[tenant_id]': tenant.id,
            'metadata[owner_id]': userId
        },
        { idempotencyKey: `public-signup-customer-${session.id}` }
    );
    await stripeRequest(
        'POST',
        `/v1/subscriptions/${encodeURIComponent(stripeSubscriptionId)}`,
        {
            'metadata[channel]': PUBLIC_SIGNUP_CHANNEL,
            'metadata[signup_intent_id]': safeText(metadata?.signup_intent_id, 200),
            'metadata[membership_id]': membership.id,
            'metadata[tenant_id]': tenant.id,
            'metadata[owner_id]': userId,
            'metadata[plan]': signup.planConfig.planId,
            'metadata[work_unit_id]': signup.selectedWorkUnit?.id || ''
        },
        { idempotencyKey: `public-signup-subscription-${session.id}` }
    );

    const siteUrl = getSiteUrl(request);
    const recipients = Array.from(new Set([signup.email, ...signup.additionalMemberEmails]));
    for (const recipient of recipients) {
        try {
            await sendMagicLink({ email: recipient, siteUrl });
        } catch (error) {
            console.error('Paid membership provisioned but magic link failed', {
                checkoutSessionId: session.id,
                message: error?.message || 'Unknown magic-link error'
            });
        }
    }

    return {
        handled: true,
        provisioned: true,
        tenantId: tenant.id,
        membershipId: membership.id
    };
}
