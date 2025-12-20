'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePlatformSession } from '../PlatformContext';

function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString();
}

function formatNZD(cents) {
    const value = Number(cents || 0) / 100;
    try {
        return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(value);
    } catch {
        return `$${value}`;
    }
}

function getMonthStart(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-01`;
}

function todayDateString() {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export default function BookingsClient() {
    const { user, supabase } = usePlatformSession();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [bookings, setBookings] = useState([]);
    const [tokensLeft, setTokensLeft] = useState(0);
    const [showPast, setShowPast] = useState(false);

    const periodStart = useMemo(() => getMonthStart(new Date()), []);
    const today = useMemo(() => todayDateString(), []);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError('');
            try {
                const [creditsRes, spacesRes] = await Promise.all([
                    supabase
                        .from('room_credits')
                        .select('tokens_total, tokens_used')
                        .eq('owner_id', user.id)
                        .eq('period_start', periodStart)
                        .maybeSingle(),
                    supabase.from('spaces').select('slug, title')
                ]);

                if (cancelled) return;

                if (creditsRes.error) throw creditsRes.error;
                if (spacesRes.error) throw spacesRes.error;

                const total = creditsRes.data?.tokens_total ?? 0;
                const used = creditsRes.data?.tokens_used ?? 0;
                setTokensLeft(Math.max(0, total - used));

                const titleBySlug = Object.fromEntries((spacesRes.data || []).map(s => [s.slug, s.title]));

                const bookingsQuery = supabase
                    .from('room_bookings')
                    .select('id, booking_date, start_time, end_time, space_slug, status, tokens_used, price_cents, currency, created_at')
                    .eq('owner_id', user.id)
                    .order('booking_date', { ascending: true })
                    .order('start_time', { ascending: true })
                    .limit(200);

                if (!showPast) bookingsQuery.gte('booking_date', today);

                const { data: bookingsData, error: bookingsError } = await bookingsQuery;
                if (bookingsError) throw bookingsError;

                const mapped = (bookingsData || []).map(b => ({
                    ...b,
                    space_title: titleBySlug[b.space_slug] || b.space_slug
                }));

                if (cancelled) return;
                setBookings(mapped);
            } catch (e) {
                setError(e?.message || 'Failed to load bookings.');
                setBookings([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [periodStart, showPast, supabase, today, user.id]);

    return (
        <section className="platform-card" aria-label="Your bookings">
            <div className="platform-kpi-row">
                <div>
                    <h2 style={{ margin: 0 }}>Your bookings</h2>
                    <p className="platform-subtitle" style={{ marginTop: '0.25rem' }}>
                        {showPast ? 'Showing all bookings.' : 'Showing upcoming bookings.'}
                    </p>
                </div>
                <span className="badge neutral">{loading ? '…' : `${tokensLeft} tokens left`}</span>
            </div>

            <div className="platform-actions" style={{ marginTop: '0.75rem' }}>
                <Link className="btn primary" href="/platform/rooms">
                    Book now
                </Link>
                <button className="btn ghost" type="button" onClick={() => setShowPast(v => !v)} disabled={loading}>
                    {showPast ? 'Hide past' : 'Show past'}
                </button>
            </div>

            {error ? <p className="platform-message error">{error}</p> : null}

            {loading ? (
                <p className="platform-subtitle" style={{ marginTop: '1rem' }}>
                    Loading…
                </p>
            ) : (
                <div className="platform-table-wrap" style={{ marginTop: '1rem' }}>
                    <table className="platform-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Time</th>
                                <th>Space</th>
                                <th>Status</th>
                                <th>Tokens</th>
                                <th>Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bookings.length ? (
                                bookings.map(b => (
                                    <tr key={b.id}>
                                        <td className="platform-mono">{formatDate(b.booking_date)}</td>
                                        <td className="platform-mono">
                                            {String(b.start_time).slice(0, 5)}–{String(b.end_time).slice(0, 5)}
                                        </td>
                                        <td>{b.space_title}</td>
                                        <td>
                                            <span
                                                className={`badge ${
                                                    b.status === 'approved'
                                                        ? 'success'
                                                        : b.status === 'requested'
                                                          ? 'pending'
                                                          : b.status === 'rejected'
                                                            ? 'error'
                                                            : 'neutral'
                                                }`}
                                            >
                                                {b.status}
                                            </span>
                                        </td>
                                        <td className="platform-mono">{b.tokens_used || 0}</td>
                                        <td className="platform-mono">{b.price_cents ? formatNZD(b.price_cents) : '—'}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} className="platform-subtitle">
                                        No bookings yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

