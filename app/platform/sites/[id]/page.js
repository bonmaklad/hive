'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import StatusBadge from '../../components/StatusBadge';

export const dynamic = 'force-dynamic';

function formatTimestamp(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
}

export default function SiteDetailPage({ params }) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [site, setSite] = useState(null);
    const [deployments, setDeployments] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setError('');
            setLoading(true);

            const { data: site, error: siteError } = await supabase.from('sites').select('*').eq('id', params.id).single();

            if (cancelled) return;

            if (siteError) {
                setSite(null);
                setDeployments([]);
                setError(siteError.message);
                setLoading(false);
                return;
            }

            const { data: deployments, error: deploymentError } = await supabase
                .from('deployments')
                .select('id, status, created_at')
                .eq('site_id', site.id)
                .order('created_at', { ascending: false });

            if (cancelled) return;

            if (deploymentError) {
                setError(deploymentError.message);
                setDeployments([]);
            } else {
                setDeployments(deployments || []);
            }

            setSite(site);
            setLoading(false);
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [params.id, supabase]);

    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1 className="platform-mono">{site?.domain || 'Site'}</h1>
                    {site && (
                        <p className="platform-subtitle">
                            <span className="platform-mono">{site.repo}</span> • <span className="platform-mono">{site.framework}</span>
                        </p>
                    )}
                </div>
                <Link className="btn ghost" href="/platform">
                    Back to dashboard
                </Link>
            </div>

            {error ? (
                <p className="platform-message error">{error}</p>
            ) : loading ? (
                <p className="platform-subtitle">Loading…</p>
            ) : !site ? (
                <div className="platform-card">
                    <h2>Site not found</h2>
                    <p className="platform-subtitle">This site might not exist, or you do not have access.</p>
                </div>
            ) : (
                <div className="platform-card">
                    <h2>Deployment history</h2>

                    {deployments?.length ? (
                        <div className="platform-table-wrap">
                            <table className="platform-table">
                                <thead>
                                    <tr>
                                        <th>Status</th>
                                        <th>Created at</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {deployments.map(dep => (
                                        <tr key={dep.id}>
                                            <td>
                                                <StatusBadge status={dep.status} />
                                            </td>
                                            <td className="platform-mono">{formatTimestamp(dep.created_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="platform-subtitle">No deployments yet.</p>
                    )}
                </div>
            )}
        </main>
    );
}
