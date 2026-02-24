import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../../_lib/adminGuard';

export const runtime = 'nodejs';

function parseMetadata(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value;
}

export async function POST(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const tenantId = params?.id;
    if (!tenantId) return NextResponse.json({ error: 'Missing tenant id' }, { status: 400 });

    const payload = await request.json().catch(() => ({}));
    const userId = typeof payload?.user_id === 'string' ? payload.user_id : '';
    const password = typeof payload?.password === 'string' ? payload.password : '';

    if (!userId) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });

    const { data: tenantUser, error: tenantUserError } = await guard.admin
        .from('tenant_users')
        .select('tenant_id, user_id')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .maybeSingle();

    if (tenantUserError) return NextResponse.json({ error: tenantUserError.message }, { status: 500 });
    if (!tenantUser) return NextResponse.json({ error: 'User is not in this tenant.' }, { status: 400 });

    const { data: authUserData, error: authUserError } = await guard.admin.auth.admin.getUserById(userId);
    if (authUserError) return NextResponse.json({ error: authUserError.message }, { status: 500 });
    if (!authUserData?.user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    const mergedMetadata = {
        ...parseMetadata(authUserData.user.user_metadata),
        must_set_password: false
    };

    const { error: updateError } = await guard.admin.auth.admin.updateUserById(userId, {
        password,
        user_metadata: mergedMetadata
    });

    if (updateError) return NextResponse.json({ error: updateError.message || 'Failed to update password.' }, { status: 500 });

    return NextResponse.json({ ok: true, user_id: userId });
}
