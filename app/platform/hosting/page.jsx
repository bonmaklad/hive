'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import StatusBadge from '../components/StatusBadge';

export const dynamic = 'force-dynamic';

function formatTimestamp(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
}

export default function PlatformHostingPage() {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [sites, setSites] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setError('');
            setLoading(true);

            const { data, error } = await supabase
                .from('sites')
                .select('id, domain, repo, framework, created_at, deployments(status, created_at)')
                .order('created_at', { ascending: false })
                .order('created_at', { foreignTable: 'deployments', ascending: false })
                .limit(1, { foreignTable: 'deployments' });

            if (cancelled) return;

            if (error) {
                setError(error.message);
                setSites([]);
            } else {
                setSites(data || []);
            }

            setLoading(false);
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [supabase]);

    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Website hosting</h1>
                    <p className="platform-subtitle">Manage your sites and view deployment history.</p>
                </div>
                <Link className="btn primary" href="/platform/sites/new">
                    Create site
                </Link>
            </div>

            {error ? (
                <p className="platform-message error">{error}</p>
            ) : loading ? (
                <p className="platform-subtitle">Loading…</p>
            ) : sites?.length ? (
                <div className="platform-table-wrap">
                    <table className="platform-table">
                        <thead>
                            <tr>
                                <th>Domain</th>
                                <th>Internal URL</th>
                                <th>Repo</th>
                                <th>Framework</th>
                                <th>Latest deploy</th>
                                <th>Deployed at</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sites.map(site => {
                                const latestDeployment = site.deployments?.[0] || null;
                                return (
                                    <tr key={site.id}>
                                        <td>
                                            <Link className="platform-link" href={`/platform/sites/${site.id}`}>
                                                {site.domain}
                                            </Link>
                                        </td>
                                        <td>
                                            <a
                                                className="platform-link"
                                                href={`https://${site.id}.hivehq.nz`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                {site.id}.hivehq.nz
                                            </a>
                                        </td>
                                        <td>{site.repo}</td>
                                        <td className="platform-mono">{site.framework}</td>
                                        <td>
                                            <StatusBadge status={latestDeployment?.status || 'No deployments'} />
                                        </td>
                                        <td className="platform-mono">{formatTimestamp(latestDeployment?.created_at)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="platform-empty">
                    <h2>No sites yet</h2>
                    <p>Create your first site to start tracking deployments.</p>
                    <Link className="btn primary" href="/platform/sites/new">
                        Create your first site
                    </Link>
                </div>
            )}
        </main>
    );
}

