import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import UpdatePasswordForm from './update-password-form';

export const dynamic = 'force-dynamic';

function formatTimestamp(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
}

export default async function PlatformSettingsPage() {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();

    if (error) {
        throw new Error(error.message);
    }

    const user = data?.user;

    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Settings</h1>
                    <p className="platform-subtitle">Manage your platform account.</p>
                </div>
                <Link className="btn ghost" href="/platform">
                    Back to dashboard
                </Link>
            </div>

            <div className="platform-card">
                <h2>Account</h2>
                <p className="platform-subtitle">Your Supabase user profile.</p>
                <div className="platform-table-wrap" style={{ marginTop: '1rem' }}>
                    <table className="platform-table">
                        <tbody>
                            <tr>
                                <th scope="row">Email</th>
                                <td className="platform-mono">{user?.email || '—'}</td>
                            </tr>
                            <tr>
                                <th scope="row">User ID</th>
                                <td className="platform-mono">{user?.id || '—'}</td>
                            </tr>
                            <tr>
                                <th scope="row">Last sign-in</th>
                                <td className="platform-mono">{formatTimestamp(user?.last_sign_in_at)}</td>
                            </tr>
                            <tr>
                                <th scope="row">Created</th>
                                <td className="platform-mono">{formatTimestamp(user?.created_at)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="platform-card" style={{ marginTop: '1.5rem' }}>
                <h2>Password</h2>
                <p className="platform-subtitle">Set a password so you can sign in without a magic link.</p>
                <UpdatePasswordForm />
                <p className="platform-message info" style={{ marginTop: '1rem' }}>
                    Magic link sign-in still works after you set a password.
                </p>
            </div>
        </main>
    );
}

