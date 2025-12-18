'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

function parseHashParams(hash) {
    const raw = typeof hash === 'string' ? hash : '';
    const trimmed = raw.startsWith('#') ? raw.slice(1) : raw;
    return new URLSearchParams(trimmed);
}

function clearHash() {
    try {
        const url = new URL(window.location.href);
        url.hash = '';
        window.history.replaceState({}, '', url.toString());
    } catch {
        // ignore
    }
}

function getSafeNext(value) {
    if (typeof value !== 'string') return null;
    if (!value.startsWith('/')) return null;
    return value;
}

export default function AuthSessionSync() {
    const router = useRouter();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            const url = new URL(window.location.href);
            const pathname = url.pathname;
            const urlSearchParams = url.searchParams;
            const hashParams = parseHashParams(window.location.hash);

            const error = hashParams.get('error');
            const errorCode = hashParams.get('error_code');
            const errorDescription = hashParams.get('error_description');
            const authType = hashParams.get('type');

            if (error || errorCode) {
                clearHash();
                const params = new URLSearchParams(urlSearchParams.toString());
                params.set('error', errorCode || error || 'auth_error');
                if (errorDescription) params.set('error_description', errorDescription);
                router.replace(`/login?${params.toString()}`);
                return;
            }

            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');

            if (!accessToken || !refreshToken) return;

            try {
                const { error: setError } = await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken
                });
                if (setError) throw setError;

                if (cancelled) return;
                clearHash();

                const explicitNext = getSafeNext(urlSearchParams.get('next'));
                if (explicitNext) {
                    router.replace(explicitNext);
                    return;
                }

                if (authType === 'magiclink' || authType === 'invite' || authType === 'recovery') {
                    router.replace('/platform/settings');
                    return;
                }

                if (pathname === '/') {
                    router.replace('/platform/settings');
                    return;
                }

                router.refresh();
            } catch (err) {
                if (cancelled) return;
                clearHash();
                const params = new URLSearchParams(urlSearchParams.toString());
                params.set('error', 'auth_error');
                params.set('error_description', err?.message || 'Could not finish sign-in.');
                router.replace(`/login?${params.toString()}`);
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [router, supabase]);

    return null;
}
