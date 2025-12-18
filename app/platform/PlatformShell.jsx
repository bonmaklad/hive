'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

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

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            const { data, error } = await supabase.auth.getSession();
            if (cancelled) return;

            if (error) {
                setUser(null);
                setReady(true);
                return;
            }

            setUser(data?.session?.user ?? null);
            setReady(true);
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
        return null;
    }

    return (
        <div className="platform-shell">
            <header className="platform-header">
                <Link href="/platform" className="platform-brand">
                    Platform
                </Link>
                <nav className="platform-nav">
                    <Link href="/platform" className="btn ghost">
                        Dashboard
                    </Link>
                    <Link href="/platform/sites/new" className="btn primary">
                        New site
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
        </div>
    );
}
