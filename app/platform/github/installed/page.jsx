'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { useRouter, useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function GithubInstalledPage() {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const router = useRouter();
    const search = useSearchParams();

    const [message, setMessage] = useState('Completing GitHub connection…');

    useEffect(() => {
        const installationId = search.get('installation_id');
        const setupAction = search.get('setup_action');
        const rawState = search.get('state');

        let returnTo = '/platform/hosting';
        let siteId = null;
        try {
            if (rawState) {
                const parsed = JSON.parse(rawState);
                if (parsed?.returnTo && typeof parsed.returnTo === 'string') returnTo = parsed.returnTo;
                if (parsed?.siteId && typeof parsed.siteId === 'string') siteId = parsed.siteId;
            }
        } catch {
            // ignore
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
    }, [router, search]);

    return (
        <main className="platform-main">
            <div className="platform-card">
                <h1>GitHub connection</h1>
                <p className="platform-subtitle">{message}</p>
                <p className="platform-footer">
                    <Link className="btn ghost" href="/platform/hosting">Back to hosting</Link>
                </p>
            </div>
        </main>
    );
}
