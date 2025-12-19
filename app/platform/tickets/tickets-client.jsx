'use client';

import { useEffect, useMemo, useState } from 'react';
import { getDisplayName, usePlatformSession } from '../PlatformContext';

const COLUMNS = [
    { id: 'backlog', title: 'Backlog' },
    { id: 'doing', title: 'Doing' },
    { id: 'done', title: 'Done' }
];

function isAdmin(user) {
    return Boolean(user?.user_metadata?.is_admin);
}

export default function TicketsClient() {
    const { user, profile, supabase } = usePlatformSession();
    const admin = Boolean(profile?.is_admin) || isAdmin(user);

    const userId = user?.id || 'local';
    const author = useMemo(() => getDisplayName({ user, profile }), [profile, user]);

    const [tickets, setTickets] = useState([]);
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setError('');
            const query = supabase
                .from('tickets')
                .select('id, owner_id, status, title, body, created_by_name, created_at, updated_at')
                .order('created_at', { ascending: false })
                .limit(200);

            const { data, error } = admin ? await query : await query.eq('owner_id', user.id);
            if (cancelled) return;

            if (error) {
                setError(error.message);
                setTickets([]);
                return;
            }

            setTickets(data || []);
        };

        load();

        const channel = supabase
            .channel('tickets')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
                load();
            })
            .subscribe();

        return () => {
            cancelled = true;
            supabase.removeChannel(channel);
        };
    }, [admin, supabase, user.id]);

    const submit = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setInfo('');

        try {
            const trimmedTitle = title.trim();
            if (!trimmedTitle) throw new Error('Add a title.');
            const { error } = await supabase.from('tickets').insert({
                owner_id: user.id,
                status: 'backlog',
                title: trimmedTitle,
                body: body.trim(),
                created_by_name: author
            });
            if (error) throw error;

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
        const { error } = await supabase.from('tickets').update({ status: nextStatus }).eq('id', ticketId);
        if (error) {
            setError(error.message);
        }
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
                                                <span className="platform-subtitle">{t.created_by_name}</span>
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
