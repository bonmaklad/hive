'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePlatformSession } from '../PlatformContext';

export default function AdminGuard({ children }) {
    const router = useRouter();
    const { profile } = usePlatformSession();

    useEffect(() => {
        if (profile && !profile.is_admin) {
            router.replace('/platform');
        }
    }, [profile, router]);

    if (!profile) {
        return (
            <div className="platform-card">
                <p className="platform-subtitle">Loading…</p>
            </div>
        );
    }

    if (!profile.is_admin) {
        return (
            <div className="platform-card">
                <h1>Not authorized</h1>
                <p className="platform-subtitle">Admin access required.</p>
            </div>
        );
    }

    return children;
}

