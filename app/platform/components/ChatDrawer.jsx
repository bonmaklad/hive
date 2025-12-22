'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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

function copyToClipboard(text) {
    const value = typeof text === 'string' ? text : '';
    if (!value) return false;

    try {
        if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(value);
            return true;
        }
    } catch (_) {}

    try {
        window.prompt('Copy this link:', value);
        return true;
    } catch (_) {
        return false;
    }
}

export default function ChatDrawer({ mode = 'drawer' }) {
    const { user, profile, supabase } = usePlatformSession();
    const isPage = mode === 'page';
    const [open, setOpen] = useState(isPage);
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');
    const [editing, setEditing] = useState(null); // { id, originalBody }
    const [actionMessageId, setActionMessageId] = useState('');
    const [reactionMessageId, setReactionMessageId] = useState('');
    const [error, setError] = useState('');
    const [mentionError, setMentionError] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [mentionedUserIds, setMentionedUserIds] = useState([]);
    const [mentionEveryone, setMentionEveryone] = useState(false);
    const [actionBusy, setActionBusy] = useState(false);
    const [showEmoji, setShowEmoji] = useState(false);
    const [reactionsByMessageId, setReactionsByMessageId] = useState({});

    const listRef = useRef(null);
    const bottomRef = useRef(null);
    const name = useMemo(() => getDisplayName({ user, profile }), [profile, user]);
    const longPressRef = useRef(null);
    const inputRef = useRef(null);
    const loadedReactionsFor = useRef(new Set());

    const [now, setNow] = useState(Date.now());
    const emojis = useMemo(() => ['😀', '😂', '🥰', '😮', '😢', '😡', '👍', '👎', '🙏', '🎉', '🔥', '✅', '❤️'], []);

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60 * 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        if (isPage) setOpen(true);
    }, [isPage]);
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
        let cancelled = false;
        if (!open) return;
        const ids = (messages || []).map(m => m?.id).filter(Boolean);
        const toLoad = ids.filter(id => !loadedReactionsFor.current.has(id));
        if (!toLoad.length) return;

        const loadReactions = async () => {
            try {
                const { data, error } = await supabase
                    .from('chat_message_reactions')
                    .select('id, channel, message_id, user_id, emoji, created_at')
                    .eq('channel', 'members')
                    .in('message_id', toLoad)
                    .order('created_at', { ascending: true });
                if (cancelled) return;
                if (error) throw error;

                for (const id of toLoad) loadedReactionsFor.current.add(id);

                setReactionsByMessageId(current => {
                    const next = { ...(current || {}) };
                    for (const msgId of toLoad) {
                        if (!next[msgId]) next[msgId] = [];
                    }
                    for (const r of data || []) {
                        if (!r?.message_id) continue;
                        const list = next[r.message_id] || [];
                        if (!list.some(x => x.id === r.id)) next[r.message_id] = [...list, r];
                    }
                    return next;
                });
            } catch (_) {
                // No-op: reactions table may not exist yet in some environments.
            }
        };

        loadReactions();
        return () => {
            cancelled = true;
        };
    }, [messages, open, supabase]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;

        const channel = supabase
            .channel('chat:reactions')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'chat_message_reactions', filter: 'channel=eq.members' },
                payload => {
                    if (cancelled) return;
                    const row = payload.new;
                    if (!row?.message_id) return;
                    setReactionsByMessageId(current => {
                        const list = current?.[row.message_id] || [];
                        if (list.some(r => r.id === row.id)) return current;
                        return { ...(current || {}), [row.message_id]: [...list, row] };
                    });
                }
            )
            .on(
                'postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'chat_message_reactions', filter: 'channel=eq.members' },
                payload => {
                    if (cancelled) return;
                    const row = payload.old;
                    const msgId = row?.message_id;
                    const id = row?.id;
                    if (!msgId || !id) return;
                    setReactionsByMessageId(current => {
                        const list = current?.[msgId] || [];
                        const nextList = list.filter(r => r.id !== id);
                        return { ...(current || {}), [msgId]: nextList };
                    });
                }
            )
            .subscribe();

        return () => {
            cancelled = true;
            supabase.removeChannel(channel);
        };
    }, [open, supabase]);

    const scrollToBottom = useCallback(() => {
        const el = listRef.current;
        if (!open || !el) return;
        // Prefer sentinel to handle dynamic heights
        if (bottomRef.current && typeof bottomRef.current.scrollIntoView === 'function') {
            try {
                bottomRef.current.scrollIntoView({ block: 'end' });
                return;
            } catch (_) {}
        }
        el.scrollTop = el.scrollHeight;
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const id = requestAnimationFrame(scrollToBottom);
        return () => cancelAnimationFrame(id);
    }, [messages, open, showEmoji, editing, scrollToBottom]);

    useEffect(() => {
        if (isPage) return;
        const url = new URL(window.location.href);
        if (url.searchParams.get('chat') === '1') setOpen(true);
    }, [isPage]);

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

        setShowEmoji(false);
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
            setReactionMessageId(msg?.id || '');
            longPressRef.current = null;
        }, 420);
    };

    const closeActions = () => {
        if (actionBusy) return;
        setActionMessageId('');
    };

    const closeReactions = () => {
        if (actionBusy) return;
        setReactionMessageId('');
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

    const toggleReaction = async (msg, emoji) => {
        if (!msg?.id || !user?.id) return;
        setActionBusy(true);
        setError('');
        setMentionError('');
        try {
            if (actionMessageId) setActionMessageId('');
            const current = reactionsByMessageId?.[msg.id] || [];
            const existing = current.find(r => r.user_id === user.id && r.emoji === emoji);
            if (existing?.id) {
                const { error } = await supabase.from('chat_message_reactions').delete().eq('id', existing.id);
                if (error) throw error;
                setReactionsByMessageId(map => {
                    const list = map?.[msg.id] || [];
                    return { ...(map || {}), [msg.id]: list.filter(r => r.id !== existing.id) };
                });
            } else {
                const { data, error } = await supabase
                    .from('chat_message_reactions')
                    .insert({ channel: 'members', message_id: msg.id, user_id: user.id, emoji })
                    .select('id, channel, message_id, user_id, emoji, created_at')
                    .single();
                if (error) throw error;
                if (data?.id) {
                    setReactionsByMessageId(map => {
                        const list = map?.[msg.id] || [];
                        if (list.some(r => r.id === data.id)) return map;
                        return { ...(map || {}), [msg.id]: [...list, data] };
                    });
                }
            }
            setReactionMessageId('');
        } catch (err) {
            const msg = err?.message || '';
            const hint = msg.includes('does not exist') && msg.includes('chat_message_reactions') ? ' (Run the `chat_reactions` migration in Supabase.)' : '';
            setError((msg || 'Could not react to message.') + hint);
        } finally {
            setActionBusy(false);
        }
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
    const reactionMsg = useMemo(() => messages.find(m => m.id === reactionMessageId) || null, [reactionMessageId, messages]);

    return (
        <>
            {!isPage ? (
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
            ) : null}

            <aside className={`platform-chat-drawer ${open ? 'open' : ''} ${isPage ? 'page' : ''}`} aria-label="Member chat">
                <div className="platform-chat-header">
                    <div>
                        <div className="platform-chat-title">Member chat</div>
                        <div className="platform-chat-subtitle">Signed in as {name}</div>
                    </div>
                    <div className="platform-actions">
                        {isPage ? null : (
                            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                                Close
                            </button>
                        )}
                    </div>
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
                                    beginLongPress(msg);
                                }}
                                onPointerUp={clearLongPress}
                                onPointerCancel={clearLongPress}
                                onPointerMove={clearLongPress}
                                onContextMenu={event => {
                                    event.preventDefault();
                                    if (msg.user_id === user?.id) setActionMessageId(msg.id);
                                    else setReactionMessageId(msg.id);
                                }}
                            >
                                <div className="platform-chat-meta">
                                    <span className="platform-chat-author">{msg.user_name}</span>
                                    <span className="platform-chat-time" title={new Date(msg.created_at).toLocaleString()}>
                                        {formatRelativeTime(msg.created_at, now)}
                                    </span>
                                </div>
                                <div className="platform-chat-body">{msg.body}</div>
                                {(reactionsByMessageId?.[msg.id] || []).length ? (
                                    <div className="platform-chat-reactions">
                                        {Object.entries(
                                            (reactionsByMessageId?.[msg.id] || []).reduce((acc, r) => {
                                                const emoji = r?.emoji;
                                                if (!emoji) return acc;
                                                const existing = acc[emoji] || { count: 0, mine: false };
                                                existing.count += 1;
                                                if (r.user_id === user?.id) existing.mine = true;
                                                acc[emoji] = existing;
                                                return acc;
                                            }, {})
                                        )
                                            .sort((a, b) => b[1].count - a[1].count)
                                            .slice(0, 6)
                                            .map(([emoji, meta]) => (
                                                <button
                                                    key={emoji}
                                                    type="button"
                                                    className={`platform-chat-reaction ${meta.mine ? 'mine' : ''}`}
                                                    onClick={() => toggleReaction(msg, emoji)}
                                                    disabled={actionBusy}
                                                >
                                                    <span>{emoji}</span>
                                                    <span className="platform-chat-reaction-count">{meta.count}</span>
                                                </button>
                                            ))}
                                    </div>
                                ) : null}
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
                    {/* sentinel to keep view pinned to the latest message */}
                    <div ref={bottomRef} />
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
                            onFocus={() => setTimeout(scrollToBottom, 0)}
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
                                className="platform-chat-actionsheet-item"
                                onClick={() => {
                                    setReactionMessageId(actionMsg.id);
                                    setActionMessageId('');
                                }}
                                disabled={actionBusy}
                            >
                                React
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

                {reactionMsg ? (
                    <div className="platform-chat-actionsheet-overlay" role="presentation" onMouseDown={closeReactions}>
                        <div className="platform-chat-reactsheet" role="dialog" aria-label="React to message" onMouseDown={e => e.stopPropagation()}>
                            <div className="platform-chat-reactsheet-row">
                                {emojis.map(e => (
                                    <button
                                        key={e}
                                        type="button"
                                        className="platform-chat-reactsheet-emoji"
                                        onClick={() => toggleReaction(reactionMsg, e)}
                                        disabled={actionBusy}
                                    >
                                        {e}
                                    </button>
                                ))}
                            </div>
                            <button type="button" className="platform-chat-actionsheet-item" onClick={closeReactions} disabled={actionBusy}>
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : null}
            </aside>
        </>
    );
}
