'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePlatformSession } from '../PlatformContext';

function makeId() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function ticketsStorageKey(userId) {
    return `hive_platform_tickets_mock_v1:${userId || 'anon'}`;
}

function getDisplayName(user) {
    return user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email || 'Member';
}

const COLUMNS = [
    { id: 'backlog', title: 'Backlog' },
    { id: 'doing', title: 'Doing' },
    { id: 'done', title: 'Done' }
];

function isAdmin(user) {
    return Boolean(user?.user_metadata?.is_admin);
}

export default function TicketsClient() {
    const { user } = usePlatformSession();
    const admin = isAdmin(user);

    const userId = user?.id || 'local';
    const author = useMemo(() => getDisplayName(user), [user]);

    const [tickets, setTickets] = useState([]);
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(ticketsStorageKey(userId));
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) setTickets(parsed);
        } catch {
            // ignore
        }
    }, [userId]);

    useEffect(() => {
        try {
            window.localStorage.setItem(ticketsStorageKey(userId), JSON.stringify(tickets.slice(-200)));
        } catch {
            // ignore
        }
    }, [tickets, userId]);

    const submit = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setInfo('');

        try {
            const trimmedTitle = title.trim();
            if (!trimmedTitle) throw new Error('Add a title.');
            await new Promise(resolve => setTimeout(resolve, 350));

            setTickets(current => [
                {
                    id: makeId(),
                    owner_id: userId,
                    status: 'backlog',
                    title: trimmedTitle,
                    body: body.trim(),
                    created_at: new Date().toISOString(),
                    created_by: author
                },
                ...current
            ]);

            setTitle('');
            setBody('');
            setInfo('Ticket created.');
        } catch (err) {
            setError(err?.message || 'Could not create ticket.');
        } finally {
            setBusy(false);
        }
    };

    const adminMove = async (ticketId, nextStatus) => {
        if (!admin) return;
        setTickets(current => current.map(t => (t.id === ticketId ? { ...t, status: nextStatus } : t)));
    };

    const byStatus = useMemo(() => {
        const grouped = { backlog: [], doing: [], done: [] };
        tickets.forEach(t => {
            (grouped[t.status] || grouped.backlog).push(t);
        });
        return grouped;
    }, [tickets]);

    return (
        <>
            <section className="platform-card" aria-label="Raise a ticket">
                <h2 style={{ marginTop: 0 }}>Raise a ticket</h2>
                <p className="platform-subtitle">Only you can see your tickets. Admins can move tickets between columns.</p>

                <form className="contact-form" onSubmit={submit}>
                    <label>
                        Title
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            disabled={busy}
                            placeholder="e.g. Door access not working"
                        />
                    </label>
                    <label>
                        Details
                        <textarea
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            disabled={busy}
                            rows={4}
                            placeholder="Add any helpful context…"
                            style={{
                                padding: '0.85rem 1rem',
                                borderRadius: '18px',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                background: 'rgba(18, 20, 27, 0.8)',
                                color: 'var(--text)',
                                fontSize: '1rem'
                            }}
                        />
                    </label>

                    {error && <p className="platform-message error">{error}</p>}
                    {info && <p className="platform-message info">{info}</p>}

                    <div className="platform-actions">
                        <button className="btn primary" type="submit" disabled={busy}>
                            {busy ? 'Submitting…' : 'Submit ticket'}
                        </button>
                    </div>
                </form>
            </section>

            <section className="platform-card" style={{ marginTop: '1.25rem' }} aria-label="Ticket board">
                <div className="platform-kpi-row">
                    <div>
                        <h2 style={{ margin: 0 }}>Board</h2>
                        <p className="platform-subtitle">Backlog → Doing → Done</p>
                    </div>
                    {admin ? <span className="badge success">Admin</span> : <span className="badge neutral">Member</span>}
                </div>

                <div className="platform-kanban" style={{ marginTop: '1rem' }}>
                    {COLUMNS.map(col => (
                        <div key={col.id} className="platform-kanban-col">
                            <div className="platform-kanban-col-title">{col.title}</div>
                            <div className="platform-kanban-col-body">
                                {(byStatus[col.id] || []).length ? (
                                    (byStatus[col.id] || []).map(t => (
                                        <div key={t.id} className="platform-kanban-card">
                                            <div className="platform-kanban-card-title">{t.title}</div>
                                            {t.body ? <div className="platform-subtitle">{t.body}</div> : null}
                                            <div className="platform-kanban-meta">
                                                <span className="platform-mono">
                                                    {new Date(t.created_at).toLocaleDateString()}
                                                </span>
                                                <span className="platform-subtitle">{t.created_by}</span>
                                            </div>

                                            {admin ? (
                                                <div className="platform-card-actions">
                                                    {col.id !== 'backlog' && (
                                                        <button
                                                            type="button"
                                                            className="btn ghost"
                                                            onClick={() => adminMove(t.id, 'backlog')}
                                                        >
                                                            Backlog
                                                        </button>
                                                    )}
                                                    {col.id !== 'doing' && (
                                                        <button
                                                            type="button"
                                                            className="btn ghost"
                                                            onClick={() => adminMove(t.id, 'doing')}
                                                        >
                                                            Doing
                                                        </button>
                                                    )}
                                                    {col.id !== 'done' && (
                                                        <button
                                                            type="button"
                                                            className="btn ghost"
                                                            onClick={() => adminMove(t.id, 'done')}
                                                        >
                                                            Done
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="platform-subtitle" style={{ marginTop: '0.75rem' }}>
                                                    Only admins can move tickets.
                                                </p>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <p className="platform-subtitle">No tickets.</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </>
    );
}

