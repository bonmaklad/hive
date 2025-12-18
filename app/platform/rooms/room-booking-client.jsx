'use client';

import { useMemo, useState } from 'react';
import { spaces } from '@/lib/spaces';

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

function getPricing(space, hours) {
    const perEvent = space?.pricing?.perEvent;
    const halfDay = space?.pricing?.halfDay;
    const fullDay = space?.pricing?.fullDay;

    if (!hours || hours <= 0) return { label: '', amount: 0 };

    if (fullDay && hours >= 8) {
        return { label: 'full day', amount: fullDay };
    }
    if (halfDay && hours >= 4) {
        return { label: 'half day', amount: halfDay };
    }

    if (fullDay) {
        return { label: `${hours} hour(s)`, amount: (fullDay / 8) * hours };
    }
    if (halfDay) {
        return { label: `${hours} hour(s)`, amount: (halfDay / 4) * hours };
    }
    if (perEvent) {
        const hoursPerEvent = 5;
        return { label: `${hours} hour(s)`, amount: (perEvent / hoursPerEvent) * hours };
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
    const rooms = useMemo(() => {
        const wanted = new Set([
            'nikau-room',
            'backhouse-boardroom',
            'hive-lounge',
            'hive-training-room',
            'design-lab',
            'kauri-room',
            'manukau-room'
        ]);
        return spaces
            .filter(space => wanted.has(space.slug))
            .map(space => ({
                id: space.slug,
                name: space.title,
                image: getRoomImage(space),
                pricing: space.pricing || {},
                tokensPerHour: TOKENS_PER_HOUR[space.slug] ?? 1
            }));
    }, []);

    const [roomId, setRoomId] = useState(rooms[0]?.id || 'nikau-room');
    const [date, setDate] = useState(() => formatDateInput(''));
    const [tokensLeft, setTokensLeft] = useState(3);
    const [startIndex, setStartIndex] = useState(null);
    const [endIndex, setEndIndex] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    const room = useMemo(() => rooms.find(r => r.id === roomId) || rooms[0], [roomId, rooms]);

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

    const requiredTokens = selection.hours * (room?.tokensPerHour || 0);
    const canUseTokens = requiredTokens > 0 && tokensLeft >= requiredTokens;
    const pricing = useMemo(() => getPricing(room, selection.hours), [room, selection.hours]);
    const priceCents = toCents(pricing.amount);

    const unavailable = useMemo(() => {
        const day = Number(String(date || '').slice(-2));
        if (!Number.isFinite(day)) return new Set();
        if (day % 2 === 0) return new Set();
        return new Set(['12:00', '15:00']);
    }, [date]);
    const fullDayAvailable = useMemo(() => TIME_SLOTS.every(t => !unavailable.has(t)), [unavailable]);

    const submit = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setInfo('');

        try {
            if (!date) throw new Error('Choose a date.');
            if (!selection.hours) throw new Error('Choose a time range.');
            for (const idx of selection.indices) {
                if (unavailable.has(TIME_SLOTS[idx])) throw new Error('That time range includes unavailable time.');
            }

            await new Promise(resolve => setTimeout(resolve, 500));

            if (canUseTokens) {
                setTokensLeft(current => current - requiredTokens);
                setInfo('Booking requested. Tokens will be deducted once approved (demo).');
            } else {
                setInfo(`Booking requested. Payment required: ${formatNZD(priceCents / 100)} (${pricing.label}) (demo).`);
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
                            disabled={busy}
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
                                const isUnavailable = unavailable.has(time);
                                const selected = selection.indices.includes(idx);
                                return (
                                    <button
                                        key={time}
                                        type="button"
                                        className={`btn ${selected ? 'primary' : 'ghost'}`}
                                        onClick={() => pickSlot(idx)}
                                        disabled={busy || isUnavailable}
                                        style={{ opacity: isUnavailable ? 0.45 : 1 }}
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
                    <figure className="hex hex-program platform-room-hex" style={{ backgroundImage: `url(${room.image})` }}>
                        <figcaption>{room.name}</figcaption>
                    </figure>
                    <div className="platform-card" style={{ marginTop: '1rem' }}>
                        <h3 style={{ marginTop: 0 }}>Pricing</h3>
                        {'perEvent' in room.pricing ? (
                            <p className="platform-subtitle">
                                {room.pricing.perEvent ? `${formatNZD(room.pricing.perEvent)} per event` : '—'}
                            </p>
                        ) : (
                            <div className="platform-subtitle">
                                {room.pricing.halfDay ? <div>{formatNZD(room.pricing.halfDay)} half day</div> : null}
                                {room.pricing.fullDay ? <div>{formatNZD(room.pricing.fullDay)} full day</div> : null}
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </section>
    );
}
