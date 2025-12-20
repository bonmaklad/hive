'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function GithubInstalledPage() {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const search = useSearchParams();

    const [message, setMessage] = useState('Completing GitHub connection…');
    const [backHref, setBackHref] = useState('/platform/hosting');

    useEffect(() => {
        const installationId = search.get('installation_id');
        const setupAction = search.get('setup_action');
        const rawState = search.get('state');

        let returnTo = '/platform/hosting';
        let siteId = null;
        let storageKey = null;
        try {
            if (rawState) {
                const parsed = JSON.parse(rawState);
                if (parsed?.returnTo && typeof parsed.returnTo === 'string') returnTo = parsed.returnTo;
                if (parsed?.siteId && typeof parsed.siteId === 'string') siteId = parsed.siteId;
                if (parsed?.storageKey && typeof parsed.storageKey === 'string') storageKey = parsed.storageKey;
            }
        } catch {
            // ignore
        }

        try {
            const u = new URL(returnTo, window.location.origin);
            if (u.origin === window.location.origin) {
                setBackHref(u.pathname + u.search + u.hash);
            } else {
                setBackHref('/platform/hosting');
            }
        } catch {
            setBackHref('/platform/hosting');
        }

        if (installationId) {
            try {
                if (siteId) {
                    const key = `github_installation_by_site:${siteId}`;
                    window.localStorage.setItem(key, installationId);
                    // Try to persist to Supabase as well (sites.github_installation_id)
                    // Best-effort; ignore errors if column/policy not present.
                    supabase
                        .from('sites')
                        .update({ github_installation_id: installationId })
                        .eq('id', siteId)
                        .then(() => {})
                        .catch(() => {});
                } else if (storageKey) {
                    window.localStorage.setItem(storageKey, installationId);
                    } else {
                        // Fallback for pages without a siteId (e.g., create new site)
                        window.localStorage.setItem('github_installation_latest', installationId);
                }
            } catch {
                // ignore storage errors
            }
            setMessage(`GitHub App installed (installation ${installationId}). You can close this tab and return to HIVE.`);
        } else if (setupAction === 'cancel') {
            setMessage('GitHub App installation was cancelled.');
        } else {
            setMessage('Could not verify GitHub installation.');
        }
    }, [search, supabase]);

    return (
        <main className="platform-main">
            <div className="platform-card">
                <h1>GitHub connection</h1>
                <p className="platform-subtitle">{message}</p>
                <p className="platform-footer">
                    <Link className="btn ghost" href={backHref}>Back</Link>
                </p>
            </div>
        </main>
    );
}
