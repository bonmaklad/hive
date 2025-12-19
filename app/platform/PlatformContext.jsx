'use client';

import { createContext, useContext } from 'react';

const PlatformSessionContext = createContext(null);

export function PlatformSessionProvider({ value, children }) {
    return <PlatformSessionContext.Provider value={value}>{children}</PlatformSessionContext.Provider>;
}

export function usePlatformSession() {
    const ctx = useContext(PlatformSessionContext);
    if (!ctx) {
        throw new Error('usePlatformSession must be used within PlatformSessionProvider');
    }
    return ctx;
}

export function getDisplayName({ user, profile }) {
    const profileName = profile?.name;
    if (profileName) return String(profileName);
    const metaName = user?.user_metadata?.name || user?.user_metadata?.full_name;
    if (metaName) return String(metaName);
    const email = user?.email || '';
    if (email.includes('@')) return email.split('@')[0];
    return 'Member';
}
