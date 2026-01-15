'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePlatformSession } from './PlatformContext';

const ChatReadContext = createContext(null);
const CHAT_CHANNEL = 'members';
const FALLBACK_READ_AT = new Date(0).toISOString();

function normalizeTimestamp(value) {
    if (!value) return null;
    const ts = new Date(value);
    if (!Number.isFinite(ts.getTime())) return null;
    return ts.toISOString();
}

function getReadCutoff(value) {
    return normalizeTimestamp(value) || FALLBACK_READ_AT;
}

export function ChatReadProvider({ children }) {
    const { user, supabase } = usePlatformSession();
    const [lastReadAt, setLastReadAt] = useState(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const lastReadRef = useRef(null);

    useEffect(() => {
        lastReadRef.current = lastReadAt;
    }, [lastReadAt]);

    const refreshUnread = useCallback(
        async overrideLastReadAt => {
            if (!user) return;
            const cutoff = getReadCutoff(overrideLastReadAt || lastReadRef.current);
            const { count, error } = await supabase
                .from('chat_messages')
                .select('id', { count: 'exact', head: true })
                .eq('channel', CHAT_CHANNEL)
                .gt('created_at', cutoff)
                .neq('user_id', user.id);

            if (error) return;
            setUnreadCount(count || 0);
        },
        [supabase, user]
    );

    useEffect(() => {
        let cancelled = false;
        if (!user) {
            setLastReadAt(null);
            setUnreadCount(0);
            return;
        }

        const load = async () => {
            const { data, error } = await supabase
                .from('chat_read_states')
                .select('last_read_at')
                .eq('channel', CHAT_CHANNEL)
                .eq('user_id', user.id)
                .maybeSingle();

            if (cancelled) return;

            if (error) {
                const msg = error?.message || '';
                if (msg.includes('chat_read_states')) return;
                setLastReadAt(null);
                setUnreadCount(0);
                return;
            }

            const nextReadAt = normalizeTimestamp(data?.last_read_at);
            setLastReadAt(nextReadAt);
            await refreshUnread(nextReadAt);
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [refreshUnread, supabase, user]);

    useEffect(() => {
        if (!user) return;
        const channel = supabase
            .channel('chat:members:unread')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'channel=eq.members' },
                payload => {
                    const row = payload.new;
                    if (!row || row.user_id === user.id) return;
                    const messageTs = new Date(row.created_at).getTime();
                    const lastReadTs = lastReadRef.current ? new Date(lastReadRef.current).getTime() : 0;
                    if (Number.isFinite(messageTs) && messageTs > lastReadTs) {
                        setUnreadCount(count => count + 1);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, user]);

    const markRead = useCallback(
        async at => {
            if (!user) return;
            const nextReadAt = normalizeTimestamp(at) || new Date().toISOString();
            lastReadRef.current = nextReadAt;
            setLastReadAt(nextReadAt);
            setUnreadCount(0);

            const { error } = await supabase.from('chat_read_states').upsert(
                {
                    user_id: user.id,
                    channel: CHAT_CHANNEL,
                    last_read_at: nextReadAt
                },
                { onConflict: 'user_id,channel' }
            );

            if (error) {
                const msg = error?.message || '';
                if (msg.includes('chat_read_states')) return;
            }
        },
        [supabase, user]
    );

    return (
        <ChatReadContext.Provider value={{ lastReadAt, unreadCount, markRead, refreshUnread }}>
            {children}
        </ChatReadContext.Provider>
    );
}

export function useChatRead() {
    const ctx = useContext(ChatReadContext);
    if (!ctx) {
        throw new Error('useChatRead must be used within ChatReadProvider');
    }
    return ctx;
}
