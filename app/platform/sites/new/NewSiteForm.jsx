'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

function normalizeRepo(value) {
    const repo = String(value || '')
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/^github\.com\//i, '');

    const withoutGitSuffix = repo.replace(/\.git$/i, '').replace(/\/$/, '');

    if (!/^[^/\s]+\/[^/\s]+$/.test(withoutGitSuffix)) {
        return null;
    }

    return withoutGitSuffix;
}

function normalizeDomain(value) {
    const domain = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//i, '')
        .replace(/\/$/, '');

    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)) {
        return null;
    }

    return domain;
}

async function readJsonResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        return response.json();
    }

    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return { _raw: text };
    }
}

export default function NewSiteForm() {
    const router = useRouter();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);

    const [repo, setRepo] = useState('');
    const [framework, setFramework] = useState('next');
    const [domain, setDomain] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const [installationId, setInstallationId] = useState('');
    const [showGithubModal, setShowGithubModal] = useState(false);
    const [repos, setRepos] = useState([]);
    const [repoQuery, setRepoQuery] = useState('');
    const [repoError, setRepoError] = useState('');
    const [loadingRepos, setLoadingRepos] = useState(false);
    const [showRepoModal, setShowRepoModal] = useState(false);

    const authHeader = async () => {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) throw new Error('No session token. Please sign in again.');
        return { Authorization: `Bearer ${token}` };
    };

    useEffect(() => {
        try {
            const existing = window.localStorage.getItem('github_installation_new_site') || '';
            if (existing && !installationId) setInstallationId(existing);
        } catch {
            // ignore
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function connectGitHub() {
        const appSlug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'hive-deploy';
        const returnTo = typeof window !== 'undefined' ? window.location.origin + '/platform/sites/new' : '';
        const state = encodeURIComponent(JSON.stringify({ storageKey: 'github_installation_new_site', returnTo }));
        const url = `https://github.com/apps/${appSlug}/installations/new?state=${state}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    function chooseRepo() {
        setRepoError('');
        setShowRepoModal(true);
        if (!repos.length && installationId) {
            void loadRepos();
        }
    }

    async function loadRepos(page = 1) {
        try {
            setRepoError('');
            setLoadingRepos(true);
            if (!installationId) {
                setRepoError('Missing installation. Click Connect GitHub first or enter the installation ID.');
                setRepos([]);
                setLoadingRepos(false);
                return;
            }
            const res = await fetch(`/api/github/repos?installation_id=${encodeURIComponent(installationId)}&per_page=100&page=${page}`, {
                headers: { Accept: 'application/json', ...(await authHeader()) }
            });
            const body = await readJsonResponse(res);
            if (!res.ok) {
                setRepoError(body?.detail || body?.error || 'Could not load repositories.');
                setRepos([]);
                setLoadingRepos(false);
                return;
            }
            setRepos(Array.isArray(body.repositories) ? body.repositories : []);
        } catch (e) {
            setRepoError(e?.message || 'Could not load repositories.');
            setRepos([]);
        } finally {
            setLoadingRepos(false);
        }
    }

    const submit = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');

        try {
            const normalizedRepo = normalizeRepo(repo);
            const normalizedDomain = normalizeDomain(domain);
            const normalizedFramework = String(framework || '').trim();

            if (!normalizedRepo) throw new Error('Repo must be in the form owner/repo.');
            if (!normalizedDomain) throw new Error('Domain must be a hostname like example.com.');
            if (!['next', 'static', 'node'].includes(normalizedFramework)) {
                throw new Error('Framework must be next, static, or node.');
            }

            const { data: authData, error: authError } = await supabase.auth.getUser();
            if (authError || !authData?.user) throw new Error('You must be signed in to create a site.');

            const { data, error } = await supabase
                .from('sites')
                .insert({
                    owner_id: authData.user.id,
                    repo: normalizedRepo,
                    framework: normalizedFramework,
                    domain: normalizedDomain,
                    github_installation_id: Number.isFinite(Number(installationId)) ? Number(installationId) : null
                })
                .select('id')
                .single();

            if (error) {
                if (error.code === '23505') {
                    throw new Error('That domain is already in use.');
                }
                throw new Error(error.message);
            }

            router.push(`/platform/sites/${data.id}`);
            router.refresh();
        } catch (err) {
            setError(err?.message || 'Could not create site.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <form className="contact-form" onSubmit={submit}>
                <label>
                    GitHub repo
                    <input
                        type="text"
                        name="repo"
                        placeholder="owner/repo"
                        autoComplete="off"
                        required
                        value={repo}
                        onChange={e => setRepo(e.target.value)}
                        disabled={busy}
                    />
                </label>

                <div className="platform-actions" style={{ marginTop: '0.75rem' }}>
                    <button className="btn ghost" type="button" onClick={() => setShowGithubModal(true)} disabled={busy}>
                        Connect GitHub
                    </button>
                    <button className="btn secondary" type="button" onClick={chooseRepo} disabled={busy}>
                        Choose repo
                    </button>
                    <span className="platform-subtitle">
                        {installationId ? (
                            <>
                                GitHub installed: <span className="platform-mono">{installationId}</span>
                            </>
                        ) : (
                            'Not connected'
                        )}
                    </span>
                </div>

            <label>
                Framework
                <select name="framework" value={framework} onChange={e => setFramework(e.target.value)} required disabled={busy}>
                    <option value="next">next</option>
                    <option value="static">static</option>
                    <option value="node">node</option>
                </select>
            </label>
            <label>
                Domain
                <input
                    type="text"
                    name="domain"
                    placeholder="example.com"
                    autoComplete="off"
                    required
                    value={domain}
                    onChange={e => setDomain(e.target.value)}
                    disabled={busy}
                />
            </label>

            {error && <p className="platform-message error">{error}</p>}

            <div className="platform-actions">
                <button className="btn primary" type="submit" disabled={busy}>
                    {busy ? 'Creating…' : 'Create site'}
                </button>
            </div>
            </form>

            {showGithubModal ? (
                <div className="platform-modal-overlay" role="presentation" onMouseDown={() => setShowGithubModal(false)}>
                    <div className="platform-modal" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation()}>
                        <div className="platform-modal-header">
                            <div>
                                <h2 style={{ margin: 0 }}>Connect GitHub</h2>
                                <p className="platform-subtitle">Install the Hive Deploy GitHub App to browse repositories.</p>
                            </div>
                            <button className="btn ghost" type="button" onClick={() => setShowGithubModal(false)}>
                                Close
                            </button>
                        </div>

                        <ul className="platform-subtitle" style={{ marginTop: '1rem' }}>
                            <li>We’ll open GitHub in a new tab. Complete installation there, then return here.</li>
                            <li>
                                Choose access: <span className="platform-mono">All repositories</span> (recommended) or{' '}
                                <span className="platform-mono">Only select repositories</span>.
                            </li>
                        </ul>

                        <div className="platform-card-actions">
                            <button className="btn primary" type="button" onClick={connectGitHub}>
                                Open GitHub
                            </button>
                            <button
                                className="btn secondary"
                                type="button"
                                onClick={() => {
                                    setShowGithubModal(false);
                                    try {
                                        const existing = window.localStorage.getItem('github_installation_new_site') || '';
                                        if (existing) setInstallationId(existing);
                                    } catch {
                                        // ignore
                                    }
                                }}
                            >
                                I’ve installed it
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {showRepoModal ? (
                <div className="platform-modal-overlay" role="presentation" onMouseDown={() => setShowRepoModal(false)}>
                    <div className="platform-modal" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation()}>
                        <div className="platform-modal-header">
                            <div>
                                <h2 style={{ margin: 0 }}>Choose a repository</h2>
                                <p className="platform-subtitle">Select from repositories the Hive Deploy app can access.</p>
                            </div>
                            <button className="btn ghost" type="button" onClick={() => setShowRepoModal(false)}>
                                Close
                            </button>
                        </div>

                        <div className="platform-actions" style={{ gap: '0.5rem', marginTop: '1rem' }}>
                            <input
                                className="table-input platform-mono"
                                placeholder="Installation ID"
                                value={installationId}
                                onChange={e => setInstallationId(e.target.value)}
                                style={{ maxWidth: 260 }}
                                disabled={busy}
                            />
                            <button className="btn secondary" type="button" onClick={() => loadRepos()} disabled={loadingRepos || busy}>
                                {loadingRepos ? 'Loading…' : 'Load repos'}
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
                                                return String(r.full_name || '').toLowerCase().includes(q);
                                            })
                                            .map(r => (
                                                <tr key={r.id}>
                                                    <td className="platform-mono">{r.full_name}</td>
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
                                            <td colSpan={3} className="platform-subtitle">
                                                {loadingRepos ? 'Loading…' : 'No repositories loaded.'}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
