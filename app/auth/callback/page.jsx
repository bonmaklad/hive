'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

function getSafeNext(next) {
    if (typeof next !== 'string') return '/platform';
    if (!next.startsWith('/')) return '/platform';
    return next;
}

function readHashParams() {
    if (typeof window === 'undefined') return new URLSearchParams();
    const hash = window.location.hash || '';
    return new URLSearchParams(hash.replace(/^#/, ''));
}

export default function AuthCallbackPage() {
    const router = useRouter();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);

    const [status, setStatus] = useState('Finishing sign-in…');
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            setError('');
            setStatus('Finishing sign-in…');

            try {
                const url = new URL(window.location.href);
                const next = getSafeNext(url.searchParams.get('next') || '/platform');
                const code = url.searchParams.get('code');
                const tokenHash = url.searchParams.get('token_hash');
                const type = url.searchParams.get('type');
                const errorDescription = url.searchParams.get('error_description') || url.searchParams.get('error');

                if (errorDescription) {
                    throw new Error(errorDescription);
                }

                if (code) {
                    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
                    if (exchangeError) throw exchangeError;
                } else if (tokenHash && type) {
                    const { error: verifyError } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
                    if (verifyError) throw verifyError;
                } else {
                    const hashParams = readHashParams();
                    const accessToken = hashParams.get('access_token');
                    const refreshToken = hashParams.get('refresh_token');

                    if (accessToken && refreshToken) {
                        const { error: sessionError } = await supabase.auth.setSession({
                            access_token: accessToken,
                            refresh_token: refreshToken
                        });
                        if (sessionError) throw sessionError;
                    } else {
                        throw new Error('Missing auth callback params. Try signing in again.');
                    }
                }

                if (cancelled) return;

                setStatus('Redirecting…');
                router.replace(next);
                router.refresh();
            } catch (err) {
                if (cancelled) return;
                setError(err?.message || 'Sign-in failed.');
                setStatus('Could not finish sign-in.');
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [router, supabase]);

    return (
        <main className="platform-shell">
            <div className="platform-card">
                <h1>Signing you in…</h1>
                <p className="platform-subtitle">{status}</p>
                {error && <p className="platform-message error">{error}</p>}
                <p className="platform-footer" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <Link href="/login" className="btn ghost">
                        Back to sign in
                    </Link>
                    <Link href="/" className="btn ghost">
                        Back to site
                    </Link>
                </p>
            </div>
        </main>
    );
}
