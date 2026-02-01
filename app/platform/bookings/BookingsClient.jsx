'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

function todayDateString() {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
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

export default function BookingsClient() {
    const { user, supabase } = usePlatformSession();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [bookings, setBookings] = useState([]);
    const [tokensLeft, setTokensLeft] = useState(0);
    const [tokensLoading, setTokensLoading] = useState(true);
    const [showPast, setShowPast] = useState(false);
    const [spaces, setSpaces] = useState([]);
    const [selectedDate, setSelectedDate] = useState('');
    const [calendarAnchor, setCalendarAnchor] = useState(() => todayDateString());
    const [calendarBookings, setCalendarBookings] = useState([]);
    const [calendarLoading, setCalendarLoading] = useState(true);
    const [calendarError, setCalendarError] = useState('');

    const today = useMemo(() => todayDateString(), []);
    const isDateFiltered = Boolean(selectedDate);
    const calendarKey = calendarAnchor?.slice(0, 7) || today.slice(0, 7);
    const calendarMonthDate = useMemo(() => parseInputDate(`${calendarKey}-01`), [calendarKey]);
    const calendarDays = useMemo(() => getMonthGrid(calendarMonthDate), [calendarMonthDate]);
    const calendarLabel = useMemo(() => MONTH_FORMAT.format(calendarMonthDate), [calendarMonthDate]);

    const spaceBySlug = useMemo(() => Object.fromEntries(spaces.map(s => [s.slug, s])), [spaces]);
    const spaceColors = useMemo(
        () => Object.fromEntries(spaces.map((space, index) => [space.slug, PIN_PALETTE[index % PIN_PALETTE.length]])),
        [spaces]
    );

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setError('');
            try {
                const { data } = await supabase.auth.getSession();
                const accessToken = data?.session?.access_token || '';

                const tokensPromise = accessToken
                    ? fetch('/api/rooms/tokens', { headers: { Authorization: `Bearer ${accessToken}` } })
                        .then(async res => {
                            const json = await res.json().catch(() => ({}));
                            if (!res.ok) throw new Error(json?.error || 'Failed to load tokens.');
                            return Math.max(0, Number(json?.tokens_left || 0));
                        })
                    : Promise.resolve(0);

                setTokensLoading(true);
                const [tokensLeftResult, spacesRes] = await Promise.all([tokensPromise, supabase.from('spaces').select('slug, title')]);

                if (cancelled) return;

                if (spacesRes.error) throw spacesRes.error;

                setTokensLeft(Math.max(0, Number(tokensLeftResult || 0)));
                setSpaces(Array.isArray(spacesRes.data) ? spacesRes.data : []);
            } catch (e) {
                setError(e?.message || 'Failed to load booking data.');
            } finally {
                if (!cancelled) {
                    setTokensLoading(false);
                }
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [supabase]);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError('');
            try {
                const bookingsQuery = supabase
                    .from('room_bookings')
                    .select('id, booking_date, start_time, end_time, space_slug, status, tokens_used, price_cents, currency, created_at')
                    .eq('owner_id', user.id)
                    .order('booking_date', { ascending: true })
                    .order('start_time', { ascending: true })
                    .limit(200);

                if (selectedDate) {
                    bookingsQuery.eq('booking_date', selectedDate);
                } else if (!showPast) {
                    bookingsQuery.gte('booking_date', today);
                }

                const { data: bookingsData, error: bookingsError } = await bookingsQuery;
                if (bookingsError) throw bookingsError;

                if (cancelled) return;
                setBookings(Array.isArray(bookingsData) ? bookingsData : []);
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
    }, [selectedDate, showPast, supabase, today, user.id]);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setCalendarLoading(true);
            setCalendarError('');
            try {
                const start = `${calendarKey}-01`;
                const endDateObj = new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth() + 1, 0);
                const end = formatInputDate(endDateObj);

                const calendarQuery = supabase
                    .from('room_bookings')
                    .select('id, booking_date, space_slug, status')
                    .eq('owner_id', user.id)
                    .gte('booking_date', start)
                    .lte('booking_date', end)
                    .limit(300);

                const { data: calendarData, error: calendarLoadError } = await calendarQuery;
                if (calendarLoadError) throw calendarLoadError;

                if (cancelled) return;
                setCalendarBookings(Array.isArray(calendarData) ? calendarData : []);
            } catch (e) {
                setCalendarError(e?.message || 'Failed to load calendar bookings.');
                setCalendarBookings([]);
            } finally {
                if (!cancelled) setCalendarLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [calendarKey, calendarMonthDate, supabase, user.id]);

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
        const activeSlugs = new Set(calendarBookings.map(b => b.space_slug).filter(Boolean));
        return spaces.filter(space => activeSlugs.has(space.slug));
    }, [calendarBookings, spaces]);

    const shiftMonth = useCallback(
        delta => {
            const current = parseInputDate(calendarAnchor);
            const target = new Date(current.getFullYear(), current.getMonth() + delta, 1);
            const daysInTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
            target.setDate(Math.min(current.getDate(), daysInTarget));
            setCalendarAnchor(formatInputDate(target));
        },
        [calendarAnchor]
    );

    const handleSelectDate = useCallback(
        dateValue => {
            if (dateValue) {
                setSelectedDate(dateValue);
                setCalendarAnchor(dateValue);
            } else {
                setSelectedDate('');
                setCalendarAnchor(today);
            }
        },
        [today]
    );

    const bookingsWithTitles = useMemo(
        () => bookings.map(b => ({ ...b, space_title: spaceBySlug[b.space_slug]?.title || b.space_slug })),
        [bookings, spaceBySlug]
    );

    return (
        <section className="platform-card" aria-label="Your bookings">
            <div className="platform-kpi-row">
                <div>
                    <h2 style={{ margin: 0 }}>Your bookings</h2>
                    <p className="platform-subtitle" style={{ marginTop: '0.25rem' }}>
                        {isDateFiltered ? `Showing bookings for ${formatDate(selectedDate)}.` : showPast ? 'Showing all bookings.' : 'Showing upcoming bookings.'}
                    </p>
                </div>
                <span className="badge neutral">{tokensLoading ? '…' : `${tokensLeft} tokens left`}</span>
            </div>

            <div className="platform-actions" style={{ marginTop: '0.75rem' }}>
                <Link className="btn primary" href="/platform/rooms">
                    Book now
                </Link>
                <button className="btn ghost" type="button" onClick={() => setShowPast(v => !v)} disabled={loading}>
                    {showPast ? 'Hide past' : 'Show past'}
                </button>
                {isDateFiltered ? (
                    <button className="btn ghost" type="button" onClick={() => handleSelectDate('')} disabled={loading}>
                        Clear date
                    </button>
                ) : null}
            </div>

            {error ? <p className="platform-message error">{error}</p> : null}

            <div className="platform-calendar" aria-label="Your bookings calendar" style={{ marginTop: '1rem' }}>
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
                            const isSelected = cellKey === selectedDate;
                            const isToday = cellKey === today;
                            const label = `${cellKey}${pins.length ? `, ${pins.length} space${pins.length === 1 ? '' : 's'} booked` : ''}`;
                            return (
                                <button
                                    key={cellKey}
                                    type="button"
                                    className={`platform-calendar-cell${cell.inMonth ? '' : ' is-outside'}${isSelected ? ' is-selected' : ''}${
                                        isToday ? ' is-today' : ''
                                    }`}
                                    onClick={() => handleSelectDate(cellKey)}
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

            <div className="platform-calendar-filters" style={{ marginTop: '0.75rem' }}>
                <button className="platform-calendar-btn" type="button" onClick={() => handleSelectDate(today)}>
                    Today
                </button>
                <label className="platform-subtitle" style={{ display: 'block' }}>
                    Jump to date
                    <input
                        className="platform-date-input"
                        type="date"
                        value={selectedDate || ''}
                        onChange={e => handleSelectDate(e.target.value)}
                        disabled={loading}
                        style={{ marginTop: '0.35rem' }}
                    />
                </label>
            </div>

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
                            {bookingsWithTitles.length ? (
                                bookingsWithTitles.map(b => (
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
