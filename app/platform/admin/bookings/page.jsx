'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_FORMAT = new Intl.DateTimeFormat('en-NZ', { month: 'long', year: 'numeric' });
const PIN_PALETTE = ['#f6a04d', '#6fc1ff', '#7be2a8', '#c59bff', '#ff87b5', '#ffd166', '#4dd1a1', '#ffb347'];

function formatInputDate(dateObj) {
    const yyyy = String(dateObj.getFullYear());
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function parseInputDate(value) {
    if (typeof value !== 'string') return new Date();
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return new Date();
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    return new Date(year, month, day);
}

function getMonthGrid(dateObj) {
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const total = Math.ceil((offset + daysInMonth) / 7) * 7;
    const cells = [];

    for (let i = 0; i < total; i += 1) {
        const dayNum = i - offset + 1;
        const cellDate = new Date(year, month, dayNum);
        cells.push({ date: cellDate, inMonth: dayNum >= 1 && dayNum <= daysInMonth });
    }

    return cells;
}

export default function AdminBookingsPage() {
    const { supabase } = usePlatformSession();
    const [spaces, setSpaces] = useState([]);
    const [bookings, setBookings] = useState([]);
    const [calendarBookings, setCalendarBookings] = useState([]);
    const [error, setError] = useState('');
    const [calendarError, setCalendarError] = useState('');
    const [loading, setLoading] = useState(true);
    const [calendarLoading, setCalendarLoading] = useState(true);
    const [spacesLoading, setSpacesLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [spaceSlug, setSpaceSlug] = useState('');
    const [date, setDate] = useState(() => formatDateInput(''));

    const [ownerEmail, setOwnerEmail] = useState('');
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('10:00');
    const [status, setStatus] = useState('approved');

    const authHeader = useCallback(async () => {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) throw new Error('No session token. Please sign in again.');
        return { Authorization: `Bearer ${token}` };
    }, [supabase]);

    const calendarKey = date?.slice(0, 7) || formatInputDate(new Date()).slice(0, 7);
    const calendarMonthDate = useMemo(() => parseInputDate(`${calendarKey}-01`), [calendarKey]);
    const calendarDays = useMemo(() => getMonthGrid(calendarMonthDate), [calendarMonthDate]);
    const calendarLabel = useMemo(() => MONTH_FORMAT.format(calendarMonthDate), [calendarMonthDate]);
    const todayKey = useMemo(() => formatInputDate(new Date()), []);

    const loadSpaces = useCallback(async () => {
        setSpacesLoading(true);
        setError('');
        try {
            const spacesRes = await fetch('/api/admin/spaces', { headers: await authHeader() });
            const spacesJson = await spacesRes.json();
            if (!spacesRes.ok) throw new Error(spacesJson?.error || 'Failed to load spaces.');
            setSpaces(Array.isArray(spacesJson?.spaces) ? spacesJson.spaces : []);
        } catch (err) {
            setError(err?.message || 'Failed to load spaces.');
        } finally {
            setSpacesLoading(false);
        }
    }, [authHeader]);

    const loadBookingsForDay = useCallback(async () => {
        if (!date) return;
        setLoading(true);
        setError('');
        try {
            const qs = new URLSearchParams({
                from: date,
                to: date
            });
            if (spaceSlug) qs.set('space_slug', spaceSlug);
            const bookingsRes = await fetch(`/api/admin/room-bookings?${qs.toString()}`, {
                headers: await authHeader()
            });
            const bookingsJson = await bookingsRes.json();
            if (!bookingsRes.ok) throw new Error(bookingsJson?.error || 'Failed to load bookings.');
            setBookings(Array.isArray(bookingsJson?.bookings) ? bookingsJson.bookings : []);
        } catch (err) {
            setError(err?.message || 'Failed to load admin bookings.');
        } finally {
            setLoading(false);
        }
    }, [authHeader, date, spaceSlug]);

    const loadBookingsForMonth = useCallback(async () => {
        setCalendarLoading(true);
        setCalendarError('');
        try {
            const start = `${calendarKey}-01`;
            const endDateObj = new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth() + 1, 0);
            const end = formatInputDate(endDateObj);
            const qs = new URLSearchParams({
                from: start,
                to: end
            });
            if (spaceSlug) qs.set('space_slug', spaceSlug);
            const bookingsRes = await fetch(`/api/admin/room-bookings?${qs.toString()}`, {
                headers: await authHeader()
            });
            const bookingsJson = await bookingsRes.json();
            if (!bookingsRes.ok) throw new Error(bookingsJson?.error || 'Failed to load calendar bookings.');
            setCalendarBookings(Array.isArray(bookingsJson?.bookings) ? bookingsJson.bookings : []);
        } catch (err) {
            setCalendarError(err?.message || 'Failed to load calendar bookings.');
        } finally {
            setCalendarLoading(false);
        }
    }, [authHeader, calendarKey, calendarMonthDate, spaceSlug]);

    useEffect(() => {
        loadSpaces();
    }, [loadSpaces]);

    useEffect(() => {
        loadBookingsForDay();
    }, [loadBookingsForDay]);

    useEffect(() => {
        loadBookingsForMonth();
    }, [loadBookingsForMonth]);

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
            await Promise.all([loadBookingsForDay(), loadBookingsForMonth()]);
        } catch (err) {
            setError(err?.message || 'Failed to create booking.');
        } finally {
            setBusy(false);
        }
    };

    const spaceBySlug = useMemo(() => Object.fromEntries(spaces.map(s => [s.slug, s])), [spaces]);
    const spaceColors = useMemo(
        () => Object.fromEntries(spaces.map((space, index) => [space.slug, PIN_PALETTE[index % PIN_PALETTE.length]])),
        [spaces]
    );

    const bookingPinsByDate = useMemo(() => {
        const map = {};
        for (const booking of calendarBookings) {
            const day = booking?.booking_date;
            if (!day) continue;
            if (!map[day]) map[day] = new Set();
            if (booking?.space_slug) map[day].add(booking.space_slug);
        }
        return Object.fromEntries(Object.entries(map).map(([day, set]) => [day, Array.from(set)]));
    }, [calendarBookings]);

    const legendSpaces = useMemo(() => {
        if (spaceSlug) return spaces.filter(space => space.slug === spaceSlug);
        return spaces;
    }, [spaceSlug, spaces]);

    const shiftMonth = useCallback(
        delta => {
            const current = parseInputDate(date);
            const target = new Date(current.getFullYear(), current.getMonth() + delta, 1);
            const daysInTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
            target.setDate(Math.min(current.getDate(), daysInTarget));
            setDate(formatInputDate(target));
        },
        [date]
    );

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
                    <div className="platform-calendar-filters">
                        <div>
                            <h2 style={{ marginTop: 0 }}>Filters</h2>
                            <label className="platform-subtitle">Space</label>
                            <select value={spaceSlug} onChange={e => setSpaceSlug(e.target.value)} disabled={spacesLoading}>
                                <option value="">All spaces</option>
                                {spaces.map(s => (
                                    <option key={s.slug} value={s.slug}>
                                        {s.title}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button className="platform-calendar-btn" type="button" onClick={() => setDate(todayKey)}>
                            Today
                        </button>
                    </div>

                    <div className="platform-calendar" aria-label="Bookings calendar">
                        <div className="platform-calendar-header">
                            <button className="platform-calendar-btn" type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month">
                                Prev
                            </button>
                            <div className="platform-calendar-month">{calendarLabel}</div>
                            <button className="platform-calendar-btn" type="button" onClick={() => shiftMonth(1)} aria-label="Next month">
                                Next
                            </button>
                        </div>
                        <div className="platform-calendar-weekdays">
                            {WEEKDAYS.map(day => (
                                <span key={day}>{day}</span>
                            ))}
                        </div>
                        {calendarLoading ? (
                            <p className="platform-subtitle" style={{ marginTop: '0.75rem' }}>
                                Loading calendar...
                            </p>
                        ) : (
                            <div className="platform-calendar-grid" role="grid">
                                {calendarDays.map(cell => {
                                    const cellKey = formatInputDate(cell.date);
                                    const pins = bookingPinsByDate[cellKey] || [];
                                    const isSelected = cellKey === date;
                                    const isToday = cellKey === todayKey;
                                    const label = `${cellKey}${pins.length ? `, ${pins.length} space${pins.length === 1 ? '' : 's'} booked` : ''}`;
                                    return (
                                        <button
                                            key={cellKey}
                                            type="button"
                                            className={`platform-calendar-cell${cell.inMonth ? '' : ' is-outside'}${isSelected ? ' is-selected' : ''}${
                                                isToday ? ' is-today' : ''
                                            }`}
                                            onClick={() => setDate(cellKey)}
                                            aria-pressed={isSelected}
                                            aria-label={label}
                                        >
                                            <span className="platform-calendar-day">{cell.date.getDate()}</span>
                                            {pins.length ? (
                                                <span className="platform-calendar-pins">
                                                    {pins.map(slug => (
                                                        <span
                                                            key={slug}
                                                            className="platform-calendar-pin"
                                                            style={{ backgroundColor: spaceColors[slug] || '#ffffff' }}
                                                            title={spaceBySlug[slug]?.title || slug}
                                                        />
                                                    ))}
                                                </span>
                                            ) : null}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <label className="platform-subtitle" style={{ marginTop: '0.75rem', display: 'block' }}>
                        Jump to date
                    </label>
                    <input className="platform-date-input" type="date" value={date} onChange={e => setDate(e.target.value)} disabled={loading} />

                    {calendarError ? (
                        <p className="platform-subtitle" style={{ marginTop: '0.5rem' }}>
                            {calendarError}
                        </p>
                    ) : null}

                    {legendSpaces.length ? (
                        <div className="platform-calendar-legend" aria-label="Space legend">
                            {legendSpaces.map(space => (
                                <span key={space.slug} className="platform-calendar-legend-item">
                                    <span className="platform-calendar-pin" style={{ backgroundColor: spaceColors[space.slug] || '#ffffff' }} />
                                    {space.title}
                                </span>
                            ))}
                        </div>
                    ) : null}
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
