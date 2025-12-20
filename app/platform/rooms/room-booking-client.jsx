'use client';

import { useEffect, useMemo, useState } from 'react';
import { spaces as staticSpaces } from '@/lib/spaces';
import { usePlatformSession } from '../PlatformContext';

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

function getRoomImage(space) {
    return space?.images?.[0] || space?.headerImage || '';
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

    if (fullDay && hours >= 8) {
        return { label: 'full day', amount: fullDay };
    }
    if (halfDay && hours >= 4) {
        return { label: 'half day', amount: halfDay };
    }

    if (fullDay) {
        return { label: `${hours} hour(s)`, amount: Math.round((fullDay / 8) * hours) };
    }
    if (halfDay) {
        return { label: `${hours} hour(s)`, amount: Math.round((halfDay / 4) * hours) };
    }
    if (perEvent) {
        const hoursPerEvent = 5;
        return { label: `${hours} hour(s)`, amount: Math.round((perEvent / hoursPerEvent) * hours) };
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

    const room = useMemo(() => rooms.find(r => r.id === roomId) || rooms[0] || null, [roomId, rooms]);

    const selection = useMemo(() => {
        if (startIndex == null) return { hours: 0, indices: [] };
        const a = startIndex;
        const b = endIndex == null ? startIndex : endIndex;
        const min = Math.min(a, b);
        const max = Math.max(a, b);
        const indices = [];
        for (let i = min; i <= max; i += 1) indices.push(i);
        return { hours: indices.length, indices };
    }, [endIndex, startIndex]);

    const requiredTokens = selection.hours * (room?.tokens_per_hour || 0);
    const canUseTokens = requiredTokens > 0 && tokensLeft >= requiredTokens;
    const pricing = useMemo(() => getPricing(room, selection.hours), [room, selection.hours]);
    const priceCents = Number(pricing.amount || 0);

    // Track slot status: 'open' | 'requested' | 'approved'
    const [slotStatus, setSlotStatus] = useState(() => new Map());
    const fullDayAvailable = useMemo(
        () => TIME_SLOTS.every(t => (slotStatus.get(t) || 'open') === 'open'),
        [slotStatus]
    );

    useEffect(() => {
        let cancelled = false;

        const wanted = new Set([
            'nikau-room',
            'backhouse-boardroom',
            'hive-lounge',
            'hive-training-room',
            'design-lab',
            'kauri-room',
            'manukau-room'
        ]);

        const load = async () => {
            setLoadingRooms(true);
            const { data, error } = await supabase
                .from('spaces')
                .select('slug, title, pricing_half_day_cents, pricing_full_day_cents, pricing_per_event_cents, tokens_per_hour, image')
                .in('slug', Array.from(wanted));

            if (cancelled) return;

            if (error) {
                setError(error.message);
                setRooms([]);
                setLoadingRooms(false);
                return;
            }

            const staticBySlug = Object.fromEntries(staticSpaces.map(s => [s.slug, s]));
            const mapped = (data || [])
                .map(row => {
                    const fallback = staticBySlug[row.slug];
                    return {
                        id: row.slug,
                        slug: row.slug,
                        name: row.title,
                        title: row.title,
                        tokens_per_hour: row.tokens_per_hour ?? TOKENS_PER_HOUR[row.slug] ?? 1,
                        pricing_half_day_cents: row.pricing_half_day_cents,
                        pricing_full_day_cents: row.pricing_full_day_cents,
                        pricing_per_event_cents: row.pricing_per_event_cents,
                        image: row.image || getRoomImage(fallback)
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
            const periodStart = getMonthStart(date);
            if (!periodStart) return;

            const { data, error } = await supabase
                .from('room_credits')
                .select('tokens_total, tokens_used')
                .eq('owner_id', user.id)
                .eq('period_start', periodStart)
                .maybeSingle();

            if (cancelled) return;

            if (error) {
                setTokensLeft(0);
                return;
            }

            const total = data?.tokens_total ?? 0;
            const used = data?.tokens_used ?? 0;
            setTokensLeft(Math.max(0, total - used));
        };

        loadCredits();
        return () => {
            cancelled = true;
        };
    }, [date, supabase, user.id]);

    useEffect(() => {
        let cancelled = false;

        const loadBookings = async () => {
            if (!roomId || !date) return;
            const { data, error } = await supabase
                .from('room_bookings')
                .select('start_time, end_time, status')
                .eq('space_slug', roomId)
                .eq('booking_date', date)
                .in('status', ['requested', 'approved']);

            if (cancelled) return;

            if (error) {
                setSlotStatus(new Map());
                return;
            }

            const statusMap = new Map();
            for (const booking of data || []) {
                const startMin = parseTimeToMinutes(booking.start_time);
                const endMin = parseTimeToMinutes(booking.end_time);
                TIME_SLOTS.forEach(time => {
                    const slotStart = parseTimeToMinutes(time);
                    const slotEnd = slotStart + 60;
                    const overlaps = slotStart < endMin && slotEnd > startMin;
                    if (overlaps) {
                        const prev = statusMap.get(time) || 'open';
                        const nxt = booking.status === 'approved' ? 'approved' : prev === 'approved' ? 'approved' : 'requested';
                        statusMap.set(time, nxt);
                    }
                });
            }
            setSlotStatus(statusMap);
        };

        loadBookings();
        return () => {
            cancelled = true;
        };
    }, [date, roomId, supabase]);

    const submit = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setInfo('');

        try {
            if (!date) throw new Error('Choose a date.');
            if (!selection.hours) throw new Error('Choose a time range.');
            for (const idx of selection.indices) {
                const st = slotStatus.get(TIME_SLOTS[idx]) || 'open';
                if (st !== 'open') throw new Error('That time range includes unavailable time.');
            }

            const min = Math.min(startIndex, endIndex == null ? startIndex : endIndex);
            const max = Math.max(startIndex, endIndex == null ? startIndex : endIndex);
            const startTime = `${TIME_SLOTS[min]}:00`;
            const endHour = Number(TIME_SLOTS[max].slice(0, 2)) + 1;
            const endTime = `${String(endHour).padStart(2, '0')}:00:00`;

            // Determine auto-approval
            const autoApprove = canUseTokens;

            const { error: insertError } = await supabase.from('room_bookings').insert({
                owner_id: user.id,
                space_slug: roomId,
                booking_date: date,
                start_time: startTime,
                end_time: endTime,
                hours: selection.hours,
                tokens_used: autoApprove ? requiredTokens : 0,
                price_cents: autoApprove ? 0 : priceCents,
                status: autoApprove ? 'approved' : 'requested'
            });
            if (insertError) throw insertError;

            if (autoApprove) {
                // Deduct tokens for current month
                try {
                    const periodStart = getMonthStart(date);
                    const { data: credits, error: creditsErr } = await supabase
                        .from('room_credits')
                        .select('tokens_used, tokens_total')
                        .eq('owner_id', user.id)
                        .eq('period_start', periodStart)
                        .maybeSingle();
                    if (!creditsErr && credits) {
                        const newUsed = Math.max(0, (credits.tokens_used || 0) + requiredTokens);
                        await supabase
                            .from('room_credits')
                            .update({ tokens_used: newUsed })
                            .eq('owner_id', user.id)
                            .eq('period_start', periodStart);
                        setTokensLeft(t => Math.max(0, t - requiredTokens));
                    }
                } catch {
                    // ignore UI-side errors; backend might reconcile
                }

                setInfo('Booking approved. Tokens deducted.');
            } else {
                setInfo(`Booking requested. Payment required: ${formatNZD(priceCents / 100)} (${pricing.label}).`);
            }

            // Refresh local slot status quickly: mark selected slots
            setSlotStatus(prev => {
                const next = new Map(prev);
                for (const idx of selection.indices) {
                    const time = TIME_SLOTS[idx];
                    next.set(time, autoApprove ? 'approved' : 'requested');
                }
                return next;
            });
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
                        </div>

                        <p className="platform-subtitle" style={{ marginTop: '0.5rem' }}>
                            Selected: <span className="platform-mono">{formatRange(startIndex, endIndex)}</span>
                        </p>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {TIME_SLOTS.map((time, idx) => {
                                const status = slotStatus.get(time) || 'open';
                                const selected = selection.indices.includes(idx);
                                const isDisabled = busy || status !== 'open';
                                const bg = status === 'approved' ? '#ff6b6b' : status === 'requested' ? '#ffd166' : selected ? 'var(--accent)' : 'transparent';
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
                    </div>

                    {selection.hours ? (
                        <p className="platform-message info" style={{ marginTop: '1rem' }}>
                            {canUseTokens ? (
                                <>
                                    Uses <span className="platform-mono">{requiredTokens}</span> token(s) for {room.name}.
                                </>
                            ) : (
                                <>
                                    Not enough tokens. Price:{' '}
                                    <span className="platform-mono">{formatNZD(priceCents / 100)}</span> ({pricing.label}).
                                </>
                            )}
                        </p>
                    ) : null}

                    {error && <p className="platform-message error">{error}</p>}
                    {info && <p className="platform-message info">{info}</p>}

                    <div className="platform-actions" style={{ marginTop: '1rem' }}>
                        <button className="btn primary" type="submit" disabled={busy}>
                            {busy ? 'Submitting…' : 'Request booking'}
                        </button>
                    </div>
                </form>

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
                </aside>
            </div>
        </section>
    );
}
