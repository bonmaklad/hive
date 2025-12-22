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
    const isChatPage = pathname === '/platform/chat';

    const [ready, setReady] = useState(false);
    const [user, setUser] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [profile, setProfile] = useState(null);
    const [tenantRole, setTenantRole] = useState(null);
    const [tenantRoleError, setTenantRoleError] = useState('');
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const loadTenantRole = async sessionUser => {
            setTenantRoleError('');
            const { data, error } = await supabase.from('tenant_users').select('role').eq('user_id', sessionUser.id);
            if (error) {
                const message = error?.message || '';
                if (message.toLowerCase().includes('infinite recursion')) {
                    setTenantRoleError('Tenant access is misconfigured (RLS recursion). Ask an admin to fix tenant_users policies.');
                }
                return null;
            }

            const roles = Array.isArray(data) ? data.map(r => r?.role).filter(Boolean) : [];
            if (!roles.length) return null;
            if (roles.includes('owner')) return 'owner';
            if (roles.includes('admin')) return 'admin';
            return roles[0] || null;
        };

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
                const sessionUser = data?.session?.user ?? null;
                setUser(sessionUser);
                setReady(true);

                if (!sessionUser) {
                    setProfile(null);
                    setTenantRole(null);
                    setTenantRoleError('');
                    return;
                }

                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('id, email, name, is_admin')
                    .eq('id', sessionUser.id)
                    .single();
                if (cancelled) return;
                setProfile(profileData ?? null);

                const role = await loadTenantRole(sessionUser);
                if (!cancelled) setTenantRole(role);
            } catch (err) {
                if (cancelled) return;
                setLoadError(err?.message || 'Could not check session.');
                setUser(null);
                setProfile(null);
                setTenantRole(null);
                setTenantRoleError('');
                setReady(true);
            }
        };

        load();

        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            if (cancelled) return;
            const sessionUser = session?.user ?? null;
            setUser(sessionUser);
            setReady(true);

            if (!sessionUser) {
                setProfile(null);
                setTenantRole(null);
                setTenantRoleError('');
                return;
            }

            supabase
                .from('profiles')
                .select('id, email, name, is_admin')
                .eq('id', sessionUser.id)
                .single()
                .then(({ data: profileData }) => {
                    if (!cancelled) setProfile(profileData ?? null);
                })
                .catch(() => {
                    // ignore
                });

            loadTenantRole(sessionUser)
                .then(role => {
                    if (!cancelled) setTenantRole(role);
                })
                .catch(() => {
                    // ignore
                });
        });

        return () => {
            cancelled = true;
            data.subscription.unsubscribe();
        };
    }, [supabase]);

    useEffect(() => {
        setMobileNavOpen(false);
    }, [pathname]);

    useEffect(() => {
        if (!mobileNavOpen) return;

        const onKeyDown = event => {
            if (event.key === 'Escape') setMobileNavOpen(false);
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [mobileNavOpen]);

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
        <PlatformSessionProvider value={{ user, profile, tenantRole, tenantRoleError, supabase }}>
            <div className="platform-shell">
                {!isChatPage ? (
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
                        <button
                            className="btn ghost platform-nav-toggle"
                            type="button"
                            onClick={() => setMobileNavOpen(open => !open)}
                            aria-expanded={mobileNavOpen}
                            aria-controls="platform-mobile-nav"
                        >
                            Menu
                        </button>
                        <nav className="platform-nav">
                            <Link href="/platform" className="btn ghost">
                                Dashboard
                            </Link>
                            <Link href="/platform/chat" className="btn ghost">
                                Chat
                            </Link>
                            {profile?.is_admin ? (
                                <Link href="/platform/admin" className="btn ghost">
                                    Admin
                                </Link>
                            ) : null}
                            <Link href="/platform/settings" className="btn ghost">
                                Settings
                            </Link>
                            <Link href="/auth/signout" className="btn secondary">
                                Sign out
                            </Link>
                        </nav>
                    </header>
                ) : null}

                {mobileNavOpen && !isChatPage ? (
                    <div
                        id="platform-mobile-nav"
                        className="platform-mobile-nav-overlay"
                        role="presentation"
                        onMouseDown={() => setMobileNavOpen(false)}
                    >
                        <div className="platform-mobile-nav" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation()}>
                            <div className="platform-mobile-nav-header">
                                <div>
                                    <div className="platform-mobile-nav-title">Navigation</div>
                                    <div className="platform-subtitle" style={{ marginTop: '0.25rem' }}>
                                        {profile?.email || user?.email || ''}
                                    </div>
                                </div>
                                <button className="btn ghost" type="button" onClick={() => setMobileNavOpen(false)}>
                                    Close
                                </button>
                            </div>

                            <div className="platform-mobile-nav-links">
                                <Link href="/platform" className="btn ghost" onClick={() => setMobileNavOpen(false)}>
                                    Dashboard
                                </Link>
                                <Link href="/platform/chat" className="btn ghost" onClick={() => setMobileNavOpen(false)}>
                                    Chat
                                </Link>
                                {profile?.is_admin ? (
                                    <Link href="/platform/admin" className="btn ghost" onClick={() => setMobileNavOpen(false)}>
                                        Admin
                                    </Link>
                                ) : null}
                                <Link href="/platform/tickets" className="btn ghost" onClick={() => setMobileNavOpen(false)}>
                                    Raise a ticket
                                </Link>
                                <Link href="/platform/settings" className="btn ghost" onClick={() => setMobileNavOpen(false)}>
                                    Settings
                                </Link>
                                <Link href="/auth/signout" className="btn secondary" onClick={() => setMobileNavOpen(false)}>
                                    Sign out
                                </Link>
                            </div>
                        </div>
                    </div>
                ) : null}
                <div className={`platform-content ${isChatPage ? 'platform-content-chat' : ''}`}>{children}</div>

                {!isChatPage ? (
                    <footer className="platform-footer-bar">
                        <Link className="btn ghost" href="/platform/tickets">
                            Raise a ticket
                        </Link>
                    </footer>
                ) : null}

                {!isChatPage ? <ChatDrawer /> : null}
            </div>
        </PlatformSessionProvider>
    );
}
