import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../_lib/adminGuard';

export const runtime = 'nodejs';

function getSiteUrl() {
    return (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(
        /\/$/,
        ''
    );
}

export async function POST(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const tenantId = params?.id;
    if (!tenantId) return NextResponse.json({ error: 'Missing tenant id' }, { status: 400 });

    const payload = await request.json().catch(() => ({}));
    const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const role = typeof payload?.role === 'string' ? payload.role : 'member';

    if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    if (!['owner', 'member', 'admin'].includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });

    const { data: existingProfile, error: profileError } = await guard.admin
        .from('profiles')
        .select('id, email, name')
        .eq('email', email)
        .maybeSingle();

    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

    let userId = existingProfile?.id || null;
    let invited = false;

    if (!userId) {
        const redirectTo = `${getSiteUrl()}/auth/callback?next=${encodeURIComponent('/platform/settings')}`;
        const { data: invitedUser, error: inviteError } = await guard.admin.auth.admin.inviteUserByEmail(email, {
            redirectTo,
            data: { must_set_password: true }
        });
        if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 500 });
        userId = invitedUser?.user?.id || null;
        invited = true;
    }

    if (!userId) return NextResponse.json({ error: 'Could not resolve user id' }, { status: 500 });

    const { error: upsertError } = await guard.admin.from('tenant_users').upsert(
        {
            tenant_id: tenantId,
            user_id: userId,
            role
        },
        { onConflict: 'tenant_id,user_id' }
    );

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

    return NextResponse.json({ ok: true, user_id: userId, invited });
}
