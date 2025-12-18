'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { PlatformSessionProvider } from './PlatformContext';
import ChatDrawer from './components/ChatDrawer';

function safeLoginRedirect(pathname) {
    const next = typeof pathname === 'string' && pathname.startsWith('/platform') ? pathname : '/platform';
    return `/login?next=${encodeURIComponent(next)}`;
}

export default function PlatformShell({ children }) {
    const router = useRouter();
    const pathname = usePathname();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);

    const [ready, setReady] = useState(false);
    const [user, setUser] = useState(null);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                const timeout = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timed out while checking your session.')), 2000)
                );
                const result = await Promise.race([supabase.auth.getSession(), timeout]);
                if (cancelled) return;

                const { data, error } = result;
                if (error) {
                    setLoadError(error.message);
                    setUser(null);
                    setReady(true);
                    return;
                }

                setLoadError('');
                setUser(data?.session?.user ?? null);
                setReady(true);
            } catch (err) {
                if (cancelled) return;
                setLoadError(err?.message || 'Could not check session.');
                setUser(null);
                setReady(true);
            }
        };

        load();

        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            if (cancelled) return;
            setUser(session?.user ?? null);
            setReady(true);
        });

        return () => {
            cancelled = true;
            data.subscription.unsubscribe();
        };
    }, [supabase]);

    useEffect(() => {
        if (!ready) return;

        if (!user) {
            router.replace(safeLoginRedirect(pathname));
            return;
        }

        const mustSetPassword = Boolean(user?.user_metadata?.must_set_password);
        if (mustSetPassword && pathname !== '/platform/settings') {
            router.replace('/platform/settings');
        }
    }, [pathname, ready, router, user]);

    if (!ready) {
        return (
            <div className="platform-shell">
                <div className="platform-card">
                    <p className="platform-subtitle">Loading…</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="platform-shell">
                <div className="platform-card">
                    <h1>Redirecting…</h1>
                    <p className="platform-subtitle">Sending you to sign in.</p>
                    {loadError && <p className="platform-message error">{loadError}</p>}
                    <p className="platform-footer">
                        <Link href={safeLoginRedirect(pathname)} className="btn primary">
                            Go to sign in
                        </Link>
                    </p>
                </div>
            </div>
        );
    }

    return (
        <PlatformSessionProvider value={{ user, supabase }}>
            <div className="platform-shell">
                <header className="platform-header">
                    <Link href="/platform" className="platform-brand">
                        <Image
                            src="/logo-square.png"
                            width={36}
                            height={36}
                            alt="HIVE"
                            priority
                            className="platform-logo"
                        />
                        <span>Platform</span>
                    </Link>
                    <nav className="platform-nav">
                        <Link href="/platform" className="btn ghost">
                            Dashboard
                        </Link>
                        <Link href="/platform/settings" className="btn ghost">
                            Settings
                        </Link>
                        <Link href="/auth/signout" className="btn secondary">
                            Sign out
                        </Link>
                    </nav>
                </header>
                <div className="platform-content">{children}</div>

                <footer className="platform-footer-bar">
                    <Link className="btn ghost" href="/platform/tickets">
                        Raise a ticket
                    </Link>
                </footer>

                <ChatDrawer />
            </div>
        </PlatformSessionProvider>
    );
}
