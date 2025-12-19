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
    const [saving, setSaving] = useState(false);

    // Editable fields
    const [name, setName] = useState('');
    const [domain, setDomain] = useState('');
    const [repo, setRepo] = useState('');
    const [framework, setFramework] = useState('next');
    const [envEntries, setEnvEntries] = useState([]); // [{id, key, value}]

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
                .select('id, owner_id, name, domain, repo, framework, env, created_at')
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

            setSite(site);
            setLoading(false);
        };

        load();
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
                framework: framework.trim() || 'next',
                env: entriesToObject(envEntries)
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
        alert('Connecting GitHub coming soon. For now, paste owner/repo into the Repo field.');
    }

    function chooseRepo() {
        const value = prompt('Enter repo as owner/repo (e.g. vercel/next.js):', repo || '');
        if (value != null) setRepo(value);
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
                            <label>
                                Framework
                                <select value={framework} onChange={e => setFramework(e.target.value)} disabled={saving}>
                                    <option value="next">next</option>
                                    <option value="static">static</option>
                                    <option value="node">node</option>
                                </select>
                            </label>

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
                                    <button className="btn ghost" type="button" onClick={connectGitHub} disabled={saving}>
                                        Connect GitHub
                                    </button>
                                    <button className="btn ghost" type="button" onClick={chooseRepo} disabled={saving}>
                                        Choose repo
                                    </button>
                                </div>
                            </div>

                            <div style={{ marginTop: '1rem' }}>
                                <h3 style={{ margin: 0 }}>Environment variables</h3>
                                <p className="platform-subtitle">Key-value pairs stored in this site’s env (jsonb).</p>
                            </div>

                            <div className="platform-table-wrap">
                                <table className="platform-table" style={{ minWidth: 520 }}>
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
                                                    <td style={{ width: '35%' }}>
                                                        <input
                                                            type="text"
                                                            value={row.key}
                                                            onChange={e => updateEnvRow(row.id, { key: e.target.value })}
                                                            className="platform-mono"
                                                            disabled={saving}
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="text"
                                                            value={row.value}
                                                            onChange={e => updateEnvRow(row.id, { value: e.target.value })}
                                                            className="platform-mono"
                                                            disabled={saving}
                                                        />
                                                    </td>
                                                    <td style={{ width: 1 }}>
                                                        <button
                                                            type="button"
                                                            className="btn secondary"
                                                            onClick={() => removeEnvRow(row.id)}
                                                            disabled={saving}
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
                                <button type="button" className="btn ghost" onClick={addEnvRow} disabled={saving}>
                                    Add variable
                                </button>
                            </div>

                            {error && <p className="platform-message error">{error}</p>}

                            <div className="platform-actions" style={{ marginTop: '1rem' }}>
                                <button className="btn primary" type="submit" disabled={saving}>
                                    {saving ? 'Saving…' : 'Save changes'}
                                </button>
                            </div>
                        </form>
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
                    </section>
                </>
            )}
        </main>
    );
}
