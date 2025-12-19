'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePlatformSession } from '../../PlatformContext';

function formatNZD(cents) {
    const value = Number(cents || 0) / 100;
    try {
        return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(value);
    } catch {
        return `$${value}`;
    }
}

function formatDateInput(value) {
    const d = new Date();
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return value || `${yyyy}-${mm}-${dd}`;
}

export default function AdminBookingsPage() {
    const { supabase } = usePlatformSession();
    const [spaces, setSpaces] = useState([]);
    const [bookings, setBookings] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [spaceSlug, setSpaceSlug] = useState('');
    const [date, setDate] = useState(() => formatDateInput(''));

    const [ownerEmail, setOwnerEmail] = useState('');
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('10:00');
    const [status, setStatus] = useState('approved');

    const authHeader = async () => {
        const { data } = await supabase.auth.getSession();
        return { Authorization: `Bearer ${data?.session?.access_token}` };
    };

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const [spacesRes, bookingsRes] = await Promise.all([
                fetch('/api/admin/spaces', { headers: await authHeader() }),
                fetch(`/api/admin/room-bookings?from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}&space_slug=${encodeURIComponent(spaceSlug || '')}`, {
                    headers: await authHeader()
                })
            ]);

            const spacesJson = await spacesRes.json();
            const bookingsJson = await bookingsRes.json();

            if (!spacesRes.ok) throw new Error(spacesJson?.error || 'Failed to load spaces.');
            if (!bookingsRes.ok) throw new Error(bookingsJson?.error || 'Failed to load bookings.');

            const loadedSpaces = Array.isArray(spacesJson?.spaces) ? spacesJson.spaces : [];
            setSpaces(loadedSpaces);
            if (!spaceSlug && loadedSpaces[0]?.slug) setSpaceSlug(loadedSpaces[0].slug);

            setBookings(Array.isArray(bookingsJson?.bookings) ? bookingsJson.bookings : []);
        } catch (err) {
            setError(err?.message || 'Failed to load admin bookings.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date, spaceSlug]);

    const createBooking = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/admin/room-bookings', {
                method: 'POST',
                headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    owner_email: ownerEmail,
                    space_slug: spaceSlug,
                    booking_date: date,
                    start_time: startTime,
                    end_time: endTime,
                    status
                })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || 'Failed to create booking.');
            setOwnerEmail('');
            await load();
        } catch (err) {
            setError(err?.message || 'Failed to create booking.');
        } finally {
            setBusy(false);
        }
    };

    const spaceBySlug = useMemo(() => Object.fromEntries(spaces.map(s => [s.slug, s])), [spaces]);

    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Bookings</h1>
                    <p className="platform-subtitle">View bookings and create bookings on behalf of members.</p>
                </div>
                <Link className="btn ghost" href="/platform/admin">
                    Back to admin
                </Link>
            </div>

            {error && <p className="platform-message error">{error}</p>}

            <div className="platform-grid">
                <section className="platform-card span-6">
                    <h2 style={{ marginTop: 0 }}>Filters</h2>
                    <label className="platform-subtitle">Space</label>
                    <select value={spaceSlug} onChange={e => setSpaceSlug(e.target.value)} disabled={loading}>
                        <option value="">All spaces</option>
                        {spaces.map(s => (
                            <option key={s.slug} value={s.slug}>
                                {s.title}
                            </option>
                        ))}
                    </select>
                    <label className="platform-subtitle" style={{ marginTop: '0.75rem', display: 'block' }}>
                        Date
                    </label>
                    <input className="platform-date-input" type="date" value={date} onChange={e => setDate(e.target.value)} disabled={loading} />
                </section>

                <section className="platform-card span-6">
                    <h2 style={{ marginTop: 0 }}>Book on behalf</h2>
                    <form className="contact-form" onSubmit={createBooking}>
                        <label>
                            Member email
                            <input value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} disabled={busy} />
                        </label>
                        <label>
                            Start
                            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} disabled={busy} />
                        </label>
                        <label>
                            End
                            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} disabled={busy} />
                        </label>
                        <label>
                            Status
                            <select value={status} onChange={e => setStatus(e.target.value)} disabled={busy}>
                                <option value="approved">approved</option>
                                <option value="requested">requested</option>
                            </select>
                        </label>
                        <div className="platform-actions">
                            <button className="btn primary" type="submit" disabled={busy || !ownerEmail.trim() || !spaceSlug}>
                                {busy ? 'Working…' : 'Create booking'}
                            </button>
                        </div>
                    </form>
                    {spaceSlug && spaceBySlug[spaceSlug] ? (
                        <p className="platform-subtitle" style={{ marginTop: '0.75rem' }}>
                            Tokens/hr: {spaceBySlug[spaceSlug].tokens_per_hour} • Half day:{' '}
                            {spaceBySlug[spaceSlug].pricing_half_day_cents ? formatNZD(spaceBySlug[spaceSlug].pricing_half_day_cents) : '—'} • Full day:{' '}
                            {spaceBySlug[spaceSlug].pricing_full_day_cents ? formatNZD(spaceBySlug[spaceSlug].pricing_full_day_cents) : '—'}
                        </p>
                    ) : null}
                </section>
            </div>

            <section className="platform-card" style={{ marginTop: '1.25rem' }}>
                <h2 style={{ marginTop: 0 }}>Bookings</h2>
                {loading ? (
                    <p className="platform-subtitle">Loading…</p>
                ) : (
                    <div className="platform-table-wrap">
                        <table className="platform-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Time</th>
                                    <th>Space</th>
                                    <th>Member</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bookings.length ? (
                                    bookings.map(b => (
                                        <tr key={b.id}>
                                            <td className="platform-mono">{b.booking_date}</td>
                                            <td className="platform-mono">
                                                {String(b.start_time).slice(0, 5)}–{String(b.end_time).slice(0, 5)}
                                            </td>
                                            <td>{spaceBySlug[b.space_slug]?.title || b.space_slug}</td>
                                            <td className="platform-mono">{b.owner?.email || b.owner_id}</td>
                                            <td>
                                                <span className={`badge ${b.status === 'approved' ? 'success' : 'pending'}`}>{b.status}</span>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="platform-subtitle">
                                            No bookings found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </main>
    );
}

