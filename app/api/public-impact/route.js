import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../_lib/supabaseAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cents(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function sumImpactRows(rows, category) {
    if (!Array.isArray(rows)) return 0;
    return rows.reduce((total, row) => {
        if (row?.category !== category) return total;
        return total + cents(row?.amount_cents);
    }, 0);
}

async function countAuthUsers(admin) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;

    const total = Number(data?.total || 0);
    const visibleUsers = Array.isArray(data?.users) ? data.users.length : 0;
    return Math.max(total, visibleUsers);
}

export async function GET() {
    try {
        const admin = createSupabaseAdminClient();

        const [authUserCount, impactResult] = await Promise.all([
            countAuthUsers(admin),
            admin.from('platform_impact_public_totals').select('category, support_type, event_count, amount_cents')
        ]);

        const impactRows = impactResult.error ? [] : impactResult.data || [];
        const externalRevenueCents = sumImpactRows(impactRows, 'external_revenue');
        const memberRevenueCents = sumImpactRows(impactRows, 'member_support');

        return NextResponse.json({
            ok: true,
            stats: {
                people_count: authUserCount,
                external_revenue_cents: externalRevenueCents,
                member_revenue_cents: memberRevenueCents
            },
            warnings: impactResult.error ? ['impact_totals_unavailable'] : []
        });
    } catch (error) {
        console.error('Public impact stats failed', error);
        return NextResponse.json({ ok: false, error: 'Could not load public impact statistics.' }, { status: 500 });
    }
}
