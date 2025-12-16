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

    const sendMagicLink = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setInfo('');

        try {
            const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
            const { error: signInError } = await supabase.auth.signInWithOtp({
                email,
                options: { emailRedirectTo: redirectTo }
            });
            if (signInError) throw signInError;

            setInfo('Magic link sent. Check your email to finish signing in.');
        } catch (err) {
            setError(err?.message || 'Sign in failed.');
        } finally {
            setBusy(false);
        }
    };

    const signInWithPassword = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setInfo('');

        try {
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            if (signInError) throw signInError;
            router.push(next);
            router.refresh();
        } catch (err) {
            setError(err?.message || 'Sign in failed.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form className="contact-form" onSubmit={sendMagicLink}>
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
                Password (optional)
                <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={busy}
                />
            </label>

            {error && <p className="platform-message error">{error}</p>}
            {info && <p className="platform-message info">{info}</p>}

            <div className="platform-actions">
                <button className="btn primary" type="submit" disabled={busy}>
                    {busy ? 'Working…' : 'Send magic link'}
                </button>
                <button className="btn secondary" type="button" onClick={signInWithPassword} disabled={busy || !password}>
                    {busy ? 'Working…' : 'Sign in with password'}
                </button>
            </div>
        </form>
    );
}

