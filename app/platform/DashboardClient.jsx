'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePlatformSession } from './PlatformContext';

function formatNZD(cents) {
    const value = Number(cents || 0) / 100;
    try {
        return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(value);
    } catch {
        return `$${value}`;
    }
}

function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString();
}

function getMonthStart(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-01`;
}

export default function DashboardClient() {
    const { user, profile, tenantRole, tenantRoleError, supabase } = usePlatformSession();
    const canViewMembership = Boolean(profile?.is_admin) || tenantRole === 'owner';

    const [loading, setLoading] = useState(true);
    const [membership, setMembership] = useState(null);
    const [tokensLeft, setTokensLeft] = useState(0);
    const [siteCount, setSiteCount] = useState(0);

    const periodStart = useMemo(() => getMonthStart(new Date()), []);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            const [membershipResult, creditsResult, sitesResult] = await Promise.all([
                canViewMembership
                    ? supabase
                        .from('memberships')
                        .select('*')
                        .eq('owner_id', user.id)
                        .order('updated_at', { ascending: false })
                        .limit(1)
                        .maybeSingle()
                    : Promise.resolve({ data: null, error: null }),
                supabase
                    .from('room_credits')
                    .select('tokens_total, tokens_used')
                    .eq('owner_id', user.id)
                    .eq('period_start', periodStart)
                    .maybeSingle(),
                supabase.from('sites').select('id', { count: 'exact', head: true })
            ]);

            if (cancelled) return;

            setMembership(membershipResult.data ?? null);
            const total = creditsResult.data?.tokens_total ?? 0;
            const used = creditsResult.data?.tokens_used ?? 0;
            setTokensLeft(Math.max(0, total - used));
            setSiteCount(sitesResult.count || 0);
            setLoading(false);
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [canViewMembership, periodStart, supabase, user.id]);

    const membershipStatus = membership?.status || 'expired';
    const membershipBadge = membershipStatus === 'live' ? 'success' : 'error';
    const membershipLabel = membershipStatus === 'live' ? 'Live' : membershipStatus === 'cancelled' ? 'Cancelled' : 'Expired';
    const monthly = membership?.monthly_amount_cents ?? 0;

    return (
        <div className="platform-grid">
            <section className="platform-card span-6" aria-label="Membership">
                <div className="platform-kpi-row">
                    <h2 style={{ margin: 0 }}>Membership</h2>
                    <span className={`badge ${canViewMembership ? membershipBadge : 'neutral'}`}>
                        {loading ? '…' : canViewMembership ? membershipLabel : 'Member'}
                    </span>
                </div>
                {tenantRoleError && !canViewMembership ? (
                    <p className="platform-message error">{tenantRoleError}</p>
                ) : null}
                <p className="platform-subtitle">
                    {loading
                        ? 'Loading…'
                        : canViewMembership
                            ? membership
                                ? `Plan: ${membership.plan}`
                                : 'No membership on file.'
                            : 'Membership is managed by your tenant owner.'}
                </p>
                <p className="platform-subtitle">
                    {loading ? '' : canViewMembership && membership ? `Amount: ${formatNZD(monthly)} / month` : ''}
                </p>
                <p className="platform-subtitle">
                    Next invoice: {loading ? '—' : canViewMembership ? formatDate(membership?.next_invoice_at) : '—'}
                </p>
                <div className="platform-card-actions">
                    {canViewMembership ? (
                        <Link className="btn primary" href="/platform/membership">
                            See details
                        </Link>
                    ) : (
                        <Link className="btn ghost" href="/platform/settings">
                            Learn more
                        </Link>
                    )}
                </div>
            </section>

            <section className="platform-card span-6" aria-label="Room booking">
                <div className="platform-kpi-row">
                    <h2 style={{ margin: 0 }}>Book a room</h2>
                    <span className="badge neutral">{loading ? '…' : `${tokensLeft} tokens`}</span>
                </div>
                <p className="platform-subtitle">Use your monthly credits, or pay-as-you-go when you run out.</p>
                <div className="platform-card-actions">
                    <Link className="btn primary" href="/platform/rooms">
                        Book now
                    </Link>
                </div>
            </section>

            <section className="platform-card span-6" aria-label="Website hosting">
                <div className="platform-kpi-row">
                    <h2 style={{ margin: 0 }}>Website hosting</h2>
                    <span className="badge neutral">{loading ? '…' : `${siteCount} site${siteCount === 1 ? '' : 's'}`}</span>
                </div>
                <p className="platform-subtitle">View sites, create new ones, and track deployment status.</p>
                <div className="platform-card-actions">
                    <Link className="btn primary" href="/platform/hosting">
                        Manage hosting
                    </Link>
                    <Link className="btn ghost" href="/platform/sites/new">
                        Create site
                    </Link>
                </div>
            </section>

            <section className="platform-card span-6" aria-label="Membership benefits">
                <div className="platform-kpi-row">
                    <h2 style={{ margin: 0 }}>Membership benefits</h2>
                    <span className="badge pending">Coming soon</span>
                </div>
                <p className="platform-subtitle">Perks, partner discounts, events, and member-only resources.</p>
                <div className="platform-card-actions">
                    <Link className="btn ghost" href="/platform/benefits">
                        View benefits
                    </Link>
                </div>
            </section>
        </div>
    );
}
