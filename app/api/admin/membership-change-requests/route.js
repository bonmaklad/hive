import { NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/adminGuard';

export const runtime = 'nodejs';

export async function GET(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'pending';

    const { data, error } = await guard.admin
        .from('membership_change_requests')
        .select('*')
        .eq('status', status)
        .order('created_at', { ascending: false })
        .limit(200);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const ownerIds = Array.from(new Set((data || []).map(r => r.owner_id).filter(Boolean)));
    const { data: owners } = await guard.admin.from('profiles').select('id, name, email').in('id', ownerIds);
    const ownersById = Object.fromEntries((owners || []).map(p => [p.id, p]));

    return NextResponse.json({
        requests: (data || []).map(r => ({
            ...r,
            owner: ownersById[r.owner_id] || null
        }))
    });
}

