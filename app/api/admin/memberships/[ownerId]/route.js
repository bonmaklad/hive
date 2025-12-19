import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/adminGuard';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const ownerId = params?.ownerId;
    if (!ownerId) return NextResponse.json({ error: 'Missing owner id' }, { status: 400 });

    const { data, error } = await guard.admin.from('memberships').select('*').eq('owner_id', ownerId).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ membership: data || null });
}

