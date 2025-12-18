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
                const type = url.searchParams.get('type');
                const defaultNext = type === 'recovery' || type === 'invite' || type === 'magiclink' ? '/platform/settings' : '/platform';
                const next = getSafeNext(url.searchParams.get('next') || defaultNext);
                const code = url.searchParams.get('code');
                const tokenHash = url.searchParams.get('token_hash');
                const errorDescription = url.searchParams.get('error_description') || url.searchParams.get('error');

                if (errorDescription) {
                    throw new Error(errorDescription);
                }

                const waitForSession = async () => {
                    for (let attempt = 0; attempt < 6; attempt += 1) {
                        const { data, error } = await supabase.auth.getSession();
                        if (error) throw error;
                        if (data?.session) return data.session;
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                    return null;
                };

                const existingSession = await waitForSession();

                if (!existingSession) {
                    if (code) {
                        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
                        if (exchangeError) {
                            const message = exchangeError?.message || 'Could not finish sign-in.';
                            if (message.toLowerCase().includes('code verifier')) {
                                throw new Error(
                                    'This sign-in link was opened in a different browser/device. Please open the link on the same device you requested it from, or request a new invite link.'
                                );
                            }
                            throw exchangeError;
                        }
                    } else if (tokenHash && type) {
                        const { error: verifyError } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
                        if (verifyError) throw verifyError;
                    }
                }

                const session = existingSession || (await waitForSession());
                if (!session) {
                    throw new Error('No session found. Please try the link again, or request a new invite.');
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
