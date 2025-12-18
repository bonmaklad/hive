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

