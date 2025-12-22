'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlatformSession } from '../PlatformContext';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';

const TOKENS_PER_HOUR = {
    'nikau-room': 1,
    'kauri-room': 1,
    'backhouse-boardroom': 2,
    'manukau-room': 1,
    'hive-training-room': 1,
    'design-lab': 2,
    'hive-lounge': 0
};

const TIME_SLOTS = [
    '09:00',
    '10:00',
    '11:00',
    '12:00',
    '13:00',
    '14:00',
    '15:00',
    '16:00'
];

function formatNZD(value) {
    try {
        return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(value);
    } catch {
        return `$${value}`;
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

function toCents(value) {
    return Math.round(Number(value || 0) * 100);
}

function parseTimeToMinutes(value) {
    const [hh, mm] = String(value || '0:0').split(':').map(v => Number(v));
    return (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
}

function getMonthStart(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-01`;
}

function getPricing(space, hours) {
    const perEvent = space?.pricing_per_event_cents;
    const halfDay = space?.pricing_half_day_cents;
    const fullDay = space?.pricing_full_day_cents;

    if (!hours || hours <= 0) return { label: '', amount: 0 };

    if (perEvent) {
        return { label: 'per event', amount: perEvent };
    }

    if (fullDay && hours >= 8) {
        return { label: 'full day', amount: fullDay };
    }
    if (halfDay && hours >= 4) {
        if (fullDay && fullDay > halfDay && hours > 4) {
            const extraHours = Math.min(4, hours - 4);
            const extraPerHour = (fullDay - halfDay) / 4;
            return { label: `${hours} hour(s)`, amount: Math.round(halfDay + extraPerHour * extraHours) };
        }
        return { label: 'half day', amount: halfDay };
    }

    if (halfDay) {
        return { label: `${hours} hour(s)`, amount: Math.round((halfDay / 4) * hours) };
    }
    if (fullDay) {
        return { label: `${hours} hour(s)`, amount: Math.round((fullDay / 8) * hours) };
    }

    return { label: `${hours} hour(s)`, amount: 0 };
}

function formatRange(startIndex, endIndex) {
    if (startIndex == null) return '—';
    if (endIndex == null) return `${TIME_SLOTS[startIndex]} (1 hour)`;
    const min = Math.min(startIndex, endIndex);
    const max = Math.max(startIndex, endIndex);
    const start = TIME_SLOTS[min];
    const endHour = Number(TIME_SLOTS[max].slice(0, 2)) + 1;
    const end = `${String(endHour).padStart(2, '0')}:00`;
    const hours = max - min + 1;
    return `${start}–${end} (${hours} hour${hours === 1 ? '' : 's'})`;
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
    if (typeof payload?._raw === 'string') {
        const snippet = payload._raw.slice(0, 200);
        return new Error(`Request failed (${response.status}). ${snippet}`);
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
    const { user, supabase } = usePlatformSession();
    const [rooms, setRooms] = useState([]);
    const [loadingRooms, setLoadingRooms] = useState(true);
    const [roomId, setRoomId] = useState('nikau-room');
    const [date, setDate] = useState(() => formatDateInput(''));
    const [tokensLeft, setTokensLeft] = useState(0);
    const [startIndex, setStartIndex] = useState(null);
    const [endIndex, setEndIndex] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [couponCode, setCouponCode] = useState('');
    const [quote, setQuote] = useState(null);
    const [quoteBusy, setQuoteBusy] = useState(false);
    const [couponInfo, setCouponInfo] = useState('');
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [checkoutClientSecret, setCheckoutClientSecret] = useState('');
    const [checkoutError, setCheckoutError] = useState('');
    const [bookingsForDay, setBookingsForDay] = useState([]);

    const room = useMemo(() => rooms.find(r => r.id === roomId) || rooms[0] || null, [roomId, rooms]);
    const isLounge = room?.slug === 'hive-lounge';

    const selection = useMemo(() => {
        if (isLounge) return { hours: 5, indices: [] };
        if (startIndex == null) return { hours: 0, indices: [] };
        const a = startIndex;
        const b = endIndex == null ? startIndex : endIndex;
        const min = Math.min(a, b);
        const max = Math.max(a, b);
        const indices = [];
        for (let i = min; i <= max; i += 1) indices.push(i);
        return { hours: indices.length, indices };
    }, [endIndex, isLounge, startIndex]);

    const requiredTokens = selection.hours * (room?.tokens_per_hour || 0);
    const pricing = useMemo(() => getPricing(room, selection.hours), [room, selection.hours]);
    const priceCents = Number(pricing.amount || 0);
    const tokensApplied = Math.min(tokensLeft, requiredTokens);
    const cashDueCents =
        requiredTokens > 0 ? Math.round((priceCents * Math.max(0, requiredTokens - tokensApplied)) / requiredTokens) : priceCents;
    const cashDueFinalCents = Math.max(0, cashDueCents - Number(quote?.pricing?.discount_cents || 0));
    const requiresPayment = selection.hours > 0 && cashDueFinalCents > 0;

    const stripePromise = useMemo(() => {
        const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
        if (!key) return null;
        return loadStripe(key);
    }, []);

    // Track slot status: 'open' | 'requested' | 'approved'
    const [slotStatus, setSlotStatus] = useState(() => new Map());
    const availabilityRefreshTimer = useMemo(() => ({ id: null }), []);
    const fullDayAvailable = useMemo(
        () => TIME_SLOTS.every(t => (slotStatus.get(t) || 'open') === 'open'),
        [slotStatus]
    );

    const authHeader = useCallback(async () => {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) throw new Error('No session token. Please sign in again.');
        return { Authorization: `Bearer ${token}` };
    }, [supabase]);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoadingRooms(true);
            const { data, error } = await supabase
                .from('spaces')
                .select('slug, title, pricing_half_day_cents, pricing_full_day_cents, pricing_per_event_cents, tokens_per_hour, image, space_images(url, sort_order)')
                .order('title', { ascending: true });

            if (cancelled) return;

            if (error) {
                setError(error.message);
                setRooms([]);
                setLoadingRooms(false);
                return;
            }

            const mapped = (data || [])
                .map(row => {
                    const images = Array.isArray(row?.space_images)
                        ? row.space_images
                            .slice()
                            .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0))
                            .map(img => img?.url)
                            .filter(Boolean)
                        : [];
                    const cover = row.image || images[0] || '';
                    return {
                        id: row.slug,
                        slug: row.slug,
                        name: row.title,
                        title: row.title,
                        tokens_per_hour: row.tokens_per_hour ?? TOKENS_PER_HOUR[row.slug] ?? 1,
                        pricing_half_day_cents: row.pricing_half_day_cents,
                        pricing_full_day_cents: row.pricing_full_day_cents,
                        pricing_per_event_cents: row.pricing_per_event_cents,
                        image: cover,
                        images
                    };
                })
                .sort((a, b) => a.name.localeCompare(b.name));

            setError('');
            setRooms(mapped);
            if (!mapped.some(r => r.id === roomId) && mapped[0]) {
                setRoomId(mapped[0].id);
            }
            setLoadingRooms(false);
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [roomId, supabase]);

    useEffect(() => {
        let cancelled = false;

        const loadCredits = async () => {
            try {
                const res = await fetch(`/api/rooms/tokens?date=${encodeURIComponent(date)}`, {
                    headers: await authHeader()
                });
                const json = await readJsonResponse(res);
                if (cancelled) return;
                if (!res.ok) throw errorFromResponse(res, json);
                setTokensLeft(Math.max(0, Number(json?.tokens_left || 0)));
            } catch {
                if (!cancelled) setTokensLeft(0);
            }
        };

        loadCredits();
        return () => {
            cancelled = true;
        };
    }, [authHeader, date]);

    const refreshTokensLeft = useCallback(async () => {
        try {
            const res = await fetch(`/api/rooms/tokens?date=${encodeURIComponent(date)}`, {
                headers: await authHeader()
            });
            const json = await readJsonResponse(res);
            if (!res.ok) throw errorFromResponse(res, json);
            setTokensLeft(Math.max(0, Number(json?.tokens_left || 0)));
        } catch {
            // ignore
        }
    }, [authHeader, date]);

    const resetDraft = useCallback(() => {
        setStartIndex(null);
        setEndIndex(null);
        setCouponCode('');
        setQuote(null);
        setCouponInfo('');
    }, []);

    const loadAvailability = useCallback(async () => {
        if (!roomId || !date) return;
        const res = await fetch(`/api/rooms/availability?space_slug=${encodeURIComponent(roomId)}&date=${encodeURIComponent(date)}`, {
            headers: await authHeader()
        });
        const json = await readJsonResponse(res);
        if (!res.ok) throw errorFromResponse(res, json);

        const bookings = Array.isArray(json?.bookings) ? json.bookings : [];
        setBookingsForDay(bookings);
        const statusMap = new Map();
        for (const booking of bookings) {
            const startMin = parseTimeToMinutes(booking.start_time);
            const endMin = parseTimeToMinutes(booking.end_time);
            const isSelf = Boolean(booking.is_self);
            TIME_SLOTS.forEach(time => {
                const slotStart = parseTimeToMinutes(time);
                const slotEnd = slotStart + 60;
                const overlaps = slotStart < endMin && slotEnd > startMin;
                if (!overlaps) return;

                const prev = statusMap.get(time) || 'open';
                const incoming =
                    booking.status === 'approved' ? (isSelf ? 'approved_self' : 'approved_other') : isSelf ? 'requested_self' : 'requested_other';

                if (prev.startsWith('approved')) return;
                if (incoming.startsWith('approved')) {
                    statusMap.set(time, incoming);
                    return;
                }
                if (prev === 'open') statusMap.set(time, incoming);
            });
        }

        setSlotStatus(statusMap);
    }, [authHeader, date, roomId]);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                await loadAvailability();
            } catch {
                if (!cancelled) {
                    setSlotStatus(new Map());
                    setBookingsForDay([]);
                }
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [loadAvailability]);

    useEffect(() => {
        setQuote(null);
        setCouponInfo('');
    }, [couponCode, date, roomId, startIndex, endIndex]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const stripeState = params.get('stripe');
        if (!stripeState) return;
        if (stripeState === 'success' || stripeState === 'return') {
            setInfo('Payment complete. Finalising booking…');
        }
        if (stripeState === 'cancel') {
            setInfo('Payment cancelled.');
        }
    }, []);

    useEffect(() => {
        return () => {
            if (availabilityRefreshTimer.id) clearInterval(availabilityRefreshTimer.id);
        };
    }, [availabilityRefreshTimer]);

    const applyCoupon = async () => {
        setCouponInfo('');
        setQuote(null);
        if (!selection.hours) return;
        if (!couponCode.trim()) return;
        const startTime = isLounge ? '17:00' : TIME_SLOTS[Math.min(startIndex, endIndex == null ? startIndex : endIndex)];
        const endTime = isLounge
            ? '22:00'
            : `${String(Number(TIME_SLOTS[Math.max(startIndex, endIndex == null ? startIndex : endIndex)].slice(0, 2)) + 1).padStart(2, '0')}:00`;

        setQuoteBusy(true);
        try {
            const res = await fetch('/api/rooms/quote', {
                method: 'POST',
                headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    space_slug: roomId,
                    booking_date: date,
                    start_time: startTime,
                    end_time: endTime,
                    coupon_code: couponCode.trim()
                })
            });
            const json = await readJsonResponse(res);
            if (!res.ok) throw errorFromResponse(res, json);
            setQuote(json);
            if (json?.coupon?.valid) {
                setCouponInfo('Coupon applied.');
            } else if (json?.coupon?.error) {
                setCouponInfo(json.coupon.error);
            } else {
                setCouponInfo('Coupon could not be applied.');
            }
        } catch (err) {
            setCouponInfo(err?.message || 'Failed to validate coupon.');
        } finally {
            setQuoteBusy(false);
        }
    };

    const submit = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setInfo('');

        try {
            if (!date) throw new Error('Choose a date.');
            if (!selection.hours) throw new Error(isLounge ? 'Hive Lounge is a fixed 5pm–10pm booking.' : 'Choose a time range.');
            if (!isLounge) {
                for (const idx of selection.indices) {
                    const st = slotStatus.get(TIME_SLOTS[idx]) || 'open';
                    if (st !== 'open') throw new Error('That time range includes unavailable time.');
                }
            }

            const startTime = isLounge
                ? '17:00'
                : TIME_SLOTS[Math.min(startIndex, endIndex == null ? startIndex : endIndex)];
            const endTime = isLounge
                ? '22:00'
                : `${String(Number(TIME_SLOTS[Math.max(startIndex, endIndex == null ? startIndex : endIndex)].slice(0, 2)) + 1).padStart(2, '0')}:00`;

            const res = await fetch('/api/rooms/book', {
                method: 'POST',
                headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    space_slug: roomId,
                    booking_date: date,
                    start_time: startTime,
                    end_time: endTime,
                    coupon_code: couponCode.trim() ? couponCode.trim() : null
                })
            });
            const json = await readJsonResponse(res);
            if (!res.ok) throw errorFromResponse(res, json);

            const booking = json?.booking || null;
            const payment = json?.payment || null;

            if (payment?.required) {
                const clientSecret = typeof payment?.stripe_checkout_client_secret === 'string' ? payment.stripe_checkout_client_secret : '';
                if (!clientSecret) {
                    if (payment?.checkout_url) {
                        setInfo(`Redirecting to payment (${formatNZD(Number(payment.amount_cents || 0) / 100)})…`);
                        window.location.href = payment.checkout_url;
                        return;
                    }
                    throw new Error('Payment required but checkout session is missing.');
                }

                if (!stripePromise) throw new Error('Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.');

                setCheckoutClientSecret(clientSecret);
                setCheckoutError('');
                setCheckoutOpen(true);
                setInfo(`Payment required: ${formatNZD(Number(payment.amount_cents || 0) / 100)}.`);
                return;
            }

            setInfo('Booking approved. Tokens deducted.');
            try {
                const tokensRes = await fetch(`/api/rooms/tokens?date=${encodeURIComponent(date)}`, { headers: await authHeader() });
                const tokensJson = await readJsonResponse(tokensRes);
                if (tokensRes.ok) setTokensLeft(Math.max(0, Number(tokensJson?.tokens_left || 0)));
            } catch {
                // ignore
            }

            resetDraft();

            try {
                await loadAvailability();
            } catch {
                // ignore
            }
        } catch (err) {
            setError(err?.message || 'Could not create booking.');
        } finally {
            setBusy(false);
        }
    };

    const pickSlot = index => {
        if (busy) return;
        if (startIndex == null) {
            setStartIndex(index);
            setEndIndex(null);
            return;
        }
        if (endIndex == null) {
            if (index === startIndex) {
                setStartIndex(null);
                setEndIndex(null);
                return;
            }
            setEndIndex(index);
            return;
        }
        setStartIndex(index);
        setEndIndex(null);
    };

    const selectFullDay = () => {
        if (!fullDayAvailable) return;
        setStartIndex(0);
        setEndIndex(TIME_SLOTS.length - 1);
    };

    const clearSelection = () => {
        setStartIndex(null);
        setEndIndex(null);
    };

    return (
        <section className="platform-card" aria-label="Room booking">
            <div className="platform-kpi-row">
                <div>
                    <h2 style={{ margin: 0 }}>Booking</h2>
                    <p className="platform-subtitle">Pick a room, date, and time.</p>
                </div>
                <span className="badge neutral">{tokensLeft} tokens left</span>
            </div>

            <div className="platform-room-layout">
                <form className="contact-form platform-room-form" onSubmit={submit} style={{ marginTop: '1rem' }}>
                    <label>
                        Room
                        <select
                            value={roomId}
                            onChange={e => {
                                setRoomId(e.target.value);
                                clearSelection();
                                setError('');
                                setInfo('');
                            }}
                            disabled={busy || loadingRooms}
                        >
                            {rooms.map(r => (
                                <option key={r.id} value={r.id}>
                                    {r.name}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label>
                        Date
                        <input
                            className="platform-date-input"
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            disabled={busy}
                        />
                    </label>

                    <div style={{ marginTop: '0.5rem' }}>
                        <div className="platform-room-times-row">
                            {isLounge ? (
                                <p className="platform-subtitle" style={{ marginBottom: 0 }}>
                                    Hive Lounge is a fixed event: 5:00pm–10:00pm
                                </p>
                            ) : (
                                <>
                                    <p className="platform-subtitle" style={{ marginBottom: 0 }}>
                                        Available times <span className="platform-subtitle">(click start, then end)</span>
                                    </p>
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <button className="btn ghost" type="button" onClick={clearSelection} disabled={busy || !selection.hours}>
                                            Clear
                                        </button>
                                        <button
                                            className="btn ghost"
                                            type="button"
                                            onClick={selectFullDay}
                                            disabled={busy || !fullDayAvailable}
                                            title={!fullDayAvailable ? 'Full day not available' : 'Select the full day'}
                                        >
                                            Book day
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        <p className="platform-subtitle" style={{ marginTop: '0.5rem' }}>
                            Selected:{' '}
                            <span className="platform-mono">
                                {isLounge ? '17:00–22:00 (5 hours)' : formatRange(startIndex, endIndex)}
                            </span>
                        </p>

                        {!isLounge ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {TIME_SLOTS.map((time, idx) => {
                                    const status = slotStatus.get(time) || 'open';
                                    const selected = selection.indices.includes(idx);
                                    const isDisabled = busy || status !== 'open';
                                    const bg =
                                        status === 'approved_self'
                                            ? '#06d6a0'
                                            : status === 'requested_self'
                                              ? '#b7f0d0'
                                              : status === 'approved_other'
                                                ? '#ff6b6b'
                                                : status === 'requested_other'
                                                  ? '#ffd166'
                                                  : selected
                                                    ? 'var(--accent)'
                                                    : 'transparent';
                                    const color = status === 'open' && !selected ? 'inherit' : '#0b0c10';
                                    return (
                                        <button
                                            key={time}
                                            type="button"
                                            className={`btn ${selected ? 'primary' : 'ghost'}`}
                                            onClick={() => pickSlot(idx)}
                                            disabled={isDisabled}
                                            style={{
                                                opacity: isDisabled && status !== 'open' ? 0.9 : 1,
                                                background: bg,
                                                color
                                            }}
                                        >
                                            {time}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null}
                    </div>

                    {selection.hours ? (
                        <p className="platform-message info" style={{ marginTop: '1rem' }}>
                            <span className="platform-mono">{requiredTokens}</span> token(s) required •{' '}
                            <span className="platform-mono">{tokensApplied}</span> token(s) applied •{' '}
                            {requiresPayment ? (
                                <>
                                    Pay now: <span className="platform-mono">{formatNZD(cashDueFinalCents / 100)}</span>
                                    {quote?.pricing?.discount_cents ? (
                                        <>
                                            {' '}
                                            (includes {formatNZD(Number(quote.pricing.discount_cents || 0) / 100)} discount)
                                        </>
                                    ) : null}
                                </>
                            ) : (
                                <>No payment required.</>
                            )}
                        </p>
                    ) : null}

                    {selection.hours && requiresPayment ? (
                        <div className="platform-card" style={{ marginTop: '1rem' }}>
                            <h3 style={{ marginTop: 0 }}>Pay-as-you-go</h3>
                            <p className="platform-subtitle" style={{ marginTop: 0 }}>
                                Tokens are applied first. Any remainder is charged via Stripe and an invoice is issued automatically.
                            </p>
                            <label className="platform-subtitle">Coupon (optional)</label>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <input
                                    value={couponCode}
                                    onChange={e => setCouponCode(e.target.value)}
                                    disabled={busy || quoteBusy}
                                    placeholder="Enter coupon code"
                                    style={{ flex: 1, minWidth: '12rem' }}
                                />
                                <button className="btn ghost" type="button" onClick={applyCoupon} disabled={busy || quoteBusy || !couponCode.trim()}>
                                    {quoteBusy ? 'Checking…' : 'Apply'}
                                </button>
                            </div>
                            {couponInfo ? <p className="platform-subtitle" style={{ marginTop: '0.75rem' }}>{couponInfo}</p> : null}
                            <p className="platform-subtitle" style={{ marginTop: '0.75rem' }}>
                                Charge today: <span className="platform-mono">{formatNZD(cashDueFinalCents / 100)}</span>
                            </p>
                        </div>
                    ) : null}

                    {error && <p className="platform-message error">{error}</p>}
                    {info && <p className="platform-message info">{info}</p>}

                    <div className="platform-actions" style={{ marginTop: '1rem' }}>
                        <button className="btn primary" type="submit" disabled={busy}>
                            {busy ? 'Submitting…' : requiresPayment ? 'Pay & request booking' : 'Book with tokens'}
                        </button>
                    </div>
                </form>

                <Modal
                    open={checkoutOpen}
                    title="Complete payment"
                    onClose={() => {
                        setCheckoutOpen(false);
                        setCheckoutClientSecret('');
                        setCheckoutError('');
                        resetDraft();
                        setInfo('Payment closed. Your booking will appear once payment is confirmed.');
                        loadAvailability().catch(() => null);
                        refreshTokensLeft().catch(() => null);
                    }}
                >
                    {checkoutError ? <p className="platform-message error">{checkoutError}</p> : null}
                    {!stripePromise ? (
                        <p className="platform-message error">Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.</p>
                    ) : checkoutClientSecret ? (
                        <EmbeddedCheckoutProvider
                            stripe={stripePromise}
                            options={{
                                clientSecret: checkoutClientSecret,
                                onComplete: () => {
                                    setCheckoutOpen(false);
                                    setCheckoutClientSecret('');
                                    setCheckoutError('');
                                    setInfo('Payment submitted. Finalising booking…');
                                    resetDraft();

                                    let tries = 0;
                                    if (availabilityRefreshTimer.id) clearInterval(availabilityRefreshTimer.id);
                                    const interval = setInterval(() => {
                                        tries += 1;
                                        loadAvailability().catch(() => null);
                                        refreshTokensLeft().catch(() => null);
                                        if (tries >= 8) clearInterval(interval);
                                    }, 1500);
                                    availabilityRefreshTimer.id = interval;
                                }
                            }}
                        >
                            <div style={{ minHeight: '560px' }}>
                                <EmbeddedCheckout />
                            </div>
                        </EmbeddedCheckoutProvider>
                    ) : (
                        <p className="platform-subtitle">Preparing checkout…</p>
                    )}
                </Modal>

                <aside className="platform-room-preview" aria-label="Selected room preview">
                    {room ? (
                        <figure className="hex hex-program platform-room-hex" style={{ backgroundImage: `url(${room.image})` }}>
                            <figcaption>{room.name}</figcaption>
                        </figure>
                    ) : (
                        <div className="platform-card">
                            <p className="platform-subtitle">Loading room…</p>
                        </div>
                    )}
                    <div className="platform-card" style={{ marginTop: '1rem' }}>
                        <h3 style={{ marginTop: 0 }}>Pricing</h3>
                        {room?.pricing_per_event_cents ? (
                            <p className="platform-subtitle">{formatNZD(room.pricing_per_event_cents / 100)} per event</p>
                        ) : (
                            <div className="platform-subtitle">
                                {room?.pricing_half_day_cents ? <div>{formatNZD(room.pricing_half_day_cents / 100)} half day</div> : null}
                                {room?.pricing_full_day_cents ? <div>{formatNZD(room.pricing_full_day_cents / 100)} full day</div> : null}
                            </div>
                        )}
                    </div>

                    <div className="platform-card" style={{ marginTop: '1rem' }}>
                        <h3 style={{ marginTop: 0 }}>Bookings</h3>
                        <p className="platform-subtitle" style={{ marginTop: 0 }}>
                            <span className="badge success" style={{ marginRight: '0.5rem' }}>
                                yours
                            </span>
                            <span className="badge pending" style={{ marginRight: '0.5rem' }}>
                                requested
                            </span>
                            <span className="badge error">taken</span>
                        </p>

                        <div className="platform-table-wrap" style={{ marginTop: '0.75rem' }}>
                            <table className="platform-table" style={{ minWidth: '0' }}>
                                <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bookingsForDay.length ? (
                                        bookingsForDay
                                            .slice()
                                            .sort((a, b) => String(a?.start_time || '').localeCompare(String(b?.start_time || '')))
                                            .map((b, idx) => {
                                                const self = Boolean(b?.is_self);
                                                const status = b?.status === 'approved' ? 'approved' : 'requested';
                                                return (
                                                    <tr key={`${b?.start_time}-${b?.end_time}-${idx}`} className={self ? 'row-self' : ''}>
                                                        <td className="platform-mono">
                                                            {b?.start_time}–{b?.end_time}
                                                        </td>
                                                        <td>
                                                            {self ? (
                                                                <span className="badge success">{status}</span>
                                                            ) : status === 'requested' ? (
                                                                <span className="badge pending">requested</span>
                                                            ) : (
                                                                <span className="badge error">approved</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                    ) : (
                                        <tr>
                                            <td colSpan={2} className="platform-subtitle">
                                                No bookings yet for this room/day.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </aside>
            </div>
        </section>
    );
}
