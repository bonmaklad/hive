'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    const next = searchParams.get('next') || '/platform';

    const signInWithPassword = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setInfo('');

        try {
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            if (signInError) throw signInError;
            router.replace(next);
            router.refresh();
        } catch (err) {
            setError(err?.message || 'Sign in failed.');
        } finally {
            setBusy(false);
        }
    };

    const sendPasswordReset = async () => {
        setBusy(true);
        setError('');
        setInfo('');

        try {
            if (!email) {
                throw new Error('Enter your email first.');
            }

            const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
                '/platform/settings'
            )}`;
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
            if (resetError) throw resetError;

            setInfo('Password reset email sent. Open the link to set a new password.');
        } catch (err) {
            setError(err?.message || 'Could not send reset email.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form className="contact-form" onSubmit={signInWithPassword}>
            <label>
                Email
                <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    disabled={busy}
                />
            </label>
            <label>
                Password
                <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={busy}
                />
            </label>

            {error && <p className="platform-message error">{error}</p>}
            {info && <p className="platform-message info">{info}</p>}

            <div className="platform-actions">
                <button className="btn primary" type="submit" disabled={busy}>
                    {busy ? 'Working…' : 'Sign in'}
                </button>
                <button className="btn secondary" type="button" onClick={sendPasswordReset} disabled={busy || !email}>
                    {busy ? 'Working…' : 'Forgot password'}
                </button>
            </div>
        </form>
    );
}
