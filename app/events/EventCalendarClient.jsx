'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { EVENT_TOPICS, EVENT_TYPES, EVENT_VISIBILITIES, HIVE_LOCATION, eventTypeLabel, mapsEmbedUrl } from '@/lib/eventOptions';

const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
    const total = index * 15;
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
});

function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, delta) {
    return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function calendarDateKey(date) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function eventDateKey(event) {
    const date = new Date(event?.starts_at);
    if (Number.isNaN(date.getTime())) return '';

    try {
        const parts = new Intl.DateTimeFormat('en-NZ', {
            timeZone: event?.timezone || 'Pacific/Auckland',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(date);
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    } catch (_) {
        return calendarDateKey(date);
    }
}

function monthLabel(date) {
    return date.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' });
}

function formatDay(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' });
}

function formatCreated(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function formatTimeOption(value) {
    const [hours, minutes] = String(value || '').split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
    return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' });
}

function toDateTimeLocal(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localParts(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { booking_date: '', start_time: '', end_time: '' };
    const pad = n => String(n).padStart(2, '0');
    return {
        booking_date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
        start_time: `${pad(date.getHours())}:${pad(date.getMinutes())}`
    };
}

function splitDateTimeLocal(value) {
    const [date = '', time = ''] = String(value || '').split('T');
    return {
        date,
        time: time.slice(0, 5)
    };
}

function combineDateTimeLocal(date, time) {
    if (!date || !time) return '';
    return `${date}T${time}`;
}

function addMinutesLocal(value, minutes) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    date.setMinutes(date.getMinutes() + minutes);
    return toDateTimeLocal(date);
}

function buildMonthDays(monthDate) {
    const start = startOfMonth(monthDate);
    const gridStart = new Date(start);
    const day = gridStart.getDay();
    gridStart.setDate(gridStart.getDate() - (day === 0 ? 6 : day - 1));

    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(gridStart);
        date.setDate(gridStart.getDate() + index);
        return date;
    });
}

function defaultEventForm() {
    const start = new Date();
    start.setDate(start.getDate() + 7);
    start.setHours(17, 30, 0, 0);
    const end = new Date(start);
    end.setHours(start.getHours() + 1);
    return {
        title: '',
        description: '',
        starts_at: toDateTimeLocal(start),
        ends_at: toDateTimeLocal(end),
        event_type: 'discover',
        visibility: 'public',
        capacity: '',
        topics: [],
        location_mode: 'hive',
        location_name: '',
        location_address: '',
        book_room: false,
        space_slug: ''
    };
}

function eventFormFromEvent(event) {
    const isHiveLocation = (event?.location_address || '') === HIVE_LOCATION.address;
    return {
        title: event?.title || '',
        description: event?.description || '',
        starts_at: toDateTimeLocal(event?.starts_at),
        ends_at: toDateTimeLocal(event?.ends_at),
        event_type: event?.event_type || 'discover',
        visibility: event?.visibility || 'public',
        capacity: event?.capacity ? String(event.capacity) : '',
        topics: Array.isArray(event?.topics) ? event.topics : [],
        location_mode: isHiveLocation ? 'hive' : 'custom',
        location_name: isHiveLocation ? '' : event?.location_name || '',
        location_address: isHiveLocation ? '' : event?.location_address || '',
        book_room: false,
        space_slug: ''
    };
}

function downloadIcs(event) {
    const start = new Date(event.starts_at);
    const end = new Date(event.ends_at);
    const stamp = value => value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const body = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//HIVE//Events//EN',
        'BEGIN:VEVENT',
        `UID:${event.id}@hivehq.nz`,
        `DTSTAMP:${stamp(new Date())}`,
        `DTSTART:${stamp(start)}`,
        `DTEND:${stamp(end)}`,
        `SUMMARY:${event.title}`,
        `DESCRIPTION:${String(event.description || '').replace(/\n/g, '\\n')}`,
        `LOCATION:${event.location_address || HIVE_LOCATION.address}`,
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');
    const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'hive-event'}.ics`;
    link.click();
    URL.revokeObjectURL(url);
}

function TimePicker({ id, value, open, onChange, onClose, onToggle }) {
    const currentLabel = formatTimeOption(value);
    return (
        <div
            className="event-time-picker"
            onBlur={event => {
                if (!event.currentTarget.contains(event.relatedTarget)) onClose();
            }}
        >
            <button
                aria-expanded={open}
                aria-haspopup="listbox"
                className="event-time-button"
                data-testid={id}
                type="button"
                onClick={onToggle}
            >
                <span>{currentLabel || 'Choose time'}</span>
                <span className="event-time-chevron" aria-hidden="true" />
            </button>
            {open ? (
                <div className="event-time-menu" role="listbox" aria-label="Choose time">
                    <div className="event-time-menu-grid">
                        {TIME_OPTIONS.map(time => (
                            <button
                                aria-selected={time === value}
                                className={time === value ? 'is-selected' : ''}
                                key={time}
                                role="option"
                                type="button"
                                onClick={() => {
                                    onChange(time);
                                    onClose();
                                }}
                            >
                                {formatTimeOption(time)}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default function EventCalendarClient({ audience = 'public', canCreate = false }) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const searchParams = useSearchParams();
    const targetEventId = searchParams.get('event') || '';
    const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
    const [events, setEvents] = useState([]);
    const [spaces, setSpaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState(null);
    const [typeFilter, setTypeFilter] = useState('all');
    const [topicFilter, setTopicFilter] = useState('all');
    const [rsvp, setRsvp] = useState({ name: '', email: '', guests_count: 1 });
    const [rsvpStatus, setRsvpStatus] = useState('');
    const [rsvpRows, setRsvpRows] = useState([]);
    const [rsvpSummary, setRsvpSummary] = useState(null);
    const [rsvpLoading, setRsvpLoading] = useState(false);
    const [rsvpError, setRsvpError] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    const [eventForm, setEventForm] = useState(() => defaultEventForm());
    const [imageFile, setImageFile] = useState(null);
    const [savingEvent, setSavingEvent] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const [openTimePicker, setOpenTimePicker] = useState('');

    const monthDays = useMemo(() => buildMonthDays(monthDate), [monthDate]);
    const range = useMemo(() => {
        const start = monthDays[0];
        const end = new Date(monthDays[monthDays.length - 1]);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    }, [monthDays]);

    const authHeader = useCallback(async () => {
        if (audience !== 'member' && !canCreate) return {};
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token || '';
        return token ? { Authorization: `Bearer ${token}` } : {};
    }, [audience, canCreate, supabase]);

    const loadEvents = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({
                audience,
                start: range.start.toISOString(),
                end: range.end.toISOString()
            });
            const res = await fetch(`/api/events?${params.toString()}`, {
                headers: await authHeader(),
                cache: 'no-store'
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Could not load events.');
            setEvents(Array.isArray(json?.events) ? json.events : []);
        } catch (err) {
            setError(err?.message || 'Could not load events.');
            setEvents([]);
        } finally {
            setLoading(false);
        }
    }, [audience, authHeader, range.end, range.start]);

    useEffect(() => {
        loadEvents();
    }, [loadEvents]);

    useEffect(() => {
        if (!createOpen) return undefined;
        document.body.classList.add('event-drawer-open');
        return () => document.body.classList.remove('event-drawer-open');
    }, [createOpen]);

    const loadRsvps = useCallback(async event => {
        if (!event?.id || !event?.can_edit) {
            setRsvpRows([]);
            setRsvpSummary(null);
            return;
        }

        setRsvpLoading(true);
        setRsvpError('');
        try {
            const res = await fetch(`/api/events/${event.id}/rsvps`, {
                headers: await authHeader(),
                cache: 'no-store'
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Could not load RSVPs.');
            setRsvpRows(Array.isArray(json?.rsvps) ? json.rsvps : []);
            setRsvpSummary(json?.summary || null);
        } catch (err) {
            setRsvpRows([]);
            setRsvpSummary(null);
            setRsvpError(err?.message || 'Could not load RSVPs.');
        } finally {
            setRsvpLoading(false);
        }
    }, [authHeader]);

    useEffect(() => {
        setRsvpStatus('');
        if (selected?.can_edit) {
            loadRsvps(selected);
        } else {
            setRsvpRows([]);
            setRsvpSummary(null);
            setRsvpError('');
        }
    }, [loadRsvps, selected]);

    useEffect(() => {
        if (!targetEventId || !events.length) return;
        const match = events.find(event => event.id === targetEventId);
        if (match) setSelected(match);
    }, [events, targetEventId]);

    useEffect(() => {
        if (!canCreate) return;
        fetch('/api/bookings/room/spaces')
            .then(res => res.json())
            .then(json => setSpaces(Array.isArray(json?.spaces) ? json.spaces : []))
            .catch(() => setSpaces([]));
    }, [canCreate]);

    const filteredEvents = useMemo(() => events.filter(event => {
        if (typeFilter !== 'all' && event.event_type !== typeFilter) return false;
        if (topicFilter !== 'all' && !event.topics?.includes(topicFilter)) return false;
        return true;
    }), [events, topicFilter, typeFilter]);

    const eventsByDay = useMemo(() => {
        const map = new Map();
        for (const event of filteredEvents) {
            const key = eventDateKey(event);
            if (!key) continue;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(event);
        }
        return map;
    }, [filteredEvents]);

    const updateForm = (field, value) => {
        setEventForm(current => ({ ...current, [field]: value }));
    };

    const openCreateEvent = () => {
        setEditingEvent(null);
        setEventForm(defaultEventForm());
        setImageFile(null);
        setSaveMessage('');
        setOpenTimePicker('');
        setCreateOpen(true);
    };

    const openEditEvent = event => {
        setEditingEvent(event);
        setEventForm(eventFormFromEvent(event));
        setImageFile(null);
        setSaveMessage('');
        setOpenTimePicker('');
        setCreateOpen(true);
    };

    const closeEventForm = () => {
        setCreateOpen(false);
        setEditingEvent(null);
        setImageFile(null);
        setSaveMessage('');
        setOpenTimePicker('');
    };

    const updateEventDateTime = (field, part, value) => {
        setEventForm(current => {
            const existing = splitDateTimeLocal(current[field]);
            const nextDate = part === 'date' ? value : existing.date;
            const nextTime = part === 'time' ? value : existing.time;
            const nextValue = combineDateTimeLocal(nextDate, nextTime);
            const next = { ...current, [field]: nextValue };

            if (field === 'starts_at' && nextValue && (!next.ends_at || new Date(next.ends_at) <= new Date(nextValue))) {
                next.ends_at = addMinutesLocal(nextValue, 60);
            }

            return next;
        });
    };

    const toggleTimePicker = picker => {
        setOpenTimePicker(current => (current === picker ? '' : picker));
    };

    const toggleTopic = topic => {
        setEventForm(current => {
            const exists = current.topics.includes(topic);
            return {
                ...current,
                topics: exists ? current.topics.filter(item => item !== topic) : [...current.topics, topic]
            };
        });
    };

    const submitRsvp = async event => {
        event.preventDefault();
        if (!selected) return;
        setRsvpStatus('Saving...');
        try {
            const res = await fetch(`/api/events/${selected.id}/rsvp`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', ...(await authHeader()) },
                body: JSON.stringify(rsvp)
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Could not RSVP.');
            setRsvpStatus('RSVP saved.');
            if (json?.availability) {
                setEvents(current => current.map(item => item.id === selected.id ? { ...item, ...json.availability } : item));
                setSelected(current => current?.id === selected.id ? { ...current, ...json.availability } : current);
            }
            if (selected.can_edit) {
                await loadRsvps(selected);
            }
        } catch (err) {
            setRsvpStatus(err?.message || 'Could not RSVP.');
        }
    };

    const submitEvent = async event => {
        event.preventDefault();
        setSavingEvent(true);
        setSaveMessage('');
        try {
            const form = new FormData();
            for (const [key, value] of Object.entries(eventForm)) {
                if (key === 'topics') continue;
                if (key === 'book_room') form.set(key, value ? 'true' : 'false');
                else form.set(key, value);
            }
            for (const topic of eventForm.topics) form.append('topics', topic);
            if (imageFile) form.set('image', imageFile);

            const startParts = localParts(eventForm.starts_at);
            const endParts = localParts(eventForm.ends_at);
            form.set('booking_date', startParts.booking_date);
            form.set('start_time', startParts.start_time);
            form.set('end_time', endParts.start_time);
            form.set('starts_at', new Date(eventForm.starts_at).toISOString());
            form.set('ends_at', new Date(eventForm.ends_at).toISOString());

            const requestEventSave = async () => fetch(editingEvent ? `/api/events/${editingEvent.id}` : '/api/events', {
                method: editingEvent ? 'PATCH' : 'POST',
                headers: await authHeader(),
                body: form
            });

            let res = await requestEventSave();
            let json = await res.json().catch(() => ({}));
            if (
                editingEvent &&
                res.status === 401 &&
                String(json?.error || '').toLowerCase().includes('verify your login')
            ) {
                res = await requestEventSave();
                json = await res.json().catch(() => ({}));
            }
            if (!res.ok) throw new Error(json?.error || (editingEvent ? 'Could not update event.' : 'Could not add event.'));
            setSaveMessage(editingEvent ? 'Event updated.' : 'Event added.');
            setEventForm(defaultEventForm());
            setEditingEvent(null);
            setImageFile(null);
            setOpenTimePicker('');
            setCreateOpen(false);
            await loadEvents();
            setSelected(json.event || null);
        } catch (err) {
            const rawMessage = err?.message || '';
            const fallback = editingEvent ? 'Could not update event.' : 'Could not add event.';
            setSaveMessage(rawMessage.toLowerCase().includes('fetch') ? `${fallback} Please try again.` : rawMessage || fallback);
        } finally {
            setSavingEvent(false);
        }
    };

    const selectedSummary = rsvpSummary || selected || {};
    const selectedCapacity = selected?.capacity || null;
    const selectedGuests = Number(selectedSummary.rsvp_guests_count) || 0;
    const selectedRemaining = selectedCapacity ? Math.max(selectedCapacity - selectedGuests, 0) : null;
    const selectedSoldOut = Boolean(selectedCapacity && selectedGuests >= selectedCapacity);
    const selectedCapacityLabel = selectedCapacity
        ? `${selectedGuests}/${selectedCapacity} spots${selectedRemaining === 0 ? ' filled' : `, ${selectedRemaining} left`}`
        : `${selectedGuests} guests, no cap`;

    return (
        <div className="event-calendar-shell">
            <div className="event-calendar-toolbar">
                <div className="event-month-controls">
                    <button className="btn ghost" type="button" onClick={() => setMonthDate(addMonths(monthDate, -1))}>
                        Prev
                    </button>
                    <strong>{monthLabel(monthDate)}</strong>
                    <button className="btn ghost" type="button" onClick={() => setMonthDate(addMonths(monthDate, 1))}>
                        Next
                    </button>
                </div>
                <div className="event-filter-row">
                    <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} aria-label="Filter event type">
                        <option value="all">All types</option>
                        {EVENT_TYPES.map(type => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                    </select>
                    <select value={topicFilter} onChange={event => setTopicFilter(event.target.value)} aria-label="Filter topic">
                        <option value="all">All topics</option>
                        {EVENT_TOPICS.map(topic => (
                            <option key={topic} value={topic}>{topic}</option>
                        ))}
                    </select>
                    {canCreate ? (
                        <button className="btn primary" type="button" onClick={openCreateEvent}>
                            Add event
                        </button>
                    ) : null}
                </div>
            </div>

            {error ? <p className="platform-message error">{error}</p> : null}
            {loading ? <p className="platform-subtitle">Loading...</p> : null}

            <div className={`event-calendar-layout ${selected ? 'has-selection' : ''}`}>
                <div className="event-month-grid">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                        <div className="event-weekday" key={day}>{day}</div>
                    ))}
                    {monthDays.map(day => {
                        const key = calendarDateKey(day);
                        const dayEvents = eventsByDay.get(key) || [];
                        const muted = day.getMonth() !== monthDate.getMonth();
                        return (
                            <div className={`event-day ${muted ? 'muted' : ''}`} key={key}>
                                <span>{day.getDate()}</span>
                                <div className="event-day-list">
                                    {dayEvents.slice(0, 3).map(event => (
                                        <button
                                            aria-label={`${event.title}${event.is_sold_out ? ' sold out' : ''}`}
                                            className={`event-chip type-${event.event_type}${event.is_sold_out ? ' is-sold-out' : ''}`}
                                            key={event.id}
                                            type="button"
                                            onClick={() => setSelected(event)}
                                        >
                                            <span className="event-chip-title">{event.title}</span>
                                            {event.is_sold_out ? <span className="event-chip-status">Sold out</span> : null}
                                        </button>
                                    ))}
                                    {dayEvents.length > 3 ? <small>+{dayEvents.length - 3}</small> : null}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {selected ? (
                    <aside className="event-side-panel" aria-label="Event details">
                        <button className="event-panel-close" type="button" onClick={() => setSelected(null)}>
                            Close
                        </button>
                        {selected.image_url ? (
                            <div className="event-side-image">
                                <Image src={selected.image_url} alt="" fill sizes="420px" unoptimized />
                            </div>
                        ) : null}
                        <span className={`event-type-pill type-${selected.event_type}`}>{eventTypeLabel(selected.event_type)}</span>
                        <h2>{selected.title}</h2>
                        <p>{selected.description}</p>
                        <dl className="event-detail-list">
                            <div><dt>When</dt><dd>{formatDay(selected.starts_at)}, {formatTime(selected.starts_at)} - {formatTime(selected.ends_at)}</dd></div>
                            <div><dt>Where</dt><dd>{selected.location_name}<br />{selected.location_address}</dd></div>
                            <div><dt>Who</dt><dd>{selected.organizer?.name || 'HIVE'}</dd></div>
                            <div><dt>Capacity</dt><dd>{selectedCapacityLabel}</dd></div>
                        </dl>
                        {selectedSoldOut ? <div className="event-sold-out">Sold out</div> : null}
                        {selected.topics?.length ? (
                            <div className="event-topic-list">
                                {selected.topics.map(topic => <span key={topic}>{topic}</span>)}
                            </div>
                        ) : null}
                        <iframe className="event-map" src={mapsEmbedUrl(selected.location_address)} title={`${selected.title} map`} loading="lazy" />
                        <div className="event-panel-actions">
                            {selected.can_edit ? (
                                <button className="btn primary" type="button" onClick={() => openEditEvent(selected)}>Edit</button>
                            ) : null}
                            <a className="btn ghost" href={selected.google_maps_url} target="_blank" rel="noreferrer">Map</a>
                            <button className="btn ghost" type="button" onClick={() => downloadIcs(selected)}>Add to calendar</button>
                        </div>
                        {selected.can_edit ? (
                            <section className="event-rsvp-manager" aria-label="Event RSVPs">
                                <div className="event-rsvp-manager-head">
                                    <h3>RSVPs</h3>
                                    <span>{selectedCapacityLabel}</span>
                                </div>
                                {rsvpLoading ? <p>Loading RSVPs...</p> : null}
                                {rsvpError ? <p className="platform-message error">{rsvpError}</p> : null}
                                {!rsvpLoading && !rsvpError && rsvpRows.length ? (
                                    <div className="event-rsvp-list">
                                        {rsvpRows.map(row => (
                                            <div className="event-rsvp-row" key={row.id}>
                                                <div>
                                                    <strong>{row.name}</strong>
                                                    <span>{row.email}</span>
                                                </div>
                                                <div>
                                                    <strong>{row.guests_count}</strong>
                                                    <span>{row.status}{row.created_at ? `, ${formatCreated(row.created_at)}` : ''}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                                {!rsvpLoading && !rsvpError && !rsvpRows.length ? <p>No RSVPs yet.</p> : null}
                            </section>
                        ) : null}
                        {selected.can_edit ? null : selectedSoldOut ? (
                            <p className="event-rsvp-closed">RSVPs are closed because this event is full.</p>
                        ) : (
                            <form className="event-rsvp-form" onSubmit={submitRsvp}>
                                <h3>RSVP</h3>
                                <input value={rsvp.name} onChange={event => setRsvp(current => ({ ...current, name: event.target.value }))} placeholder="Name" />
                                <input value={rsvp.email} onChange={event => setRsvp(current => ({ ...current, email: event.target.value }))} placeholder="Email" type="email" />
                                <input value={rsvp.guests_count} onChange={event => setRsvp(current => ({ ...current, guests_count: event.target.value }))} min="1" max="10" type="number" />
                                <button className="btn primary" type="submit">RSVP</button>
                                {rsvpStatus ? <p>{rsvpStatus}</p> : null}
                            </form>
                        )}
                    </aside>
                ) : null}
            </div>

            {createOpen ? (
                <div className="event-create-drawer" role="dialog" aria-modal="true" aria-label={editingEvent ? 'Edit event' : 'Add event'}>
                    <form onSubmit={submitEvent} autoComplete="off">
                        <div className="event-create-head">
                            <h2>{editingEvent ? 'Edit event' : 'Add event'}</h2>
                            <button className="btn ghost" type="button" onClick={closeEventForm}>Close</button>
                        </div>
                        <label>Title<input value={eventForm.title} onChange={event => updateForm('title', event.target.value)} autoComplete="off" required /></label>
                        <label>Description<textarea value={eventForm.description} onChange={event => updateForm('description', event.target.value)} autoComplete="off" required /></label>
                        <div className="event-datetime-picker">
                            <div className="event-datetime-row">
                                <span>Start</span>
                                <label>Date<input data-testid="event-start-date" type="date" value={splitDateTimeLocal(eventForm.starts_at).date} onChange={event => updateEventDateTime('starts_at', 'date', event.target.value)} autoComplete="off" required /></label>
                                <div className="event-field-label">
                                    <span>Time</span>
                                    <TimePicker
                                        id="event-start-time"
                                        value={splitDateTimeLocal(eventForm.starts_at).time}
                                        open={openTimePicker === 'start'}
                                        onToggle={() => toggleTimePicker('start')}
                                        onClose={() => setOpenTimePicker('')}
                                        onChange={time => updateEventDateTime('starts_at', 'time', time)}
                                    />
                                </div>
                            </div>
                            <div className="event-datetime-row">
                                <span>End</span>
                                <label>Date<input data-testid="event-end-date" type="date" value={splitDateTimeLocal(eventForm.ends_at).date} onChange={event => updateEventDateTime('ends_at', 'date', event.target.value)} autoComplete="off" required /></label>
                                <div className="event-field-label">
                                    <span>Time</span>
                                    <TimePicker
                                        id="event-end-time"
                                        value={splitDateTimeLocal(eventForm.ends_at).time}
                                        open={openTimePicker === 'end'}
                                        onToggle={() => toggleTimePicker('end')}
                                        onClose={() => setOpenTimePicker('')}
                                        onChange={time => updateEventDateTime('ends_at', 'time', time)}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="event-create-grid">
                            <label>Visibility<select value={eventForm.visibility} onChange={event => updateForm('visibility', event.target.value)}>
                                {EVENT_VISIBILITIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                            </select></label>
                            <label>Type<select value={eventForm.event_type} onChange={event => updateForm('event_type', event.target.value)}>
                                {EVENT_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                            </select></label>
                            <label>Max spots<input value={eventForm.capacity} onChange={event => updateForm('capacity', event.target.value)} min="1" max="10000" placeholder="No cap" type="number" /></label>
                        </div>
                        <div className="event-topic-picker">
                            {EVENT_TOPICS.map(topic => (
                                <button className={eventForm.topics.includes(topic) ? 'active' : ''} key={topic} type="button" onClick={() => toggleTopic(topic)}>
                                    {topic}
                                </button>
                            ))}
                        </div>
                        <label>Image<input type="file" accept="image/*" onChange={event => setImageFile(event.target.files?.[0] || null)} /></label>
                        <div className="event-toggle-row">
                            <button className={eventForm.location_mode === 'hive' ? 'active' : ''} type="button" onClick={() => updateForm('location_mode', 'hive')}>HIVE</button>
                            <button className={eventForm.location_mode === 'custom' ? 'active' : ''} type="button" onClick={() => updateForm('location_mode', 'custom')}>Other</button>
                        </div>
                        {eventForm.location_mode === 'custom' ? (
                            <div className="event-create-grid">
                                <label>Location<input value={eventForm.location_name} onChange={event => updateForm('location_name', event.target.value)} /></label>
                                <label>Address<input value={eventForm.location_address} onChange={event => updateForm('location_address', event.target.value)} /></label>
                            </div>
                        ) : (
                            <p className="platform-subtitle">{HIVE_LOCATION.address}</p>
                        )}
                        {!editingEvent ? (
                            <>
                                <label className="event-checkbox">
                                    <input type="checkbox" checked={eventForm.book_room} onChange={event => updateForm('book_room', event.target.checked)} />
                                    Request HIVE room
                                </label>
                                {eventForm.book_room ? (
                                    <label>Room<select value={eventForm.space_slug} onChange={event => updateForm('space_slug', event.target.value)} required>
                                        <option value="">Choose room</option>
                                        {spaces.map(space => <option key={space.slug} value={space.slug}>{space.title}</option>)}
                                    </select></label>
                                ) : null}
                            </>
                        ) : null}
                        <button className="btn primary" type="submit" disabled={savingEvent}>{savingEvent ? 'Saving...' : editingEvent ? 'Update event' : 'Save event'}</button>
                        {saveMessage ? <p className="platform-subtitle">{saveMessage}</p> : null}
                    </form>
                </div>
            ) : null}
        </div>
    );
}
