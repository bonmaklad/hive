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
    const [depModalOpen, setDepModalOpen] = useState(false);
    const [depDetail, setDepDetail] = useState(null);
    const [depDetailLoading, setDepDetailLoading] = useState(false);
    const [depDetailError, setDepDetailError] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingEnv, setSavingEnv] = useState(false);
    const [showGithubModal, setShowGithubModal] = useState(false);

    // Editable fields
    const [name, setName] = useState('');
    const [domain, setDomain] = useState('');
    const [repo, setRepo] = useState('');
    const [framework, setFramework] = useState('next');
    const [envEntries, setEnvEntries] = useState([]); // [{id, key, value}]
    const [installationId, setInstallationId] = useState('');
    const [repos, setRepos] = useState([]);
    const [repoQuery, setRepoQuery] = useState('');
    const [repoError, setRepoError] = useState('');
    const [loadingRepos, setLoadingRepos] = useState(false);
    const [showRepoModal, setShowRepoModal] = useState(false);

    function toEntries(obj) {
        if (!obj || typeof obj !== 'object') return [];
        return Object.entries(obj).map(([k, v], idx) => ({ id: `${idx}-${k}`, key: k, value: String(v ?? '') }));
    }

    function entriesToObject(entries) {
        const out = {};
        for (const row of entries) {
            const k = String(row.key || '').trim();
            if (!k) continue;
            out[k] = row.value ?? '';
        }
        return out;
    }

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setError('');
            setLoading(true);

            const { data: site, error: siteError } = await supabase
                .from('sites')
                .select('id, owner_id, name, domain, repo, framework, env, github_installation_id, created_at')
                .eq('id', params.id)
                .single();

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

            // Initialize editable state
            setName(site.name || '');
            setDomain(site.domain || '');
            setRepo(site.repo || '');
            setFramework(site.framework || 'next');
            setEnvEntries(toEntries(site.env));
            if (site.github_installation_id) setInstallationId(String(site.github_installation_id));

            setSite(site);
            setLoading(false);
        };

        load();
        // Load GitHub installation id saved during app install
        try {
            const key = `github_installation_by_site:${params.id}`;
            const val = window.localStorage.getItem(key);
            if (val) setInstallationId(val);
        } catch {
            // noop
        }
        return () => {
            cancelled = true;
        };
    }, [params.id, supabase]);

    async function saveSite(e) {
        e?.preventDefault?.();
        setSaving(true);
        setError('');
        try {
            const payload = {
                name: name.trim() || null,
                domain: domain.trim(),
                repo: repo.trim(),
                framework: framework.trim() || 'next'
            };

            const { data: updated, error: updError } = await supabase
                .from('sites')
                .update(payload)
                .eq('id', params.id)
                .select('id, name, domain, repo, framework, env')
                .single();
            if (updError) throw updError;

            setSite(prev => ({ ...(prev || {}), ...updated }));
        } catch (err) {
            setError(err?.message || 'Could not save site changes.');
        } finally {
            setSaving(false);
        }
    }

    async function saveEnv(e) {
        e?.preventDefault?.();
        setSavingEnv(true);
        setError('');
        try {
            const envPayload = entriesToObject(envEntries);
            const { data: updated, error: updError } = await supabase
                .from('sites')
                .update({ env: envPayload })
                .eq('id', params.id)
                .select('id, env')
                .single();
            if (updError) throw updError;
            setSite(prev => ({ ...(prev || {}), ...updated }));
        } catch (err) {
            setError(err?.message || 'Could not save environment variables.');
        } finally {
            setSavingEnv(false);
        }
    }

    function addEnvRow() {
        setEnvEntries(list => [...list, { id: `new-${Date.now()}`, key: '', value: '' }]);
    }
    function updateEnvRow(id, patch) {
        setEnvEntries(list => list.map(row => (row.id === id ? { ...row, ...patch } : row)));
    }
    function removeEnvRow(id) {
        setEnvEntries(list => list.filter(row => row.id !== id));
    }

    function connectGitHub() {
        const appSlug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'hive-deploy';
        const returnTo = typeof window !== 'undefined' ? window.location.origin + `/platform/sites/${params.id}` : '';
        const state = encodeURIComponent(JSON.stringify({ siteId: params.id, returnTo }));
        const url = `https://github.com/apps/${appSlug}/installations/new?state=${state}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    function chooseRepo() {
        setRepoError('');
        setShowRepoModal(true);
        if (!repos.length && installationId) {
            // lazy load
            void loadRepos();
        }
    }

    async function loadRepos(page = 1) {
        try {
            setRepoError('');
            setLoadingRepos(true);
            if (!installationId) {
                setRepoError('Missing installation. Click Connect GitHub first or enter the installation ID.');
                setLoadingRepos(false);
                return;
            }
            const res = await fetch(`/api/github/repos?installation_id=${encodeURIComponent(installationId)}&per_page=100&page=${page}`, {
                headers: { Accept: 'application/json' }
            });
            const body = await res.json();
            if (!res.ok) {
                setRepoError(body?.error || 'Could not load repositories.');
                setRepos([]);
                setLoadingRepos(false);
                return;
            }
            setRepos(Array.isArray(body.repositories) ? body.repositories : []);
        } catch (e) {
            setRepoError('Could not load repositories.');
            setRepos([]);
        } finally {
            setLoadingRepos(false);
        }
    }

    const FRAMEWORK_HELP = {
        next: 'Next.js handles front end, API routes, and backend functions in one unified framework.',
        gatsby: 'Gatsby builds fast static sites using React and a data layer, then serves optimised HTML/JS.',
        static: 'Static serves pre-built HTML/CSS/JS. Great for simple sites and export builds from other tools.',
        node: 'Node runs your server application and serves responses directly (bring your own framework).',
        vue: 'Vue is a progressive front-end framework. Use Nuxt or a build tool to generate and serve your app.'
    };

    async function viewDeploymentDetails(depId) {
        try {
            setDepDetailError('');
            setDepDetail(null);
            setDepDetailLoading(true);
            setDepModalOpen(true);

            // Try to fetch rich failure information for this deployment
            const { data, error } = await supabase
                .from('deployments')
                .select('*')
                .eq('id', depId)
                .maybeSingle();

            if (error) {
                setDepDetailError(error.message);
                setDepDetail(null);
            } else {
                setDepDetail(data || null);
            }
        } catch (e) {
            setDepDetailError(e?.message || 'Could not load deployment details.');
            setDepDetail(null);
        } finally {
            setDepDetailLoading(false);
        }
    }

    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1 className="platform-mono">{site?.name || site?.domain || 'Site'}</h1>
                    {site && (
                        <p className="platform-subtitle">
                            <span className="platform-mono">{site.repo}</span> • <span className="platform-mono">{site.framework}</span>
                        </p>
                    )}
                    {site?.id && (
                        <p className="platform-subtitle">
                            Internal URL:{' '}
                            <a
                                className="platform-link"
                                href={`https://${site.id}.hivehq.nz`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {site.id}.hivehq.nz
                            </a>
                        </p>
                    )}
                </div>
                <Link className="btn ghost" href="/platform/hosting">
                    Back to hosting
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
                <>
                    <section className="platform-card" aria-label="Edit site">
                        <h2 style={{ marginTop: 0 }}>Edit site</h2>
                        <p className="platform-subtitle">Update metadata, repo, framework, and environment variables.</p>

                        <form className="contact-form" onSubmit={saveSite}>
                            <label>
                                Name
                                <input type="text" value={name} onChange={e => setName(e.target.value)} disabled={saving} />
                            </label>
                            <label>
                                Custom domain
                                <input type="text" value={domain} onChange={e => setDomain(e.target.value)} disabled={saving} />
                            </label>
                            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr', alignItems: 'end' }}>
                                <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)' }}>
                                    <div>
                                        <label>
                                            Framework
                                            <select value={framework} onChange={e => setFramework(e.target.value)} disabled={saving}>
                                                <option value="next">next</option>
                                                <option value="gatsby">gatsby</option>
                                                <option value="static">static</option>
                                                <option value="node">node</option>
                                                <option value="vue">vue</option>
                                            </select>
                                        </label>
                                        <p className="platform-subtitle" style={{ marginTop: '0.5rem' }}>
                                            All frameworks can be hooked up to your Supabase authentication, data storage and Postgres database.
                                        </p>
                                    </div>
                                    <div>
                                        <p className="platform-message info" style={{ margin: 0 }}>
                                            {FRAMEWORK_HELP[framework] || 'Choose a framework to see how it is handled.'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                                <label>
                                    Repo
                                    <input
                                        type="text"
                                        value={repo}
                                        onChange={e => setRepo(e.target.value)}
                                        placeholder="owner/repo"
                                        disabled={saving}
                                    />
                                </label>
                                <div className="platform-actions">
                                    <button
                                        className="btn ghost"
                                        type="button"
                                        onClick={() => setShowGithubModal(true)}
                                        disabled={saving}
                                    >
                                        Connect GitHub
                                    </button>
                                    <button className="btn ghost" type="button" onClick={chooseRepo} disabled={saving}>
                                        Choose repo
                                    </button>
                                    <span className={`badge ${installationId ? 'success' : 'neutral'}`}>
                                        {installationId ? 'GitHub installed' : 'Not connected'}
                                    </span>
                                </div>
                            </div>

                            {error && <p className="platform-message error">{error}</p>}

                            <div className="platform-actions" style={{ marginTop: '1rem' }}>
                                <button className="btn primary" type="submit" disabled={saving}>
                                    {saving ? 'Saving…' : 'Save changes'}
                                </button>
                            </div>
                        </form>
                    </section>

                    <section className="platform-card" style={{ marginTop: '1.25rem' }} aria-label="Environment variables">
                        <h2 style={{ marginTop: 0 }}>Environment variables</h2>
                        <p className="platform-subtitle">Key-value pairs stored in this site’s env (jsonb).</p>

                        <div className="platform-table-wrap">
                            <table className="platform-table">
                                <thead>
                                    <tr>
                                        <th>Key</th>
                                        <th>Value</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {envEntries.length ? (
                                        envEntries.map(row => (
                                            <tr key={row.id}>
                                                <td style={{ width: '40%' }}>
                                                    <input
                                                        type="text"
                                                        value={row.key}
                                                        onChange={e => updateEnvRow(row.id, { key: e.target.value })}
                                                        className="platform-mono table-input"
                                                        style={{ width: '100%' }}
                                                        disabled={savingEnv}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="text"
                                                        value={row.value}
                                                        onChange={e => updateEnvRow(row.id, { value: e.target.value })}
                                                        className="platform-mono table-input"
                                                        style={{ width: '100%' }}
                                                        disabled={savingEnv}
                                                    />
                                                </td>
                                                <td style={{ width: 1 }}>
                                                    <button
                                                        type="button"
                                                        className="btn secondary"
                                                        onClick={() => removeEnvRow(row.id)}
                                                        disabled={savingEnv}
                                                    >
                                                        Remove
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={3} className="platform-subtitle">
                                                No environment variables.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="platform-actions" style={{ marginTop: '0.75rem' }}>
                            <button type="button" className="btn ghost" onClick={addEnvRow} disabled={savingEnv}>
                                Add variable
                            </button>
                        </div>

                        {error && <p className="platform-message error">{error}</p>}

                        <div className="platform-actions" style={{ marginTop: '1rem' }}>
                            <button className="btn primary" type="button" onClick={saveEnv} disabled={savingEnv}>
                                {savingEnv ? 'Saving…' : 'Save variables'}
                            </button>
                        </div>
                    </section>

                    <section className="platform-card" style={{ marginTop: '1.25rem' }}>
                        <h2>Deployment history</h2>

                    {deployments?.length ? (
                        <div className="platform-table-wrap">
                            <table className="platform-table">
                                <thead>
                                    <tr>
                                        <th>Status</th>
                                        <th>Created at</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {deployments.map(dep => (
                                        <tr key={dep.id}>
                                            <td>
                                                <StatusBadge status={dep.status} />
                                            </td>
                                            <td className="platform-mono">{formatTimestamp(dep.created_at)}</td>
                                            <td style={{ width: 1 }}>
                                                {String(dep.status).toLowerCase() === 'failed' || String(dep.status).toLowerCase() === 'error' ? (
                                                    <button
                                                        className="btn secondary"
                                                        type="button"
                                                        onClick={() => viewDeploymentDetails(dep.id)}
                                                    >
                                                        View details
                                                    </button>
                                                ) : (
                                                    <span className="platform-subtitle">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="platform-subtitle">No deployments yet.</p>
                    )}
                    </section>
                </>
            )}

            {showGithubModal && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="github-modal-title"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.6)',
                        display: 'grid',
                        placeItems: 'center',
                        zIndex: 1000
                    }}
                >
                    <div className="platform-card" style={{ width: 'min(680px, 92vw)' }}>
                        <h2 id="github-modal-title" style={{ marginTop: 0 }}>Connect GitHub</h2>
                        <p className="platform-subtitle">
                            You’ll be redirected to GitHub to install the Hive Deploy app for your account or organization.
                        </p>
                        <ul className="feature-list" style={{ marginTop: '0.75rem' }}>
                            <li>Pick the account/organization where your repo lives.</li>
                            <li>
                                Choose access: <strong>All repositories</strong> (recommended) or <strong>Only select repositories</strong>.
                                You can change this later in GitHub → Settings → Installed GitHub Apps.
                            </li>
                            <li>We’ll open GitHub in a new tab. Complete installation there, then return here and click “I’ve installed it”.</li>
                        </ul>
                        <p className="platform-message info" style={{ marginTop: '0.75rem' }}>
                            Tip: If you plan to add more sites later, choose “All repositories” so you won’t need to reinstall.
                        </p>
                        <div className="platform-actions" style={{ marginTop: '1rem' }}>
                            <button className="btn primary" type="button" onClick={connectGitHub}>
                                Open GitHub
                            </button>
                            <button
                                className="btn secondary"
                                type="button"
                                onClick={() => {
                                    setShowGithubModal(false);
                                    try { window.location.reload(); } catch {}
                                }}
                            >
                                I’ve installed it
                            </button>
                            <button className="btn ghost" type="button" onClick={() => setShowGithubModal(false)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showRepoModal && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="repo-modal-title"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.6)',
                        display: 'grid',
                        placeItems: 'center',
                        zIndex: 1000
                    }}
                >
                    <div className="platform-card" style={{ width: 'min(800px, 95vw)' }}>
                        <h2 id="repo-modal-title" style={{ marginTop: 0 }}>Choose a repository</h2>
                        <p className="platform-subtitle">Select from repositories the Hive Deploy app can access.</p>
                        <div className="platform-actions" style={{ gap: '0.5rem' }}>
                            <input
                                className="table-input platform-mono"
                                placeholder="Installation ID"
                                value={installationId}
                                onChange={e => setInstallationId(e.target.value)}
                                style={{ maxWidth: 260 }}
                            />
                            <button className="btn secondary" type="button" onClick={() => loadRepos()} disabled={loadingRepos}>
                                {loadingRepos ? 'Loading…' : 'Load repos'}
                            </button>
                            <button className="btn ghost" type="button" onClick={() => setShowRepoModal(false)}>
                                Close
                            </button>
                        </div>
                        {repoError && <p className="platform-message error" style={{ marginTop: '0.75rem' }}>{repoError}</p>}

                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '1rem' }}>
                            <input
                                className="table-input platform-mono"
                                placeholder="Search repos…"
                                value={repoQuery}
                                onChange={e => setRepoQuery(e.target.value)}
                                style={{ maxWidth: 360 }}
                            />
                        </div>
                        <div className="platform-table-wrap" style={{ marginTop: '0.75rem' }}>
                            <table className="platform-table">
                                <thead>
                                    <tr>
                                        <th>Repository</th>
                                        <th>Default branch</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {repos.length ? (
                                        repos
                                          .filter(r => {
                                            const q = repoQuery.trim().toLowerCase();
                                            if (!q) return true;
                                            return (
                                              r.full_name?.toLowerCase().includes(q) ||
                                              r.name?.toLowerCase().includes(q) ||
                                              r.owner?.toLowerCase().includes(q)
                                            );
                                          })
                                          .map(r => (
                                            <tr key={r.id}>
                                                <td className="platform-mono">
                                                    <a className="platform-link" href={r.html_url} target="_blank" rel="noreferrer noopener">
                                                        {r.full_name}
                                                    </a>
                                                </td>
                                                <td className="platform-mono">{r.default_branch}</td>
                                                <td style={{ width: 1 }}>
                                                    <button
                                                        className="btn primary"
                                                        type="button"
                                                        onClick={() => {
                                                            setRepo(r.full_name);
                                                            setShowRepoModal(false);
                                                        }}
                                                    >
                                                        Use this repo
                                                    </button>
                                                </td>
                                            </tr>
                                          ))
                                    ) : (
                                        <tr>
                                            <td colSpan={3} className="platform-subtitle">{loadingRepos ? 'Loading…' : 'No repositories loaded.'}</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {depModalOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="dep-modal-title"
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 1000 }}
                >
                    <div className="platform-card" style={{ width: 'min(800px, 95vw)' }}>
                        <h2 id="dep-modal-title" style={{ marginTop: 0 }}>Deployment details</h2>
                        {depDetailLoading ? (
                            <p className="platform-subtitle">Loading…</p>
                        ) : depDetailError ? (
                            <p className="platform-message error">{depDetailError}</p>
                        ) : depDetail ? (
                            <>
                                <div className="platform-table-wrap">
                                    <table className="platform-table">
                                        <tbody>
                                            <tr>
                                                <th>Status</th>
                                                <td className="platform-mono">{depDetail.status || '—'}</td>
                                            </tr>
                                            <tr>
                                                <th>Created at</th>
                                                <td className="platform-mono">{formatTimestamp(depDetail.created_at)}</td>
                                            </tr>
                                            <tr>
                                                <th>Reason</th>
                                                <td className="platform-mono">{depDetail.error_reason || depDetail.error || depDetail.error_message || '—'}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                {(depDetail.logs || depDetail.output || depDetail.details) && (
                                    <div style={{ marginTop: '1rem' }}>
                                        <h3 style={{ marginTop: 0 }}>Raw details</h3>
                                        <pre className="platform-mono" style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
{JSON.stringify({ logs: depDetail.logs, output: depDetail.output, details: depDetail.details }, null, 2)}
                                        </pre>
                                    </div>
                                )}
                                {!depDetail.error && !depDetail.error_message && !depDetail.error_reason && !depDetail.logs && !depDetail.output && !depDetail.details && (
                                    <p className="platform-subtitle">No failure details were provided for this deployment.</p>
                                )}
                            </>
                        ) : (
                            <p className="platform-subtitle">No details found.</p>
                        )}

                        <div className="platform-actions" style={{ marginTop: '1rem' }}>
                            <button className="btn ghost" type="button" onClick={() => setDepModalOpen(false)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
