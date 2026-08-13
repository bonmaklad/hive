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

function bookingStatusBadge(status) {
    if (status === 'approved' || status === 'confirmed') return 'success';
    if (status === 'cancelled' || status === 'expired') return 'error';
    return 'pending';
}

function bookingCanChange(booking) {
    return !['cancelled', 'expired', 'rejected'].includes(booking?.status);
}

function bookingCanCancel(booking) {
    return bookingCanChange(booking) || booking?.payment?.status === 'paid';
}

function bookingPaymentSummary(booking) {
    const parts = [];
    const tokens = Math.max(0, Number(booking?.tokens_used || 0));
    const paymentAmount = Math.max(0, Number(booking?.payment?.amount_cents || 0));
    if (tokens) parts.push(`${tokens} token${tokens === 1 ? '' : 's'}`);
    if (paymentAmount) parts.push(`Stripe ${formatNZD(paymentAmount)}`);
    if (!parts.length && booking?.payment?.status === 'requires_payment') return 'Stripe pending';
    const summary = parts.length ? parts.join(' + ') : 'No charge';
    if (booking?.payment?.status === 'refunded') return `${summary} (refunded)`;
    if (booking?.payment?.status === 'refund_pending') return `${summary} (refund pending)`;
    return summary;
}

function bookingRefundDescription(booking) {
    const paymentSummary = bookingPaymentSummary(booking);
    if (booking?.payment?.status === 'requires_payment') {
        return 'The open Stripe checkout will be cancelled. No settled Stripe payment has been recorded.';
    }
    if (paymentSummary === 'No charge') {
        return 'No payment was recorded, so no refund will be issued.';
    }
    return `${paymentSummary} will be returned to the customer.`;
}

function EditIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" />
            <path d="m13.5 6.5 4 4" />
        </svg>
    );
}

function RefundIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M4 9V4m0 0h5M4 4l4 4" />
            <path d="M5.7 15.5A8 8 0 1 0 6.4 7" />
            <path d="M12 8v8m2-6.2c-.5-.5-1.2-.8-2-.8-1.1 0-2 .7-2 1.6 0 2.4 4 1.1 4 3.6 0 1-.9 1.8-2 1.8-.9 0-1.7-.3-2.3-.9" />
        </svg>
    );
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
    const [notice, setNotice] = useState('');
    const [loading, setLoading] = useState(true);
    const [calendarLoading, setCalendarLoading] = useState(true);
    const [spacesLoading, setSpacesLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [spaceSlug, setSpaceSlug] = useState('');
    const [createSpaceSlug, setCreateSpaceSlug] = useState('');
    const [date, setDate] = useState(() => formatDateInput(''));

    const [ownerEmail, setOwnerEmail] = useState('');
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('10:00');
    const [status, setStatus] = useState('approved');
    const [editForm, setEditForm] = useState(null);
    const [cancelBookingTarget, setCancelBookingTarget] = useState(null);
    const [actionBusyId, setActionBusyId] = useState('');

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
            const loadedSpaces = Array.isArray(spacesJson?.spaces) ? spacesJson.spaces : [];
            setSpaces(loadedSpaces);
            setCreateSpaceSlug(current => (loadedSpaces.some(space => space.slug === current) ? current : loadedSpaces[0]?.slug || ''));
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
        setNotice('');
        try {
            const res = await fetch('/api/admin/room-bookings', {
                method: 'POST',
                headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    owner_email: ownerEmail,
                    space_slug: createSpaceSlug,
                    booking_date: date,
                    start_time: startTime,
                    end_time: endTime,
                    status
                })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || 'Failed to create booking.');
            setOwnerEmail('');
            setNotice('Booking created.');
            await Promise.all([loadBookingsForDay(), loadBookingsForMonth()]);
        } catch (err) {
            setError(err?.message || 'Failed to create booking.');
        } finally {
            setBusy(false);
        }
    };

    const beginEdit = booking => {
        setError('');
        setNotice('');
        setEditForm({
            id: booking.id,
            source: booking.source,
            space_slug: booking.space_slug,
            booking_date: booking.booking_date,
            start_time: String(booking.start_time).slice(0, 5),
            end_time: String(booking.end_time).slice(0, 5),
            payment_summary: bookingPaymentSummary(booking)
        });
    };

    const saveBooking = async event => {
        event.preventDefault();
        if (!editForm) return;
        setActionBusyId(editForm.id);
        setError('');
        setNotice('');
        try {
            const res = await fetch(`/api/admin/room-bookings/${encodeURIComponent(editForm.id)}?source=${encodeURIComponent(editForm.source)}`, {
                method: 'PATCH',
                headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    space_slug: editForm.space_slug,
                    booking_date: editForm.booking_date,
                    start_time: editForm.start_time,
                    end_time: editForm.end_time
                })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || 'Failed to edit booking.');
            setDate(editForm.booking_date);
            setEditForm(null);
            setNotice('Booking updated. Its original payment and token charge were kept unchanged.');
            await Promise.all([loadBookingsForDay(), loadBookingsForMonth()]);
        } catch (err) {
            setError(err?.message || 'Failed to edit booking.');
        } finally {
            setActionBusyId('');
        }
    };

    const requestBookingCancellation = booking => {
        setError('');
        setNotice('');
        setCancelBookingTarget(booking);
    };

    const cancelBooking = async booking => {
        setActionBusyId(booking.id);
        setError('');
        setNotice('');
        try {
            const res = await fetch(`/api/admin/room-bookings/${encodeURIComponent(booking.id)}?source=${encodeURIComponent(booking.source)}`, {
                method: 'DELETE',
                headers: await authHeader()
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || 'Failed to cancel booking.');

            const refundParts = [];
            const refundedTokens = Math.max(0, Number(json?.refund?.tokens || 0));
            const stripeRefund = json?.refund?.stripe;
            if (refundedTokens) refundParts.push(`${refundedTokens} token${refundedTokens === 1 ? '' : 's'} returned`);
            if (stripeRefund?.method === 'stripe' && stripeRefund?.amount_cents > 0) {
                refundParts.push(
                    stripeRefund.status === 'refund_pending'
                        ? `${formatNZD(stripeRefund.amount_cents)} Stripe refund pending`
                        : `${formatNZD(stripeRefund.amount_cents)} refunded through Stripe`
                );
            }
            setNotice(refundParts.length ? `Booking cancelled: ${refundParts.join(' and ')}.` : 'Booking cancelled. No paid amount was recorded.');
            if (editForm?.id === booking.id) setEditForm(null);
            setCancelBookingTarget(null);
            await Promise.all([loadBookingsForDay(), loadBookingsForMonth()]);
        } catch (err) {
            setError(err?.message || 'Failed to cancel booking.');
        } finally {
            setActionBusyId('');
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
                    <p className="platform-subtitle">View member and public website bookings, or create a booking on behalf of a member.</p>
                </div>
                <Link className="btn ghost" href="/platform/admin">
                    Back to admin
                </Link>
            </div>

            {error && <p className="platform-message error">{error}</p>}
            {notice && <p className="platform-message success">{notice}</p>}

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
                            Room
                            <select value={createSpaceSlug} onChange={e => setCreateSpaceSlug(e.target.value)} disabled={busy || spacesLoading}>
                                {spaces.length ? null : <option value="">No rooms available</option>}
                                {spaces.map(space => (
                                    <option key={space.slug} value={space.slug}>
                                        {space.title}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Member email
                            <input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} disabled={busy} required />
                        </label>
                        <label>
                            Date
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} disabled={busy} required />
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
                            <button className="btn primary" type="submit" disabled={busy || !ownerEmail.trim() || !createSpaceSlug}>
                                {busy ? 'Working…' : 'Create booking'}
                            </button>
                        </div>
                    </form>
                    {createSpaceSlug && spaceBySlug[createSpaceSlug] ? (
                        <p className="platform-subtitle" style={{ marginTop: '0.75rem' }}>
                            Tokens/hr: {spaceBySlug[createSpaceSlug].tokens_per_hour} • Half day:{' '}
                            {spaceBySlug[createSpaceSlug].pricing_half_day_cents
                                ? formatNZD(spaceBySlug[createSpaceSlug].pricing_half_day_cents)
                                : '—'}{' '}
                            • Full day:{' '}
                            {spaceBySlug[createSpaceSlug].pricing_full_day_cents
                                ? formatNZD(spaceBySlug[createSpaceSlug].pricing_full_day_cents)
                                : '—'}
                        </p>
                    ) : null}
                </section>
            </div>

            {editForm ? (
                <div className="platform-modal-overlay" role="presentation">
                    <section className="platform-modal admin-booking-modal" role="dialog" aria-modal="true" aria-labelledby="edit-booking-title">
                        <div className="platform-modal-header">
                            <div>
                                <h2 id="edit-booking-title" style={{ marginTop: 0 }}>
                                    Edit booking
                                </h2>
                                <p className="platform-subtitle">
                                    Change the room, date, or time. The existing charge ({editForm.payment_summary}) stays unchanged.
                                </p>
                            </div>
                            <button className="btn ghost" type="button" onClick={() => setEditForm(null)} disabled={actionBusyId === editForm.id}>
                                Close
                            </button>
                        </div>
                        {error ? <p className="platform-message error">{error}</p> : null}
                        <form className="contact-form admin-booking-edit-form" onSubmit={saveBooking}>
                            <label>
                                Room
                                <select
                                    value={editForm.space_slug}
                                    onChange={e => setEditForm(current => ({ ...current, space_slug: e.target.value }))}
                                    disabled={actionBusyId === editForm.id}
                                >
                                    {spaces.map(space => (
                                        <option key={space.slug} value={space.slug}>
                                            {space.title}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                Date
                                <input
                                    type="date"
                                    value={editForm.booking_date}
                                    onChange={e => setEditForm(current => ({ ...current, booking_date: e.target.value }))}
                                    disabled={actionBusyId === editForm.id}
                                    required
                                />
                            </label>
                            <label>
                                Start
                                <input
                                    type="time"
                                    value={editForm.start_time}
                                    onChange={e => setEditForm(current => ({ ...current, start_time: e.target.value }))}
                                    disabled={actionBusyId === editForm.id}
                                    required
                                />
                            </label>
                            <label>
                                End
                                <input
                                    type="time"
                                    value={editForm.end_time}
                                    onChange={e => setEditForm(current => ({ ...current, end_time: e.target.value }))}
                                    disabled={actionBusyId === editForm.id}
                                    required
                                />
                            </label>
                            <div className="platform-actions admin-booking-edit-actions">
                                <button className="btn primary" type="submit" disabled={actionBusyId === editForm.id}>
                                    {actionBusyId === editForm.id ? 'Saving…' : 'Save changes'}
                                </button>
                                <button className="btn ghost" type="button" onClick={() => setEditForm(null)} disabled={actionBusyId === editForm.id}>
                                    Cancel edit
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            ) : null}

            {cancelBookingTarget ? (
                <div className="platform-modal-overlay" role="presentation">
                    <section
                        className="platform-modal admin-booking-modal admin-booking-cancel-modal"
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="cancel-booking-title"
                        aria-describedby="cancel-booking-description"
                    >
                        <div className="platform-modal-header">
                            <div>
                                <p className="admin-booking-danger-eyebrow">Permanent action</p>
                                <h2 id="cancel-booking-title" style={{ marginTop: 0 }}>
                                    Cancel and refund booking?
                                </h2>
                            </div>
                        </div>

                        <div className="admin-booking-cancel-summary">
                            <strong>{spaceBySlug[cancelBookingTarget.space_slug]?.title || cancelBookingTarget.space_slug}</strong>
                            <span>
                                {cancelBookingTarget.booking_date} · {String(cancelBookingTarget.start_time).slice(0, 5)}–
                                {String(cancelBookingTarget.end_time).slice(0, 5)}
                            </span>
                            <span>{cancelBookingTarget.customer?.email || cancelBookingTarget.owner?.email || cancelBookingTarget.owner_id || 'Customer'}</span>
                        </div>

                        <div id="cancel-booking-description" className="admin-booking-danger-message">
                            <strong>Are you sure? This cannot be undone.</strong>
                            <span>{bookingRefundDescription(cancelBookingTarget)}</span>
                        </div>

                        {error ? <p className="platform-message error">{error}</p> : null}

                        <div className="platform-actions admin-booking-cancel-actions">
                            <button
                                className="btn ghost"
                                type="button"
                                onClick={() => setCancelBookingTarget(null)}
                                disabled={actionBusyId === cancelBookingTarget.id}
                                autoFocus
                            >
                                Keep booking
                            </button>
                            <button
                                className="btn danger"
                                type="button"
                                onClick={() => cancelBooking(cancelBookingTarget)}
                                disabled={actionBusyId === cancelBookingTarget.id}
                            >
                                {actionBusyId === cancelBookingTarget.id ? 'Cancelling and refunding…' : 'Yes, cancel and refund'}
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}

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
                                    <th>Customer</th>
                                    <th>Source</th>
                                    <th>Payment</th>
                                    <th>Status</th>
                                    <th>Actions</th>
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
                                            <td>
                                                <div>{b.customer?.name || b.owner?.name || '—'}</div>
                                                <div className="platform-mono">{b.customer?.email || b.owner?.email || b.owner_id || '—'}</div>
                                            </td>
                                            <td>
                                                <span className={`badge ${b.source === 'public' ? 'pending' : 'neutral'}`}>
                                                    {b.source === 'public' ? 'website' : 'member'}
                                                </span>
                                            </td>
                                            <td>{bookingPaymentSummary(b)}</td>
                                            <td>
                                                <span className={`badge ${bookingStatusBadge(b.status)}`}>{b.status}</span>
                                            </td>
                                            <td>
                                                {bookingCanChange(b) || bookingCanCancel(b) ? (
                                                    <div className="admin-booking-row-actions">
                                                        {bookingCanChange(b) ? (
                                                            <button
                                                                className="admin-booking-icon-button"
                                                                type="button"
                                                                onClick={() => beginEdit(b)}
                                                                disabled={Boolean(actionBusyId)}
                                                                aria-label="Edit booking"
                                                                title="Edit booking"
                                                            >
                                                                <EditIcon />
                                                            </button>
                                                        ) : null}
                                                        {bookingCanCancel(b) ? (
                                                            <button
                                                                className="admin-booking-icon-button is-danger"
                                                                type="button"
                                                                onClick={() => requestBookingCancellation(b)}
                                                                disabled={Boolean(actionBusyId)}
                                                                aria-label={b.status === 'cancelled' ? 'Retry booking refund' : 'Cancel booking and issue refund'}
                                                                title={b.status === 'cancelled' ? 'Retry refund' : 'Cancel and refund'}
                                                            >
                                                                <RefundIcon />
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                ) : (
                                                    <span className="platform-subtitle">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={8} className="platform-subtitle">
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
