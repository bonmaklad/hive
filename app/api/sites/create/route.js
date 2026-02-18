import { NextResponse } from 'next/server';
import { requireTenantContext } from '../../rooms/_lib/tenantBilling';
import { fetchCreditsSummary } from '../../rooms/_lib/credits';
import { sendContactStyleWebhook } from '../../_lib/contactWebhook';

export const runtime = 'nodejs';

const SITE_HOSTING_TOKENS_PER_YEAR = 12;

function safeText(value, limit = 120) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function normalizeRepo(value) {
    const repo = String(value || '')
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/^github\.com\//i, '');

    const withoutGitSuffix = repo.replace(/\.git$/i, '').replace(/\/$/, '');
    if (!/^[^/\s]+\/[^/\s]+$/.test(withoutGitSuffix)) return '';
    return withoutGitSuffix;
}

function normalizeDomain(value) {
    const domain = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//i, '')
        .replace(/\/$/, '');

    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)) {
        return '';
    }
    return domain;
}

function toInt(value, fallback = 0) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
}

export async function POST(request) {
    const ctx = await requireTenantContext(request);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const payload = await request.json().catch(() => ({}));

    const name = safeText(payload?.name, 120);
    const repo = normalizeRepo(payload?.repo);
    const domain = normalizeDomain(payload?.domain);
    const framework = safeText(payload?.framework, 30).toLowerCase();
    const allowedFrameworks = new Set(['next', 'gatsby', 'static', 'node', 'vue']);
    const installationIdRaw = payload?.github_installation_id;
    const parsedInstallationId = Number(installationIdRaw);
    const installationId = Number.isFinite(parsedInstallationId) && parsedInstallationId > 0 ? Math.floor(parsedInstallationId) : null;

    if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
    if (!repo) return NextResponse.json({ error: 'Repo must be in the form owner/repo.' }, { status: 400 });
    if (!domain) return NextResponse.json({ error: 'Domain must be a hostname like example.com.' }, { status: 400 });
    if (!allowedFrameworks.has(framework)) {
        return NextResponse.json({ error: 'Framework must be next, gatsby, static, node, or vue.' }, { status: 400 });
    }

    const credits = await fetchCreditsSummary({ admin: ctx.admin, ownerId: ctx.tokenOwnerId });
    if (!credits.ok) return NextResponse.json({ error: credits.error }, { status: 500 });

    if (credits.tokensLeft < SITE_HOSTING_TOKENS_PER_YEAR) {
        return NextResponse.json(
            {
                error: `Not enough tokens. Creating a site costs ${SITE_HOSTING_TOKENS_PER_YEAR} tokens per year.`,
                required_tokens: SITE_HOSTING_TOKENS_PER_YEAR,
                tokens_left: credits.tokensLeft
            },
            { status: 400 }
        );
    }

    const latestPeriodStart = credits.latestRow?.period_start || null;
    if (!latestPeriodStart) {
        return NextResponse.json({ error: 'No token credits configured for this account.' }, { status: 400 });
    }

    const currentUsed = Math.max(0, toInt(credits.latestRow?.tokens_used, 0));
    const nextUsed = currentUsed + SITE_HOSTING_TOKENS_PER_YEAR;
    const { data: debitedRow, error: debitError } = await ctx.admin
        .from('room_credits')
        .update({ tokens_used: nextUsed })
        .eq('owner_id', ctx.tokenOwnerId)
        .eq('period_start', latestPeriodStart)
        .select('owner_id')
        .maybeSingle();

    if (debitError) return NextResponse.json({ error: debitError.message }, { status: 500 });
    if (!debitedRow?.owner_id) {
        return NextResponse.json({ error: 'Could not reserve tokens for hosting. Please try again.' }, { status: 409 });
    }

    const { data: site, error: siteError } = await ctx.admin
        .from('sites')
        .insert({
            name,
            owner_id: ctx.user.id,
            tenant_id: ctx.tenantId,
            repo,
            framework,
            domain,
            github_installation_id: installationId
        })
        .select('id, domain, repo, framework')
        .single();

    if (siteError) {
        await ctx.admin
            .from('room_credits')
            .update({ tokens_used: currentUsed })
            .eq('owner_id', ctx.tokenOwnerId)
            .eq('period_start', latestPeriodStart);

        if (siteError.code === '23505') {
            return NextResponse.json({ error: 'That domain is already in use.' }, { status: 409 });
        }
        return NextResponse.json({ error: siteError.message }, { status: 500 });
    }

    let memberName = safeText(ctx.user?.user_metadata?.name || '', 120) || 'HIVE member';
    let memberEmail = safeText(ctx.user?.email || '', 254) || 'info@hivehq.nz';
    try {
        const { data: profile } = await ctx.admin.from('profiles').select('name, email').eq('id', ctx.user.id).maybeSingle();
        memberName = safeText(profile?.name || memberName, 120) || 'HIVE member';
        memberEmail = safeText(profile?.email || memberEmail, 254) || 'info@hivehq.nz';
    } catch {
        // best-effort only
    }

    const webhookMessage = [
        'Source: Platform website purchase',
        `Site ID: ${site?.id || 'n/a'}`,
        `Domain: ${site?.domain || domain}`,
        `Repo: ${site?.repo || repo}`,
        `Framework: ${site?.framework || framework}`,
        `Member ID: ${ctx.user.id}`,
        `Member email: ${memberEmail}`,
        `Tenant ID: ${ctx.tenantId}`,
        `Token owner ID: ${ctx.tokenOwnerId}`,
        `Tokens charged: ${SITE_HOSTING_TOKENS_PER_YEAR}`,
        `Token period start: ${latestPeriodStart}`,
        `Purchased at: ${new Date().toISOString()}`
    ].join('\n');

    void sendContactStyleWebhook({
        name: memberName,
        email: memberEmail,
        subject: 'Platform purchase: Website hosting',
        from: 'HIVE Platform',
        message: webhookMessage
    });

    return NextResponse.json({
        ok: true,
        site,
        tokens_charged: SITE_HOSTING_TOKENS_PER_YEAR,
        tokens_left: Math.max(0, credits.tokensLeft - SITE_HOSTING_TOKENS_PER_YEAR)
    });
}
