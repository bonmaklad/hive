'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { eventTypeLabel } from '@/lib/eventOptions';

function isoDate(date) {
    return date.toISOString().slice(0, 10);
}

function weekRange() {
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(now.getDate() + mondayOffset);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return { start, end };
}

function formatDay(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric' });
}

function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' });
}

export default function EventWeekStrip() {
    const range = useMemo(() => weekRange(), []);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const params = new URLSearchParams({
            audience: 'public',
            start: isoDate(range.start),
            end: isoDate(range.end)
        });

        fetch(`/api/events?${params.toString()}`, { cache: 'no-store' })
            .then(res => res.json())
            .then(json => {
                if (!cancelled) setEvents(Array.isArray(json?.events) ? json.events.slice(0, 4) : []);
            })
            .catch(() => {
                if (!cancelled) setEvents([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [range.end, range.start]);

    return (
        <div className="event-week-strip">
            <div className="event-week-head">
                <div>
                    <span>This week</span>
                    <strong>{formatDay(range.start)} - {formatDay(new Date(range.end.getTime() - 86400000))}</strong>
                </div>
                <Link className="btn ghost" href="/events">
                    Open calendar
                </Link>
            </div>

            <div className="event-week-list">
                {loading ? (
                    <div className="event-week-empty">Loading events...</div>
                ) : events.length ? (
                    events.map(event => (
                        <Link className="event-week-item" href={`/events?event=${encodeURIComponent(event.id)}#calendar`} key={event.id}>
                            <span>{formatDay(event.starts_at)}</span>
                            <strong>{event.title}</strong>
                            <small>{formatTime(event.starts_at)} · {eventTypeLabel(event.event_type)}</small>
                        </Link>
                    ))
                ) : (
                    <div className="event-week-empty">No events this week.</div>
                )}
            </div>
        </div>
    );
}
