import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import StatusBadge from '../../components/StatusBadge';

export const dynamic = 'force-dynamic';

function formatTimestamp(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
}

export default async function SiteDetailPage({ params }) {
    const supabase = createSupabaseServerClient();

    const { data: site, error: siteError } = await supabase.from('sites').select('*').eq('id', params.id).single();

    if (siteError) {
        if (siteError.code === 'PGRST116') {
            notFound();
        }
        throw new Error(siteError.message);
    }

    const { data: deployments, error: deploymentError } = await supabase
        .from('deployments')
        .select('id, status, created_at')
        .eq('site_id', site.id)
        .order('created_at', { ascending: false });

    if (deploymentError) {
        throw new Error(deploymentError.message);
    }

    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1 className="platform-mono">{site.domain}</h1>
                    <p className="platform-subtitle">
                        <span className="platform-mono">{site.repo}</span> • <span className="platform-mono">{site.framework}</span>
                    </p>
                </div>
                <Link className="btn ghost" href="/platform">
                    Back to dashboard
                </Link>
            </div>

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
        </main>
    );
}

