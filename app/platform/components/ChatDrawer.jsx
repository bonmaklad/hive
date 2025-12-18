'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlatformSession } from '../PlatformContext';

function getDefaultName(user) {
    const name = user?.user_metadata?.name || user?.user_metadata?.full_name || '';
    if (name) return String(name);
    const email = user?.email || '';
    if (email.includes('@')) return email.split('@')[0];
    return 'Member';
}

function makeId() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function storageKey() {
    return 'hive_platform_chat_mock_v1';
}

export default function ChatDrawer() {
    const { user } = usePlatformSession();
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');
    const [info, setInfo] = useState('Welcome to Hive HQ Members Chat');

    const listRef = useRef(null);
    const name = useMemo(() => getDefaultName(user), [user]);

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(storageKey());
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) setMessages(parsed);
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        try {
            window.localStorage.setItem(storageKey(), JSON.stringify(messages.slice(-200)));
        } catch {
            // ignore
        }
    }, [messages]);

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

        setMessages(current => [
            ...current,
            {
                id: makeId(),
                author_id: user?.id || 'local',
                author_name: name,
                body: trimmed,
                created_at: new Date().toISOString()
            }
        ]);
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

                {info && <p className="platform-message info">{info}</p>}

                <div className="platform-chat-list" ref={listRef}>
                    {messages.length ? (
                        messages.map(msg => (
                            <div key={msg.id} className="platform-chat-msg">
                                <div className="platform-chat-meta">
                                    <span className="platform-chat-author">{msg.author_name}</span>
                                    <span className="platform-chat-time">
                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

