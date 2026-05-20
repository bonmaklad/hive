import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../_lib/supabaseAuth';

export const runtime = 'nodejs';

const VALID_SUPPORT_TYPES = new Set(['hired_member', 'helped_member']);

function parseMoneyCents(value, { allowZero = false } = {}) {
    const raw = typeof value === 'string' ? value : String(value ?? '');
    const cleaned = raw.replace(/[$,\s]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
    const [whole, decimal = ''] = cleaned.split('.');
    const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
    if (!Number.isSafeInteger(cents)) return null;
    if (allowZero ? cents < 0 : cents <= 0) return null;
    return cents;
}

function parseDate(value) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const date = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return null;
    return raw;
}

function safeId(value) {
    const raw = typeof value === 'string' ? value.trim() : '';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : '';
}

function normalizeSupportEvent(row) {
    return {
        id: row.id,
        support_type: row.support_type,
        amount_cents: Number(row.amount_cents || 0),
        occurred_on: row.occurred_on,
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

async function resolveImpactContext(request) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return { ok: false, status: 401, error };

    const admin = createSupabaseAdminClient();
    const [{ data: profile, error: profileError }, { data: tenantLinks, error: linksError }] = await Promise.all([
        admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle(),
        admin.from('tenant_users').select('tenant_id, role').eq('user_id', user.id)
    ]);

    if (profileError) return { ok: false, status: 500, error: profileError.message };
    if (linksError) return { ok: false, status: 500, error: linksError.message };
    if (!tenantLinks?.length) return { ok: false, status: 403, error: 'No tenant membership found.' };

    const tenantLink =
        tenantLinks.find(link => link.role === 'owner') ||
        tenantLinks.find(link => link.role === 'admin') ||
        tenantLinks[0];
    const tenantId = tenantLink?.tenant_id || null;
    if (!tenantId) return { ok: false, status: 500, error: 'Tenant membership is misconfigured.' };

    const isPlatformAdmin = Boolean(profile?.is_admin);
    const tenantRole = tenantLink?.role || null;
    const canManageExternalRevenue = Boolean(isPlatformAdmin || tenantRole === 'owner' || tenantRole === 'admin');
    const canManageSupportEvents = Boolean(isPlatformAdmin || tenantRole === 'owner');

    return {
        ok: true,
        status: 200,
        admin,
        user,
        tenantId,
        tenantRole,
        canManageExternalRevenue,
        canManageSupportEvents
    };
}

export async function GET(request) {
    const ctx = await resolveImpactContext(request);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (!ctx.canManageExternalRevenue && !ctx.canManageSupportEvents) {
        return NextResponse.json({ error: 'Only tenant admins can manage impact statistics.' }, { status: 403 });
    }

    const statsPromise = ctx.canManageExternalRevenue
        ? ctx.admin
            .from('platform_impact_tenant_stats')
            .select('tenant_id, external_revenue_cents, updated_at')
            .eq('tenant_id', ctx.tenantId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null });

    const eventsPromise = ctx.canManageSupportEvents
        ? ctx.admin
            .from('platform_impact_events')
            .select('id, support_type, amount_cents, occurred_on, created_at, updated_at')
            .eq('tenant_id', ctx.tenantId)
            .eq('category', 'member_support')
            .order('occurred_on', { ascending: false })
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null });

    const [statsResult, eventsResult] = await Promise.all([statsPromise, eventsPromise]);
    if (statsResult.error) return NextResponse.json({ error: statsResult.error.message }, { status: 500 });
    if (eventsResult.error) return NextResponse.json({ error: eventsResult.error.message }, { status: 500 });

    return NextResponse.json({
        ok: true,
        tenant_id: ctx.tenantId,
        tenant_role: ctx.tenantRole,
        can_manage_external_revenue: ctx.canManageExternalRevenue,
        can_manage_support_events: ctx.canManageSupportEvents,
        external_revenue: {
            amount_cents: Number(statsResult.data?.external_revenue_cents || 0),
            updated_at: statsResult.data?.updated_at || null
        },
        support_events: Array.isArray(eventsResult.data) ? eventsResult.data.map(normalizeSupportEvent) : []
    });
}

export async function POST(request) {
    const ctx = await resolveImpactContext(request);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (!ctx.canManageSupportEvents) {
        return NextResponse.json({ error: 'Only the tenant owner can add member support events.' }, { status: 403 });
    }

    const payload = await request.json().catch(() => ({}));
    const amountCents = parseMoneyCents(payload?.amount);
    if (!amountCents) return NextResponse.json({ error: 'Enter an amount greater than zero, with up to 2 decimals.' }, { status: 400 });

    const occurredOn = parseDate(payload?.occurred_on);
    if (!occurredOn) return NextResponse.json({ error: 'Enter a valid date.' }, { status: 400 });

    const supportType = String(payload?.support_type || '').trim();
    if (!VALID_SUPPORT_TYPES.has(supportType)) {
        return NextResponse.json({ error: 'support_type must be hired_member or helped_member.' }, { status: 400 });
    }

    const { data, error: insertError } = await ctx.admin
        .from('platform_impact_events')
        .insert({
            category: 'member_support',
            support_type: supportType,
            amount_cents: amountCents,
            occurred_on: occurredOn,
            reporter_id: ctx.user.id,
            tenant_id: ctx.tenantId,
            source: 'platform_dashboard'
        })
        .select('id, support_type, amount_cents, occurred_on, created_at, updated_at')
        .single();

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    return NextResponse.json({ ok: true, event: normalizeSupportEvent(data) });
}

export async function PATCH(request) {
    const ctx = await resolveImpactContext(request);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const payload = await request.json().catch(() => ({}));
    const section = typeof payload?.section === 'string' ? payload.section.trim() : '';

    if (section === 'external_revenue') {
        if (!ctx.canManageExternalRevenue) {
            return NextResponse.json({ error: 'Only tenant admins can edit the external revenue figure.' }, { status: 403 });
        }

        const amountCents = parseMoneyCents(payload?.amount, { allowZero: true });
        if (amountCents === null) return NextResponse.json({ error: 'Enter a valid amount with up to 2 decimals.' }, { status: 400 });

        const { data, error: upsertError } = await ctx.admin
            .from('platform_impact_tenant_stats')
            .upsert(
                {
                    tenant_id: ctx.tenantId,
                    external_revenue_cents: amountCents,
                    updated_by: ctx.user.id
                },
                { onConflict: 'tenant_id' }
            )
            .select('tenant_id, external_revenue_cents, updated_at')
            .single();

        if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
        return NextResponse.json({
            ok: true,
            external_revenue: {
                amount_cents: Number(data?.external_revenue_cents || 0),
                updated_at: data?.updated_at || null
            }
        });
    }

    if (section === 'member_support') {
        if (!ctx.canManageSupportEvents) {
            return NextResponse.json({ error: 'Only the tenant owner can edit member support events.' }, { status: 403 });
        }

        const eventId = safeId(payload?.id);
        if (!eventId) return NextResponse.json({ error: 'A valid event id is required.' }, { status: 400 });

        const amountCents = parseMoneyCents(payload?.amount);
        if (!amountCents) return NextResponse.json({ error: 'Enter an amount greater than zero, with up to 2 decimals.' }, { status: 400 });

        const occurredOn = parseDate(payload?.occurred_on);
        if (!occurredOn) return NextResponse.json({ error: 'Enter a valid date.' }, { status: 400 });

        const supportType = String(payload?.support_type || '').trim();
        if (!VALID_SUPPORT_TYPES.has(supportType)) {
            return NextResponse.json({ error: 'support_type must be hired_member or helped_member.' }, { status: 400 });
        }

        const { data, error: updateError } = await ctx.admin
            .from('platform_impact_events')
            .update({
                support_type: supportType,
                amount_cents: amountCents,
                occurred_on: occurredOn,
                reporter_id: ctx.user.id
            })
            .eq('id', eventId)
            .eq('tenant_id', ctx.tenantId)
            .eq('category', 'member_support')
            .select('id, support_type, amount_cents, occurred_on, created_at, updated_at')
            .maybeSingle();

        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
        if (!data?.id) return NextResponse.json({ error: 'Support event not found.' }, { status: 404 });
        return NextResponse.json({ ok: true, event: normalizeSupportEvent(data) });
    }

    return NextResponse.json({ error: 'section must be external_revenue or member_support.' }, { status: 400 });
}

export async function DELETE(request) {
    const ctx = await resolveImpactContext(request);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (!ctx.canManageSupportEvents) {
        return NextResponse.json({ error: 'Only the tenant owner can delete member support events.' }, { status: 403 });
    }

    const url = new URL(request.url);
    const eventId = safeId(url.searchParams.get('id'));
    if (!eventId) return NextResponse.json({ error: 'A valid event id is required.' }, { status: 400 });

    const { data, error: deleteError } = await ctx.admin
        .from('platform_impact_events')
        .delete()
        .eq('id', eventId)
        .eq('tenant_id', ctx.tenantId)
        .eq('category', 'member_support')
        .select('id')
        .maybeSingle();

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
    if (!data?.id) return NextResponse.json({ error: 'Support event not found.' }, { status: 404 });
    return NextResponse.json({ ok: true, id: data.id });
}
