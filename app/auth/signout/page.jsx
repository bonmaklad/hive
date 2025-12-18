'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function SignoutPage() {
    const router = useRouter();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);

    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            try {
                await supabase.auth.signOut();
            } catch (err) {
                if (!cancelled) {
                    setError(err?.message || 'Could not sign out.');
                }
            } finally {
                if (!cancelled) {
                    router.replace('/login');
                    router.refresh();
                }
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [router, supabase]);

    return (
        <main className="platform-shell">
            <div className="platform-card">
                <h1>Signing out…</h1>
                {error && <p className="platform-message error">{error}</p>}
            </div>
        </main>
    );
}

