import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import StatusBadge from './components/StatusBadge';

export const dynamic = 'force-dynamic';

function formatTimestamp(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
}

export default async function PlatformDashboardPage() {
    const supabase = createSupabaseServerClient();

    const { data: sites, error } = await supabase
        .from('sites')
        .select('id, domain, repo, framework, created_at, deployments(status, created_at)')
        .order('created_at', { ascending: false })
        .order('created_at', { foreignTable: 'deployments', ascending: false })
        .limit(1, { foreignTable: 'deployments' });

    if (error) {
        throw new Error(error.message);
    }

    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Your sites</h1>
                    <p className="platform-subtitle">Manage domains and track deployment status.</p>
                </div>
                <Link className="btn primary" href="/platform/sites/new">
                    Create site
                </Link>
            </div>

            {sites?.length ? (
                <div className="platform-table-wrap">
                    <table className="platform-table">
                        <thead>
                            <tr>
                                <th>Domain</th>
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

