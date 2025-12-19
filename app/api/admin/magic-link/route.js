import { NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/adminGuard';
import { createSupabaseAnonClient } from '../../_lib/supabaseAuth';

export const runtime = 'nodejs';

function getSiteUrl() {
    return (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(
        /\/$/,
        ''
    );
}

function parseEmail(value) {
    const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!email) return '';
    if (email.length > 254) return '';
    if (!email.includes('@')) return '';
    return email;
}

export async function POST(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const payload = await request.json().catch(() => ({}));
    const userId = typeof payload?.user_id === 'string' ? payload.user_id : null;
    const emailFromPayload = parseEmail(payload?.email);
    const nextPath = typeof payload?.next === 'string' ? payload.next : '/platform/settings';

    let email = emailFromPayload;

    if (!email && userId) {
        const { data: profile, error: profileError } = await guard.admin
            .from('profiles')
            .select('email')
            .eq('id', userId)
            .maybeSingle();

        if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
        email = parseEmail(profile?.email);
    }

    if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    if (!nextPath.startsWith('/')) return NextResponse.json({ error: 'next must be a relative path' }, { status: 400 });

    const redirectTo = `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const supabase = createSupabaseAnonClient();

    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: false }
    });

    if (error) {
        const message = error.message || 'Failed to send magic link.';
        if (message.toLowerCase().includes('signup')) {
            return NextResponse.json({ error: 'User does not exist yet. Invite them first.' }, { status: 400 });
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, email, redirect_to: redirectTo });
}

