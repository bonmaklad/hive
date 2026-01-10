/* eslint-disable react/no-unescaped-entities */
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePlatformSession } from '../PlatformContext';
import { POLICY_SECTIONS } from './policy-sections';

export const dynamic = 'force-dynamic';

export default function PlatformDocsPage() {
    const { profile, tenantRole } = usePlatformSession();
    const canViewOwnerSection = Boolean(profile?.is_admin) || tenantRole === 'owner';

    const platformSections = useMemo(() => {
        const items = [
            canViewOwnerSection
                ? {
                    id: 'owners',
                    label: 'Owner-only billing & tenancy',
                    render: () => (
                        <>
                            <h2 style={{ marginTop: 0 }}>Owner-only: membership, payments, invoices, and tenancy documents</h2>
                            <p className="platform-subtitle" style={{ marginTop: 0 }}>
                                Some functionality is only available to tenant owners (or HIVE admins). If you can’t see an area mentioned here,
                                ask your tenant owner, or raise a ticket for help.
                            </p>
                            <h3>Manage membership and payment terms</h3>
                            <ol>
                                <li>
                                    Go to <Link href="/platform/membership">Membership</Link>.
                                </li>
                                <li>
                                    Review your current plan, monthly amount, and next invoice date.
                                </li>
                                <li>
                                    Under <span className="platform-mono">Payment terms</span>, choose:
                                    <ul>
                                        <li>
                                            <span className="platform-mono">Invoice</span> (manual invoice workflow), or
                                        </li>
                                        <li>
                                            <span className="platform-mono">Automatic card payment</span> (Stripe).
                                        </li>
                                    </ul>
                                </li>
                            </ol>
                            <h3>View invoices</h3>
                            <p className="platform-subtitle">
                                On <Link href="/platform/membership">Membership</Link>, scroll to the <span className="platform-mono">Invoices</span> section to see your full
                                invoice history and open invoice PDFs/Stripe receipts.
                            </p>
                            <h3>View tenancy documentation</h3>
                            <p className="platform-subtitle">
                                On <Link href="/platform/membership">Membership</Link>, scroll to the <span className="platform-mono">Documentation</span> section to view uploaded tenant
                                documents (agreements, notices, and other files).
                            </p>
                        </>
                    )
                }
                : null,
            {
                id: 'workspaces',
                label: 'Workspaces & changes',
                render: () => (
                    <>
                        <h2 style={{ marginTop: 0 }}>Workspaces: view what you have and request changes</h2>
                        <p className="platform-subtitle" style={{ marginTop: 0 }}>
                            Your membership plan and any assigned offices are shown in <Link href="/platform/membership">Membership</Link>.
                            If you need to change desks/pods/offices, or want to add/remove capacity, use the ticket system so the HIVE HQ team can track and action it.
                        </p>
                        <ol>
                            <li>
                                Go to <Link href="/platform/tickets">Tickets</Link>.
                            </li>
                            <li>
                                Create a ticket with what you need changed (who, what workspace, when, and any constraints).
                            </li>
                            <li>
                                Track progress in the board as it moves through <span className="platform-mono">Doing</span> and <span className="platform-mono">Done</span>.
                            </li>
                        </ol>
                    </>
                )
            },
            {
                id: 'rooms',
                label: 'Room bookings',
                render: () => (
                    <>
                        <h2 style={{ marginTop: 0 }}>Book a room and see your bookings</h2>
                        <h3>Book a room</h3>
                        <ol>
                            <li>
                                Go to <Link href="/platform/rooms">Book a room</Link>.
                            </li>
                            <li>
                                Choose a room, date, and time range.
                            </li>
                            <li>
                                Confirm the required tokens and any pay-as-you-go amount (if applicable), then submit the booking.
                            </li>
                        </ol>
                        <h3>View bookings</h3>
                        <p className="platform-subtitle" style={{ marginTop: 0 }}>
                            Go to <Link href="/platform/bookings">Bookings</Link> to see your upcoming and past bookings.
                        </p>
                    </>
                )
            },
            {
                id: 'tokens',
                label: 'Token system',
                render: () => (
                    <>
                        <h2 style={{ marginTop: 0 }}>Token system (room credits)</h2>
                        <p className="platform-subtitle" style={{ marginTop: 0 }}>
                            Room bookings use a monthly token system. Tokens are applied first, and if you run out you can still book by paying the remainder via Stripe.
                        </p>
                        <h3>Current allocation</h3>
                        <p className="platform-subtitle">
                            We’re still finalising the long-term monthly allocation. For now, everyone has been given <span className="platform-mono">100 tokens</span>.
                        </p>
                        <h3>How tokens are calculated</h3>
                        <ul>
                            <li>Each room has a token cost per hour.</li>
                            <li>Your booking shows <span className="platform-mono">tokens required</span>, <span className="platform-mono">tokens applied</span>, and whether a payment is required.</li>
                            <li>Tokens reset on a monthly cycle.</li>
                        </ul>
                        <h3>No tokens left</h3>
                        <p className="platform-subtitle">
                            If you don’t have enough tokens, you can still book:
                        </p>
                        <ol>
                            <li>
                                Submit your booking as normal in <Link href="/platform/rooms">Book a room</Link>.
                            </li>
                            <li>
                                Pay the displayed amount via Stripe checkout.
                            </li>
                            <li>
                                An invoice is issued automatically as part of the payment flow.
                            </li>
                        </ol>
                    </>
                )
            },
            {
                id: 'hosting',
                label: 'Website hosting (coming soon)',
                render: () => (
                    <>
                        <h2 style={{ marginTop: 0 }}>Website hosting (coming soon)</h2>
                        <p className="platform-subtitle" style={{ marginTop: 0 }}>
                            Hosting is available in the platform and is how <span className="platform-mono">hivehq.nz</span> is run. We’re still polishing the experience and adding an AI interface to help you build and debug without needing to run anything locally.
                        </p>
                        <h3>How it works</h3>
                        <ul>
                            <li>Connect your GitHub account.</li>
                            <li>Create a site, add environment variables, and deploy.</li>
                            <li>Every push triggers a rebuild and redeploy.</li>
                            <li>You’ll see deploy status (success/failure) and logs in the platform.</li>
                        </ul>
                        <p className="platform-subtitle">
                            Start here: <Link href="/platform/hosting">Hosting</Link> and <Link href="/platform/sites/new">Create site</Link>.
                        </p>
                        <h3>Custom domains</h3>
                        <p className="platform-subtitle" style={{ marginTop: 0 }}>
                            You can attach a custom domain by pointing DNS to the tunnel and then verifying in the platform.
                        </p>
                        <ol>
                            <li>
                                Create a <span className="platform-mono">CNAME</span> record for your domain pointing to{' '}
                                <span className="platform-mono">92967c7e-6463-4353-a331-ebe0c43af013.cfargotunnel.com</span>.
                            </li>
                            <li>
                                If your DNS provider doesn’t allow a root/apex CNAME, use an <span className="platform-mono">ALIAS/ANAME</span> at the root, or point <span className="platform-mono">www</span> to the tunnel and redirect the root domain.
                            </li>
                            <li>
                                Set <span className="platform-mono">www</span> to redirect to the root (or keep <span className="platform-mono">www</span> as the canonical host if your DNS requires it).
                            </li>
                        </ol>
                    </>
                )
            },
            {
                id: 'google-tag',
                label: 'Google tag (analytics)',
                render: () => (
                    <>
                        <h2 style={{ marginTop: 0 }}>Choose how to set up a Google tag</h2>
                        <p className="platform-subtitle" style={{ marginTop: 0 }}>
                            Install manually (recommended)
                        </p>
                        <p className="platform-subtitle">
                            Below is the Google tag for this account. Copy and paste it in the code of every page of your website, immediately after the{' '}
                            <span className="platform-mono">&lt;head&gt;</span> element. Don't add more than one Google tag to each page.
                        </p>
                        <pre className="platform-code">{`<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-Y3TBH9LDL0"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-Y3TBH9LDL0');
</script>`}</pre>
                        <h3>Use Google Tag Manager</h3>
                        <p className="platform-subtitle" style={{ marginTop: 0 }}>
                            For additional features including multiple tag management and enterprise workflows, install and manage with Google Tag Manager.{' '}
                            <a className="platform-link" href="https://tagmanager.google.com/" target="_blank" rel="noreferrer">
                                Learn more about Google Tag Manager
                            </a>
                            .
                        </p>
                        <h3>EEA consent mode</h3>
                        <p className="platform-subtitle" style={{ marginTop: 0 }}>
                            If you have end users in the European Economic Area (EEA), set up consent mode so that you can continue to benefit from ads
                            personalization and measurement.
                        </p>
                    </>
                )
            },
            {
                id: 'benefits',
                label: 'Membership benefits (coming soon)',
                render: () => (
                    <>
                        <h2 style={{ marginTop: 0 }}>Membership benefits (coming soon)</h2>
                        <p className="platform-subtitle" style={{ marginTop: 0 }}>
                            We’ll gather everyone’s business needs, then negotiate bulk discounts and local partner offers that genuinely help members.
                        </p>
                        <p className="platform-subtitle">
                            Keep an eye on <Link href="/platform/benefits">Benefits</Link>.
                        </p>
                    </>
                )
            },
            {
                id: 'tickets',
                label: 'Tickets & support',
                render: () => (
                    <>
                        <h2 style={{ marginTop: 0 }}>Tickets: how to raise needs and track progress</h2>
                        <p className="platform-subtitle" style={{ marginTop: 0 }}>
                            Tickets are the single place to request help, changes, maintenance, or anything the HIVE HQ team should action. Using tickets helps us prioritise and route to the right person.
                        </p>
                        <ol>
                            <li>
                                Go to <Link href="/platform/tickets">Tickets</Link>.
                            </li>
                            <li>
                                Create a ticket with a clear title, details, and any deadlines.
                            </li>
                            <li>
                                Watch the board for live status as it moves through <span className="platform-mono">Doing</span> and <span className="platform-mono">Done</span>.
                            </li>
                        </ol>
                        <p className="platform-subtitle">
                            If there’s an injury or safety incident, raise a ticket so it’s recorded.
                        </p>
                    </>
                )
            },
            {
                id: 'chat',
                label: 'Chat & @everyone',
                render: () => (
                    <>
                        <h2 style={{ marginTop: 0 }}>Chat: members-only messaging and @everyone</h2>
                        <p className="platform-subtitle" style={{ marginTop: 0 }}>
                            Use <Link href="/platform/chat">Chat</Link> to keep in touch in or out of the office.
                        </p>
                        <ul>
                            <li>Mention people normally using <span className="platform-mono">@name</span> when available.</li>
                            <li><span className="platform-mono">@everyone</span> sends an email to everyone and is restricted to admins.</li>
                            <li>Keep chat respectful and on-topic for a coworking community.</li>
                        </ul>
                    </>
                )
            },
            {
                id: 'pwa',
                label: 'Install as an app (PWA)',
                render: () => (
                    <>
                        <h2 style={{ marginTop: 0 }}>Install as an app (PWA)</h2>
                        <p className="platform-subtitle" style={{ marginTop: 0 }}>
                            HIVE HQ is a Progressive Web App. You can install it so it behaves like a normal app (fast access, its own icon, full screen).
                        </p>
                        <h3>Android (Chrome)</h3>
                        <ol>
                            <li>Open <a href="https://hivehq.nz/platform" target="_blank" rel="noopener noreferrer">https://hivehq.nz/platform</a>.</li>
                            <li>When prompted, tap <span className="platform-mono">Install</span>. If you don’t see a prompt, open the browser menu and choose <span className="platform-mono">Install app</span>.</li>
                            <li>Launch it from your home screen.</li>
                        </ol>
                        <h3>iPhone/iPad (Safari)</h3>
                        <ol>
                            <li>Open <a href="https://hivehq.nz/platform" target="_blank" rel="noopener noreferrer">https://hivehq.nz/platform</a> in Safari.</li>
                            <li>Tap the <span className="platform-mono">Share</span> button (square with an arrow).</li>
                            <li>Scroll and tap <span className="platform-mono">Add to Home Screen</span>.</li>
                            <li>Name it (e.g. <span className="platform-mono">HIVE HQ</span>) and tap <span className="platform-mono">Add</span>.</li>
                        </ol>
                    </>
                )
            },
            {
                id: 'help',
                label: 'How to help HIVE HQ',
                render: () => (
                    <>
                        <h2 style={{ marginTop: 0 }}>How to help HIVE HQ</h2>
                        <p className="platform-subtitle" style={{ marginTop: 0 }}>
                            HIVE HQ is run as a members-led community. We all benefit when we all contribute to growing and maintaining the network.
                        </p>
                        <ul>
                            <li>
                                Promote vacant spaces to people who fit the ecosystem (you can see what’s available and what’s in demand).
                            </li>
                            <li>
                                Share the public bookings link: <a href="https://hivehq.nz/bookings" target="_blank" rel="noopener noreferrer">https://hivehq.nz/bookings</a>.
                            </li>
                            <li>
                                Raise tickets for issues instead of side messages, so nothing gets lost and we can prioritise fairly.
                            </li>
                            <li>
                                Be a good neighbour: keep common areas tidy, help newcomers, and communicate early if there’s a problem.
                            </li>
                        </ul>
                    </>
                )
            }
        ].filter(Boolean);

        return items;
    }, [canViewOwnerSection]);

    const policySections = useMemo(() => POLICY_SECTIONS, []);
    const allSections = useMemo(() => [...platformSections, ...policySections], [platformSections, policySections]);

    const sectionById = useMemo(() => new Map(allSections.map(s => [s.id, s])), [allSections]);
    const defaultSectionId = useMemo(
        () => (canViewOwnerSection ? 'owners' : platformSections[0]?.id || 'workspaces'),
        [canViewOwnerSection, platformSections]
    );
    const [activeId, setActiveId] = useState(defaultSectionId);

    useEffect(() => {
        const syncFromHash = () => {
            const raw = typeof window !== 'undefined' ? window.location.hash : '';
            const next = raw && raw.startsWith('#') ? raw.slice(1) : '';
            if (next && sectionById.has(next)) setActiveId(next);
        };

        syncFromHash();
        window.addEventListener('hashchange', syncFromHash);
        return () => window.removeEventListener('hashchange', syncFromHash);
    }, [sectionById]);

    useEffect(() => {
        if (!sectionById.has(activeId) && sectionById.has(defaultSectionId)) setActiveId(defaultSectionId);
    }, [activeId, defaultSectionId, sectionById]);

    const activeSection = sectionById.get(activeId) || sectionById.get(defaultSectionId) || allSections[0];

    const setActive = nextId => {
        if (!sectionById.has(nextId)) return;
        setActiveId(nextId);
        if (typeof window === 'undefined') return;
        window.history.replaceState(null, '', `#${nextId}`);
    };

    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Documentation</h1>
                    <p className="platform-subtitle">One place for how-to guides, policies, and help for HIVE HQ.</p>
                </div>
                <Link className="btn ghost" href="/platform">
                    Back to dashboard
                </Link>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <aside
                    className="platform-card"
                    aria-label="Documentation navigation"
                    style={{ position: 'sticky', top: 84, alignSelf: 'start', flex: '1 1 260px', minWidth: 240 }}
                >
                    <h2 style={{ marginTop: 0 }}>Quick links</h2>
                    <p className="platform-subtitle" style={{ marginTop: 0 }}>
                        This guide is a living document and may change at any time. If something is unclear, raise a ticket.
                    </p>

                    <div className="platform-subtitle" style={{ marginTop: '1rem' }}>Using the platform</div>
                    <nav style={{ marginTop: '0.5rem', display: 'grid', gap: 4 }}>
                        {platformSections.map(section => {
                            const isActive = section.id === activeSection?.id;
                            return (
                                <button
                                    key={section.id}
                                    type="button"
                                    onClick={() => setActive(section.id)}
                                    aria-current={isActive ? 'page' : undefined}
                                    style={{
                                        textAlign: 'left',
                                        padding: '0.5rem 0.6rem',
                                        borderRadius: 10,
                                        border: '1px solid transparent',
                                        background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                                        color: 'inherit',
                                        cursor: 'pointer',
                                        fontWeight: isActive ? 600 : 400
                                    }}
                                >
                                    {section.label}
                                </button>
                            );
                        })}
                    </nav>

                    <div className="platform-subtitle" style={{ marginTop: '1rem' }}>Space policies</div>
                    <nav style={{ marginTop: '0.5rem', display: 'grid', gap: 4 }}>
                        {policySections.map(section => {
                            const isActive = section.id === activeSection?.id;
                            return (
                                <button
                                    key={section.id}
                                    type="button"
                                    onClick={() => setActive(section.id)}
                                    aria-current={isActive ? 'page' : undefined}
                                    style={{
                                        textAlign: 'left',
                                        padding: '0.5rem 0.6rem',
                                        borderRadius: 10,
                                        border: '1px solid transparent',
                                        background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                                        color: 'inherit',
                                        cursor: 'pointer',
                                        fontWeight: isActive ? 600 : 400
                                    }}
                                >
                                    {section.label}
                                </button>
                            );
                        })}
                    </nav>
                </aside>

                <section className="platform-card" aria-label={activeSection?.label || 'Documentation'} style={{ flex: '999 1 420px', minWidth: 280 }}>
                    {activeSection?.render ? activeSection.render() : null}
                </section>
            </div>
        </main>
    );
}
