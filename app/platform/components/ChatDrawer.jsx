'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getDisplayName, usePlatformSession } from '../PlatformContext';

export default function ChatDrawer() {
    const { user, profile, supabase } = usePlatformSession();
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');
    const [error, setError] = useState('');

    const listRef = useRef(null);
    const name = useMemo(() => getDisplayName({ user, profile }), [profile, user]);

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

    const send = async event => {
        event.preventDefault();
        const trimmed = text.trim();
        if (!trimmed) return;

        setError('');
        const { error } = await supabase.from('chat_messages').insert({
            channel: 'members',
            user_id: user.id,
            user_name: name,
            body: trimmed
        });

        if (error) {
            setError(error.message);
            return;
        }

        setText('');
    };

    return (
        <>
            <button
                type="button"
                className={`platform-chat-toggle ${open ? 'open' : ''}`}
                aria-label={open ? 'Close chat' : 'Open chat'}
                onClick={() => setOpen(v => !v)}
            >
                {open ? '→' : '←'}
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

                {error && <p className="platform-message error">{error}</p>}

                <div className="platform-chat-list" ref={listRef}>
                    {messages.length ? (
                        messages.map(msg => (
                            <div
                                key={msg.id}
                                className={`platform-chat-msg ${msg.user_id === user?.id ? 'own' : ''}`}
                            >
                                <div className="platform-chat-meta">
                                    <span className="platform-chat-author">{msg.user_name}</span>
                                    <span className="platform-chat-time">
                                        {new Date(msg.created_at).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </span>
                                </div>
                                <div className="platform-chat-body">{msg.body}</div>
                            </div>
                        ))
                    ) : (
                        <p className="platform-subtitle">No messages yet.</p>
                    )}
                </div>

                <form className="platform-chat-form" onSubmit={send}>
                    <label className="platform-chat-input">
                        <span className="sr-only">Message</span>
                        <input
                            type="text"
                            value={text}
                            onChange={e => setText(e.target.value)}
                            placeholder="Write a message…"
                            autoComplete="off"
                        />
                    </label>
                    <button className="btn primary" type="submit" disabled={!text.trim()}>
                        Send
                    </button>
                </form>
            </aside>
        </>
    );
}
