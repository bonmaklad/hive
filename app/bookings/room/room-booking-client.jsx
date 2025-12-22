'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';

const TIME_SLOTS_MEETING = [
    '09:00',
    '10:00',
    '11:00',
    '12:00',
    '13:00',
    '14:00',
    '15:00',
    '16:00'
];

function formatNZDFromCents(cents) {
    const value = (Number(cents || 0) / 100);
    try {
        return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(value);
    } catch {
        return `$${value.toFixed(2)}`;
    }
}

function formatDateInput(value) {
    if (typeof value === 'string' && value.length) return value;
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function yyyyMmDdFromDate(date) {
    const d = date instanceof Date ? date : new Date();
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function tomorrowLocalDateString() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return yyyyMmDdFromDate(d);
}

function nextWeekdayOnOrAfter(dateString) {
    const d = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateString;
    while (true) {
        const day = d.getDay(); // local weekday
        if (day >= 1 && day <= 5) return yyyyMmDdFromDate(d);
        d.setDate(d.getDate() + 1);
    }
}

function addDaysLocal(dateString, days) {
    const d = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateString;
    d.setDate(d.getDate() + Number(days || 0));
    return yyyyMmDdFromDate(d);
}

function formatDateChip(dateString) {
    const d = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateString;
    const weekday = d.toLocaleDateString('en-NZ', { weekday: 'short' });
    const day = d.toLocaleDateString('en-NZ', { day: '2-digit', month: 'short' });
    return `${weekday} ${day}`;
}

function parseTimeToMinutes(value) {
    const [hh, mm] = String(value || '0:0').split(':').map(v => Number(v));
    return (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
}

function minutesToTime(minutes) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
}

function computeSelectionRange({ timeSlots, startIndex, endIndex }) {
    if (startIndex == null) return null;
    const a = startIndex;
    const b = endIndex == null ? startIndex : endIndex;
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    const start = timeSlots[min];
    const end = minutesToTime(parseTimeToMinutes(timeSlots[max]) + 60);
    return { start_time: start, end_time: end, hours: (max - min + 1) };
}

function formatRangeLabel({ timeSlots, startIndex, endIndex }) {
    const r = computeSelectionRange({ timeSlots, startIndex, endIndex });
    if (!r) return '—';
    return `${r.start_time}–${r.end_time} (${r.hours} hour${r.hours === 1 ? '' : 's'})`;
}

function isWeekday(dateString) {
    const d = new Date(`${dateString}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return false;
    const day = d.getUTCDay();
    return day >= 1 && day <= 5;
}

async function readJsonResponse(response) {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return { _raw: text };
    }
}

function errorFromResponse(response, payload) {
    if (payload?.error) return new Error(payload.error);
    if (payload?.message) return new Error(payload.message);
    if (typeof payload?._raw === 'string' && payload._raw.trim()) {
        return new Error(`Request failed (${response.status}). ${payload._raw.slice(0, 200)}`);
    }
    return new Error(`Request failed (${response.status}).`);
}

function Modal({ open, title, onClose, children }) {
    useEffect(() => {
        if (!open) return;
        const onKeyDown = event => {
            if (event.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose, open]);

    if (!open) return null;

    return (
        <div className="platform-modal-overlay" role="presentation" onMouseDown={onClose}>
            <div className="platform-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}>
                <div className="platform-modal-header">
                    <h2 style={{ margin: 0 }}>{title}</h2>
                    <button className="btn ghost" type="button" onClick={onClose}>
                        Close
                    </button>
                </div>
                <div style={{ marginTop: '1rem' }}>{children}</div>
            </div>
        </div>
    );
}

export default function RoomBookingClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const minDate = useMemo(() => tomorrowLocalDateString(), []);
    const [rooms, setRooms] = useState([]);
    const [loadingRooms, setLoadingRooms] = useState(true);
    const [roomSlug, setRoomSlug] = useState('');
    const [date, setDate] = useState(() => minDate);
    const [startIndex, setStartIndex] = useState(null);
    const [endIndex, setEndIndex] = useState(null);
    const [slotStatus, setSlotStatus] = useState(() => new Map());
    const [bookedRanges, setBookedRanges] = useState([]);

    const [customerName, setCustomerName] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');

    const [couponCode, setCouponCode] = useState('');
    const [quote, setQuote] = useState(null);
    const [quoteBusy, setQuoteBusy] = useState(false);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [checkoutClientSecret, setCheckoutClientSecret] = useState('');
    const [checkoutError, setCheckoutError] = useState('');
    const [returnStatus, setReturnStatus] = useState(null);

    const room = useMemo(() => rooms.find(r => r.slug === roomSlug) || rooms[0] || null, [roomSlug, rooms]);
    const isLounge = room?.slug === 'hive-lounge';
    const timeSlots = useMemo(() => (isLounge ? ['17:00', '18:00', '19:00', '20:00', '21:00'] : TIME_SLOTS_MEETING), [isLounge]);
    const withinBookingDays = useMemo(() => (isLounge ? true : isWeekday(date)), [date, isLounge]);
    const dateChips = useMemo(() => {
        const chips = [];
        let cursor = minDate;
        for (let i = 0; i < 10; i += 1) {
            const d = isLounge ? cursor : nextWeekdayOnOrAfter(cursor);
            if (!chips.includes(d)) chips.push(d);
            cursor = addDaysLocal(cursor, 1);
            if (chips.length >= 7) break;
        }
        return chips;
    }, [isLounge, minDate]);

    const selection = useMemo(() => {
        if (!room) return null;
        if (isLounge) return { start_time: '17:00', end_time: '22:00', hours: 5 };
        return computeSelectionRange({ timeSlots, startIndex, endIndex });
    }, [endIndex, isLounge, room, startIndex, timeSlots]);

    const stripePromise = useMemo(() => {
        const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
        if (!key) return null;
        return loadStripe(key);
    }, []);

    const refreshAvailability = useCallback(async () => {
        if (!roomSlug || !date) return;
        setError('');
        try {
            const res = await fetch(`/api/bookings/room/availability?space_slug=${encodeURIComponent(roomSlug)}&date=${encodeURIComponent(date)}`);
            const json = await readJsonResponse(res);
            if (!res.ok) throw errorFromResponse(res, json);
            const bookings = Array.isArray(json?.bookings) ? json.bookings : [];

            const map = new Map();
            for (const slot of timeSlots) map.set(slot, 'open');

            const ranges = [];
            for (const b of bookings) {
                const startRaw = String(b.start_time || '').slice(0, 5);
                const endRaw = String(b.end_time || '').slice(0, 5);
                const startMin = parseTimeToMinutes(startRaw);
                const endMin = parseTimeToMinutes(endRaw);
                if (startRaw && endRaw) ranges.push({ start_time: startRaw, end_time: endRaw });
                for (const slot of timeSlots) {
                    const slotStart = parseTimeToMinutes(slot);
                    const slotEnd = slotStart + 60;
                    if (slotStart < endMin && slotEnd > startMin) {
                        map.set(slot, 'busy');
                    }
                }
            }

            setSlotStatus(map);
            setBookedRanges(ranges);
        } catch (err) {
            setError(err?.message || 'Failed to load availability.');
            setSlotStatus(new Map());
            setBookedRanges([]);
        }
    }, [date, roomSlug, timeSlots]);

    const refreshQuote = useCallback(async () => {
        if (!roomSlug || !date || !selection) return;
        setQuoteBusy(true);
        try {
            const res = await fetch('/api/bookings/room/quote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    space_slug: roomSlug,
                    booking_date: date,
                    start_time: selection.start_time,
                    end_time: selection.end_time,
                    coupon_code: couponCode
                })
            });
            const json = await readJsonResponse(res);
            if (!res.ok) throw errorFromResponse(res, json);
            setQuote(json);
        } catch (err) {
            setQuote(null);
            setError(err?.message || 'Failed to quote booking.');
        } finally {
            setQuoteBusy(false);
        }
    }, [couponCode, date, roomSlug, selection]);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoadingRooms(true);
            try {
                const res = await fetch('/api/bookings/room/spaces');
                const json = await readJsonResponse(res);
                if (!res.ok) throw errorFromResponse(res, json);
                const list = Array.isArray(json?.spaces) ? json.spaces : [];
                if (!cancelled) {
                    setRooms(list);
                    const requestedRoom = (searchParams?.get('room') || '').trim();
                    const initial = requestedRoom && list.some(s => s.slug === requestedRoom) ? requestedRoom : (list?.[0]?.slug || '');
                    setRoomSlug(initial);
                }
            } catch (err) {
                if (!cancelled) setError(err?.message || 'Failed to load rooms.');
            } finally {
                if (!cancelled) setLoadingRooms(false);
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, [searchParams]);

    useEffect(() => {
        if (!roomSlug) return;
        // Enforce next-day minimum and (for meeting rooms) weekdays only.
        setDate(current => {
            const base = current && current >= minDate ? current : minDate;
            if (roomSlug === 'hive-lounge') return base;
            return nextWeekdayOnOrAfter(base);
        });
    }, [minDate, roomSlug]);

    useEffect(() => {
        if (!roomSlug) return;
        refreshAvailability();
    }, [refreshAvailability, roomSlug]);

    useEffect(() => {
        if (!roomSlug || !selection) return;
        refreshQuote();
    }, [refreshQuote, roomSlug, selection]);

    useEffect(() => {
        const stripeState = (searchParams?.get('stripe') || '').trim();
        const bookingId = (searchParams?.get('booking') || '').trim();
        const sessionId = (searchParams?.get('session_id') || '').trim();
        if (!stripeState || !bookingId) {
            setReturnStatus(null);
            return;
        }

        let cancelled = false;
        async function loadStatus() {
            try {
                const qs = new URLSearchParams({ booking: bookingId });
                if (sessionId) qs.set('session_id', sessionId);
                const res = await fetch(`/api/bookings/room/status?${qs.toString()}`);
                const json = await readJsonResponse(res);
                if (!res.ok) throw errorFromResponse(res, json);

                if (cancelled) return;

                const status = json?.booking?.status || null;
                if (stripeState === 'cancel') {
                    setReturnStatus({ kind: 'cancelled', booking: json?.booking || null });
                    return;
                }

                if (status === 'confirmed') {
                    setReturnStatus({ kind: 'success', booking: json?.booking || null });
                    setInfo('Booking confirmed. Check your email for the confirmation and invoice.');
                    setError('');
                    refreshAvailability();
                    setStartIndex(null);
                    setEndIndex(null);
                    return;
                }

                // If we have a return from Stripe but the booking isn't confirmed yet, webhook may still be pending.
                setReturnStatus({ kind: 'pending', booking: json?.booking || null });
            } catch (err) {
                if (!cancelled) {
                    setReturnStatus({ kind: 'error', message: err?.message || 'Could not confirm booking status.' });
                }
            }
        }

        loadStatus();
        return () => {
            cancelled = true;
        };
    }, [refreshAvailability, searchParams]);

    const onSlotClick = useCallback(
        index => {
            setError('');
            setInfo('');
            if (!withinBookingDays) return;
            if (isLounge) return;
            const time = timeSlots[index];
            if ((slotStatus.get(time) || 'open') !== 'open') return;
            if (startIndex == null) {
                setStartIndex(index);
                setEndIndex(null);
                return;
            }
            if (endIndex == null) {
                setEndIndex(index);
                return;
            }
            setStartIndex(index);
            setEndIndex(null);
        },
        [endIndex, isLounge, slotStatus, startIndex, timeSlots, withinBookingDays]
    );

    const canBook = Boolean(
        roomSlug &&
            selection &&
            withinBookingDays &&
            customerName.trim() &&
            customerEmail.trim().includes('@') &&
            quote?.pricing?.final_price_cents >= 0
    );

    const startBooking = useCallback(async () => {
        if (!selection) return;
        setBusy(true);
        setError('');
        setInfo('');
        setCheckoutError('');
        setCheckoutClientSecret('');
        try {
            const res = await fetch('/api/bookings/room/book', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    space_slug: roomSlug,
                    booking_date: date,
                    start_time: selection.start_time,
                    end_time: selection.end_time,
                    coupon_code: couponCode,
                    customer_name: customerName,
                    customer_email: customerEmail,
                    customer_phone: customerPhone
                })
            });
            const json = await readJsonResponse(res);
            if (!res.ok) throw errorFromResponse(res, json);

            const secret = json?.payment?.stripe_checkout_client_secret || '';
            if (!secret) throw new Error('Payment session missing client secret.');
            setCheckoutClientSecret(secret);
            setCheckoutOpen(true);
        } catch (err) {
            setError(err?.message || 'Failed to start booking.');
        } finally {
            setBusy(false);
        }
    }, [couponCode, customerEmail, customerName, customerPhone, date, roomSlug, selection]);

    const pricingText = useMemo(() => {
        const cents = Number(quote?.pricing?.final_price_cents ?? quote?.pricing?.base_price_cents ?? 0);
        return formatNZDFromCents(cents);
    }, [quote]);

    const rangeLabel = useMemo(() => {
        if (isLounge) return '17:00–22:00 (5 hours)';
        return formatRangeLabel({ timeSlots, startIndex, endIndex });
    }, [endIndex, isLounge, startIndex, timeSlots]);

    return (
        <div className="room-booking-layout">
            <div className="card">
                <h2 style={{ marginTop: 0 }}>Choose a room</h2>
                {loadingRooms ? (
                    <p>Loading rooms…</p>
                ) : (
                    <form className="contact-form" style={{ marginTop: '1rem' }} onSubmit={e => e.preventDefault()}>
                        <div className="room-form-grid">
                            <label>
                                Room
                                <select
                                    value={roomSlug}
                                    onChange={e => {
                                        setRoomSlug(e.target.value);
                                        setStartIndex(null);
                                        setEndIndex(null);
                                        setInfo('');
                                        setError('');
                                    }}
                                >
                                    {rooms.map(r => (
                                        <option key={r.slug} value={r.slug}>
                                            {r.title}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                Date
                                <input
                                    className="platform-date-input"
                                    type="date"
                                    min={minDate}
                                    value={date}
                                    onChange={e => {
                                        const v = e.target.value;
                                        if (!v) return;
                                        const clamped = v < minDate ? minDate : v;
                                        setDate(roomSlug === 'hive-lounge' ? clamped : nextWeekdayOnOrAfter(clamped));
                                    }}
                                />
                            </label>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                            {dateChips.map(d => (
                                <button
                                    key={d}
                                    type="button"
                                    className={`btn ${d === date ? 'primary' : 'ghost'}`}
                                    onClick={() => setDate(d)}
                                >
                                    {formatDateChip(d)}
                                </button>
                            ))}
                        </div>
                    </form>
                )}

                <div style={{ marginTop: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <h3 style={{ margin: 0 }}>Time</h3>
                        <button className="btn ghost" type="button" onClick={refreshAvailability} disabled={!roomSlug}>
                            Refresh
                        </button>
                    </div>
                    {!withinBookingDays ? (
                        <p style={{ marginTop: 8 }}>
                            Meeting rooms can only be booked Monday–Friday (9am–5pm). Choose a weekday.
                        </p>
                    ) : null}
                    {isLounge ? (
                        <div style={{ marginTop: 8 }}>
                            <p style={{ margin: '8px 0' }}>
                                Hive Lounge is a fixed event slot: <strong>5:00pm–10:00pm</strong> (one-off fee).
                            </p>
                        </div>
                    ) : (
                        <div className="room-time-grid">
                            {timeSlots.map((t, index) => {
                                const status = slotStatus.get(t) || 'open';
                                const selected =
                                    startIndex != null &&
                                    (endIndex == null ? index === startIndex : index >= Math.min(startIndex, endIndex) && index <= Math.max(startIndex, endIndex));
                                const disabled = !withinBookingDays || status !== 'open';
                                const bg = status === 'busy' ? 'rgba(255,255,255,0.08)' : (selected ? 'var(--accent)' : 'transparent');
                                const border = status === 'busy' ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.12)';
                                return (
                                    <button
                                        key={t}
                                        type="button"
                                        className={`btn ${selected ? 'primary' : 'ghost'}`}
                                        disabled={disabled}
                                        onClick={() => onSlotClick(index)}
                                        style={{
                                            opacity: disabled && status === 'busy' ? 0.75 : (disabled ? 0.5 : 1),
                                            background: bg,
                                            borderColor: border
                                        }}
                                    >
                                        {t}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    <p style={{ marginTop: 10 }}>
                        <strong>Selected:</strong> {rangeLabel}
                    </p>
                    {bookedRanges.length ? (
                        <div style={{ marginTop: 10, color: '#6b7280' }}>
                            <strong>Booked:</strong>{' '}
                            {bookedRanges
                                .slice()
                                .sort((a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time))
                                .map(r => `${r.start_time}–${r.end_time}`)
                                .join(', ')}
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="card">
                <h2 style={{ marginTop: 0 }}>Book & pay</h2>
                <form className="contact-form" onSubmit={e => e.preventDefault()} style={{ marginTop: '1rem' }}>
                    <label>
                        Name
                        <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Your name" />
                    </label>
                    <label>
                        Email (invoice sent here)
                        <input
                            value={customerEmail}
                            onChange={e => setCustomerEmail(e.target.value)}
                            placeholder="you@company.com"
                            inputMode="email"
                        />
                    </label>
                    <label>
                        Phone (optional)
                        <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+64…" />
                    </label>

                    <div className="grid room-coupon-row">
                        <label style={{ margin: 0 }}>
                            Coupon
                            <input value={couponCode} onChange={e => setCouponCode(e.target.value)} placeholder="Optional" />
                        </label>
                        <button className="btn ghost" type="button" onClick={refreshQuote} disabled={!selection || quoteBusy}>
                            {quoteBusy ? 'Checking…' : 'Apply'}
                        </button>
                    </div>
                </form>

                <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 700 }}>Total</span>
                        <span style={{ fontWeight: 700 }}>{pricingText}</span>
                    </div>
                    <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
                        Price shown is GST-inclusive. An invoice will be emailed after payment.
                    </p>
                </div>

                {error ? <p className="platform-message error" style={{ marginTop: 12 }}>{error}</p> : null}
                {info ? <p className="platform-message success" style={{ marginTop: 12 }}>{info}</p> : null}
                {returnStatus?.kind === 'pending' ? (
                    <p className="platform-message" style={{ marginTop: 12 }}>
                        Payment received — confirming your booking…
                    </p>
                ) : null}
                {returnStatus?.kind === 'success' ? (
                    <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button
                            className="btn ghost"
                            type="button"
                            onClick={() => {
                                router.replace('/bookings/room');
                                setReturnStatus(null);
                                setInfo('');
                                setError('');
                            }}
                        >
                            New booking
                        </button>
                    </div>
                ) : null}

                <button className="btn primary room-hide-mobile" type="button" style={{ width: '100%', marginTop: 14 }} disabled={!canBook || busy || !stripePromise} onClick={startBooking}>
                    {busy ? 'Starting…' : 'Book now'}
                </button>

                {!stripePromise ? (
                    <p className="platform-message error" style={{ marginTop: 12 }}>
                        Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
                    </p>
                ) : null}
            </div>

            <Modal
                open={checkoutOpen}
                title="Complete payment"
                onClose={() => {
                    setCheckoutOpen(false);
                    setCheckoutClientSecret('');
                    setCheckoutError('');
                    refreshAvailability();
                    setStartIndex(null);
                    setEndIndex(null);
                }}
            >
                {checkoutError ? <p className="platform-message error">{checkoutError}</p> : null}
                {stripePromise && checkoutClientSecret ? (
                    <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret: checkoutClientSecret }}>
                        <EmbeddedCheckout />
                    </EmbeddedCheckoutProvider>
                ) : (
                    <p>Preparing checkout…</p>
                )}
            </Modal>
            {/* Mobile sticky CTA */}
            <div className="room-sticky-cta">
                <div className="room-sticky-cta-inner">
                    <span className="room-sticky-total">{pricingText}</span>
                    <button
                        className="btn primary"
                        type="button"
                        disabled={!canBook || busy || !stripePromise}
                        onClick={startBooking}
                    >
                        {busy ? 'Starting…' : 'Book now'}
                    </button>
                </div>
            </div>
        </div>
    );
}
