'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getDisplayName, usePlatformSession } from '../PlatformContext';

function getMentionQuery(text) {
    const value = String(text || '');
    const match = value.match(/(^|\\s)@([\\w.+-]{0,64})$/);
    if (!match) return null;
    return match[2] || '';
}

function replaceTrailingMention(text, replacement) {
    return String(text || '').replace(/(^|\\s)@[\\w.+-]{0,64}$/, `$1${replacement} `);
}
function formatRelativeTime(value, nowTs = Date.now()) {
    const ts = typeof value === 'number' ? value : new Date(value).getTime();
    if (!Number.isFinite(ts)) return '';
    let diff = Math.max(0, Math.floor((nowTs - ts) / 1000)); // seconds
    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    const mins = Math.floor(diff / 60);
    if (mins < 60) return mins === 1 ? '1 min ago' : `${mins} mins ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs === 1 ? '1 hr ago' : `${hrs} hrs ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`;
    // Fallback to date for older messages
    const d = new Date(ts);
    return d.toLocaleDateString();
}

export default function ChatDrawer() {
    const { user, profile, supabase } = usePlatformSession();
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');
    const [editing, setEditing] = useState(null); // { id, originalBody }
    const [actionMessageId, setActionMessageId] = useState('');
    const [error, setError] = useState('');
    const [mentionError, setMentionError] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [mentionedUserIds, setMentionedUserIds] = useState([]);
    const [mentionEveryone, setMentionEveryone] = useState(false);
    const [actionBusy, setActionBusy] = useState(false);
    const [showEmoji, setShowEmoji] = useState(false);

    const listRef = useRef(null);
    const name = useMemo(() => getDisplayName({ user, profile }), [profile, user]);
    const longPressRef = useRef(null);
    const inputRef = useRef(null);

    const [now, setNow] = useState(Date.now());
    const emojis = useMemo(() => ['😀', '😂', '🥰', '😮', '😢', '😡', '👍', '👎', '🙏', '🎉', '🔥', '✅', '❤️'], []);

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60 * 1000);
        return () => clearInterval(id);
    }, []);
    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setError('');
            const { data, error } = await supabase
                .from('chat_messages')
                .select('id, user_id, user_name, body, created_at')
                .eq('channel', 'members')
                .order('created_at', { ascending: true })
                .limit(200);

            if (cancelled) return;

            if (error) {
                setError(error.message);
                setMessages([]);
                return;
            }

            setMessages(data || []);
        };

        load();

            const channel = supabase
            .channel('chat:members')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'channel=eq.members' },
                payload => {
                    if (cancelled) return;
                    const row = payload.new;
                    setMessages(current => {
                        if (current.some(m => m.id === row.id)) return current;
                        return [...current, row].slice(-200);
                    });
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: 'channel=eq.members' },
                payload => {
                    if (cancelled) return;
                    const row = payload.new;
                    setMessages(current => current.map(m => (m.id === row.id ? { ...m, ...row } : m)));
                }
            )
            .on(
                'postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: 'channel=eq.members' },
                payload => {
                    if (cancelled) return;
                    const id = payload.old?.id;
                    if (!id) return;
                    setMessages(current => current.filter(m => m.id !== id));
                }
            )
            .subscribe();

        return () => {
            cancelled = true;
            supabase.removeChannel(channel);
        };
    }, [supabase]);

    useEffect(() => {
        if (!open) return;
        const el = listRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [messages, open]);

    useEffect(() => {
        if (!open) return;
        const url = new URL(window.location.href);
        if (url.searchParams.get('chat') === '1') {
            setOpen(true);
        }
    }, [open]);

    useEffect(() => {
        let cancelled = false;
        const query = getMentionQuery(text);
        if (query == null) {
            setShowSuggestions(false);
            setSuggestions([]);
            setMentionError('');
            return () => {
                cancelled = true;
            };
        }

        setShowSuggestions(true);
        setMentionError('');

        const run = async () => {
            if (query.toLowerCase() === 'everyone') {
                setSuggestions([]);
                return;
            }

            if (query.length < 1) {
                setSuggestions([]);
                return;
            }

            try {
                const { data: sessionData } = await supabase.auth.getSession();
                const token = sessionData?.session?.access_token;
                if (!token) throw new Error('No session token.');

                const res = await fetch(`/api/profiles/search?q=${encodeURIComponent(query)}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error || 'Search failed.');

                if (!cancelled) {
                    setSuggestions(Array.isArray(json?.results) ? json.results : []);
                }
            } catch (err) {
                if (!cancelled) {
                    setMentionError(err?.message || 'Could not load mentions.');
                    setSuggestions([]);
                }
            }
        };

        const t = setTimeout(run, 150);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [supabase, text, open]);

    const pickEveryone = () => {
        setMentionEveryone(true);
        setMentionedUserIds([]);
        setText(current => replaceTrailingMention(current, '@everyone'));
        setShowSuggestions(false);
    };

    const pickUser = u => {
        if (!u?.id) return;
        setMentionEveryone(false);
        setMentionedUserIds(current => Array.from(new Set([...current, u.id])));
        const display = u.name ? `@${u.name}` : u.email ? `@${u.email}` : '@member';
        setText(current => replaceTrailingMention(current, display));
        setShowSuggestions(false);
    };

    async function saveEdit(trimmed) {
        if (!editing?.id) return;
        setActionBusy(true);
        setError('');
        setMentionError('');
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData?.session?.access_token;
            if (!token) throw new Error('No session token.');

            const res = await fetch(`/api/chat/messages/${encodeURIComponent(editing.id)}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: trimmed })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Could not edit message.');

            setMessages(current => current.map(m => (m.id === editing.id ? { ...m, body: trimmed } : m)));
            setEditing(null);
            setText('');
            setMentionedUserIds([]);
            setMentionEveryone(false);
            setShowEmoji(false);
        } catch (err) {
            setError(err?.message || 'Could not edit message.');
        } finally {
            setActionBusy(false);
        }
    }

    const send = async event => {
        event.preventDefault();
        const trimmed = text.trim();
        if (!trimmed) return;

        if (editing?.id) {
            await saveEdit(trimmed);
            return;
        }

        setError('');
        setMentionError('');

        const { data: inserted, error: insertError } = await supabase
            .from('chat_messages')
            .insert({
                channel: 'members',
                user_id: user.id,
                user_name: name,
                body: trimmed
            })
            .select('id')
            .single();

        if (insertError) {
            setError(insertError.message);
            return;
        }

        const messageId = inserted?.id;
        if (messageId) {
            try {
                const { data: sessionData } = await supabase.auth.getSession();
                const token = sessionData?.session?.access_token;
                if (token && (mentionEveryone || mentionedUserIds.length)) {
                    const res = await fetch('/api/chat/mentions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            message_id: messageId,
                            mention_everyone: mentionEveryone,
                            mentioned_user_ids: mentionedUserIds
                        })
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        setMentionError(json?.error || 'Could not send mention notifications.');
                    }
                }
            } catch (err) {
                setMentionError(err?.message || 'Could not send mention notifications.');
            }
        }

        setText('');
        setMentionedUserIds([]);
        setMentionEveryone(false);
        setShowEmoji(false);
    };

    const clearLongPress = () => {
        if (longPressRef.current) {
            clearTimeout(longPressRef.current);
            longPressRef.current = null;
        }
    };

    const beginLongPress = msg => {
        clearLongPress();
        longPressRef.current = setTimeout(() => {
            setActionMessageId(msg?.id || '');
            longPressRef.current = null;
        }, 420);
    };

    const closeActions = () => {
        if (actionBusy) return;
        setActionMessageId('');
    };

    const startEdit = msg => {
        if (!msg?.id) return;
        setEditing({ id: msg.id, originalBody: msg.body || '' });
        setText(msg.body || '');
        setActionMessageId('');
        setError('');
        setMentionError('');
        setShowSuggestions(false);
        setSuggestions([]);

        if (open) {
            setTimeout(() => {
                const el = listRef.current;
                if (!el) return;
                el.scrollTop = el.scrollHeight;
            }, 0);
        }
    };

    const cancelEdit = () => {
        if (actionBusy) return;
        setEditing(null);
        setText('');
        setMentionedUserIds([]);
        setMentionEveryone(false);
        setShowSuggestions(false);
        setSuggestions([]);
        setMentionError('');
        setShowEmoji(false);
    };

    const insertEmoji = emoji => {
        const el = inputRef.current;
        if (!el) {
            setText(current => `${current}${emoji}`);
            return;
        }

        const start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
        const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length;
        const currentText = text;
        const next = `${currentText.slice(0, start)}${emoji}${currentText.slice(end)}`;
        const cursor = start + emoji.length;

        setText(next);
        setShowSuggestions(false);
        setSuggestions([]);
        setMentionError('');

        requestAnimationFrame(() => {
            try {
                el.focus();
                el.setSelectionRange(cursor, cursor);
            } catch (_) {}
        });
    };

    const deleteMessage = async msg => {
        if (!msg?.id) return;
        const ok = window.confirm('Delete this message?');
        if (!ok) return;
        setActionBusy(true);
        setError('');
        setMentionError('');
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData?.session?.access_token;
            if (!token) throw new Error('No session token.');

            const res = await fetch(`/api/chat/messages/${encodeURIComponent(msg.id)}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Could not delete message.');

            setMessages(current => current.filter(m => m.id !== msg.id));
            if (editing?.id === msg.id) cancelEdit();
            closeActions();
        } catch (err) {
            setError(err?.message || 'Could not delete message.');
        } finally {
            setActionBusy(false);
        }
    };

    const actionMsg = useMemo(() => messages.find(m => m.id === actionMessageId) || null, [actionMessageId, messages]);

    return (
        <>
            <button
                type="button"
                className={`platform-chat-toggle ${open ? 'open' : 'pulse'}`}
                aria-label={open ? 'Close chat' : 'Open chat'}
                onClick={() => setOpen(v => !v)}
            >
                {open ? (
                    <span className="platform-chat-toggle-arrow">→</span>
                ) : (
                    <>
                        <span className="platform-chat-toggle-label">Join chat</span>
                        <span className="platform-chat-toggle-arrow">←</span>
                    </>
                )}
            </button>

            <aside className={`platform-chat-drawer ${open ? 'open' : ''}`} aria-label="Member chat">
                <div className="platform-chat-header">
                    <div>
                        <div className="platform-chat-title">Member chat</div>
                        <div className="platform-chat-subtitle">Signed in as {name}</div>
                    </div>
                    <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                        Close
                    </button>
                </div>

                <div>
                    {error && <p className="platform-message error">{error}</p>}
                    {mentionError && <p className="platform-message error">{mentionError}</p>}
                </div>

                <div className="platform-chat-list" ref={listRef}>
                    {messages.length ? (
                        messages.map(msg => (
                            <div
                                key={msg.id}
                                className={`platform-chat-msg ${msg.user_id === user?.id ? 'own' : ''} ${
                                    msg.id === editing?.id ? 'editing' : ''
                                }`}
                                onPointerDown={() => {
                                    if (msg.user_id !== user?.id) return;
                                    beginLongPress(msg);
                                }}
                                onPointerUp={clearLongPress}
                                onPointerCancel={clearLongPress}
                                onPointerMove={clearLongPress}
                                onContextMenu={event => {
                                    if (msg.user_id !== user?.id) return;
                                    event.preventDefault();
                                    setActionMessageId(msg.id);
                                }}
                            >
                                <div className="platform-chat-meta">
                                    <span className="platform-chat-author">{msg.user_name}</span>
                                    <span className="platform-chat-time" title={new Date(msg.created_at).toLocaleString()}>
                                        {formatRelativeTime(msg.created_at, now)}
                                    </span>
                                </div>
                                <div className="platform-chat-body">{msg.body}</div>
                                {msg.user_id === user?.id ? (
                                    <button
                                        type="button"
                                        className="platform-chat-more"
                                        aria-label="Message actions"
                                        onClick={() => setActionMessageId(msg.id)}
                                    >
                                        •••
                                    </button>
                                ) : null}
                            </div>
                        ))
                    ) : (
                        <p className="platform-subtitle">No messages yet.</p>
                    )}
                </div>

                <form className="platform-chat-form" onSubmit={send}>
                    {editing?.id ? (
                        <div className="platform-chat-editbar">
                            <span>
                                Editing message
                            </span>
                            <button className="btn ghost" type="button" onClick={cancelEdit} disabled={actionBusy}>
                                Cancel
                            </button>
                        </div>
                    ) : null}
                    <label className="platform-chat-input">
                        <span className="sr-only">Message</span>
                        <input
                            type="text"
                            ref={inputRef}
                            value={text}
                            onChange={e => setText(e.target.value)}
                            placeholder={editing?.id ? 'Edit your message…' : 'Write a message…'}
                            autoComplete="off"
                        />
                        <button
                            className="platform-chat-emoji-toggle"
                            type="button"
                            aria-label="Add emoji"
                            onClick={() => {
                                setShowEmoji(v => !v);
                                setShowSuggestions(false);
                            }}
                        >
                            🙂
                        </button>
                        {showSuggestions && (
                            <div className="platform-chat-suggest">
                                {profile?.is_admin ? (
                                    <button type="button" className="platform-chat-suggest-item" onClick={pickEveryone}>
                                        @everyone
                                        <span className="platform-subtitle">Email all members</span>
                                    </button>
                                ) : null}
                                {suggestions.map(u => (
                                    <button
                                        key={u.id}
                                        type="button"
                                        className="platform-chat-suggest-item"
                                        onClick={() => pickUser(u)}
                                    >
                                        <strong>{u.name || 'Member'}</strong>
                                        <span className="platform-subtitle">{u.email}</span>
                                    </button>
                                ))}
                                {!suggestions.length && getMentionQuery(text)?.length >= 1 && (
                                    <div className="platform-chat-suggest-empty">No matches.</div>
                                )}
                            </div>
                        )}
                        {showEmoji ? (
                            <div className="platform-chat-emoji-picker" role="dialog" aria-label="Emoji picker">
                                {emojis.map(e => (
                                    <button key={e} type="button" className="platform-chat-emoji" onClick={() => insertEmoji(e)}>
                                        {e}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </label>
                    <button className="btn primary" type="submit" disabled={!text.trim() || actionBusy}>
                        {editing?.id ? (actionBusy ? 'Saving…' : 'Save') : 'Send'}
                    </button>
                </form>

                {actionMsg && actionMsg.user_id === user?.id ? (
                    <div className="platform-chat-actionsheet-overlay" role="presentation" onMouseDown={closeActions}>
                        <div className="platform-chat-actionsheet" role="dialog" aria-label="Message actions" onMouseDown={e => e.stopPropagation()}>
                            <button type="button" className="platform-chat-actionsheet-item" onClick={() => startEdit(actionMsg)} disabled={actionBusy}>
                                Edit
                            </button>
                            <button
                                type="button"
                                className="platform-chat-actionsheet-item danger"
                                onClick={() => deleteMessage(actionMsg)}
                                disabled={actionBusy}
                            >
                                Delete
                            </button>
                            <button type="button" className="platform-chat-actionsheet-item" onClick={closeActions} disabled={actionBusy}>
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : null}
            </aside>
        </>
    );
}
