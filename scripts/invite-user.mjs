import { createClient } from '@supabase/supabase-js';

function trimTrailingSlash(value) {
    return String(value || '').replace(/\/+$/, '');
}

function requireEnv(name, value) {
    if (!value) {
        throw new Error(`Missing ${name}. Add it to your environment before running this script.`);
    }
    return value;
}

async function main() {
    const email = process.argv[2];
    if (!email) {
        console.error('Usage: node scripts/invite-user.mjs <email>');
        process.exit(1);
    }

    const supabaseUrl =
        process.env.SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const siteUrl = trimTrailingSlash(
        process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    );
    const nextPath = process.env.INVITE_NEXT || '/platform';

    requireEnv('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)', supabaseUrl);
    requireEnv('SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });

    const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`;

    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { must_set_password: true }
    });
    if (inviteError) throw inviteError;

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
            redirectTo,
            data: { must_set_password: true }
        }
    });
    if (linkError) throw linkError;

    const hashedToken = linkData?.properties?.hashed_token;
    const directLink = hashedToken
        ? `${siteUrl}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=invite&next=${encodeURIComponent(nextPath)}`
        : null;

    console.log(`Invited: ${email}`);
    console.log(`User ID: ${inviteData?.user?.id || '—'}`);
    console.log(`Supabase redirectTo: ${redirectTo}`);
    if (directLink) {
        console.log(`Direct invite link (fallback): ${directLink}`);
    }
}

main().catch(err => {
    console.error(err?.message || err);
    process.exit(1);
});
