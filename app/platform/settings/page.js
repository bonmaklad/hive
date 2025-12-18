'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import UpdatePasswordForm from './update-password-form';
import ProfileForm from './profile-form';

export const dynamic = 'force-dynamic';

function formatTimestamp(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
}

export default function PlatformSettingsPage() {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [user, setUser] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            const { data, error } = await supabase.auth.getUser();
            if (cancelled) return;

            if (error) {
                setError(error.message);
                setUser(null);
                return;
            }

            setError('');
            setUser(data?.user ?? null);
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [supabase]);

    const refreshUser = async () => {
        const { data } = await supabase.auth.getUser();
        setUser(data?.user ?? null);
    };

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
                {error && <p className="platform-message error">{error}</p>}
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
                <h2>Profile</h2>
                <p className="platform-subtitle">Set your name for chat and tickets.</p>
                <ProfileForm user={user} onUpdated={refreshUser} />
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
