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

const FRAMEWORK_HELP = {
    next: 'Next.js handles front end, API routes, and backend functions in one unified framework.',
    gatsby: 'Gatsby builds fast static sites using React and a data layer, then serves optimised HTML/JS.',
    static: 'Static serves pre-built HTML/CSS/JS. Great for simple sites and export builds from other tools.',
    node: 'Node runs your server application and serves responses directly (bring your own framework).',
    vue: 'Vue is a progressive front-end framework. Use Nuxt or a build tool to generate and serve your app.'
};

export default function NewSiteForm() {
    const router = useRouter();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);

    const [repo, setRepo] = useState('');
    const [name, setName] = useState('');
    const [nameTouched, setNameTouched] = useState(false);
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
            const latest = window.localStorage.getItem('github_installation_latest') || '';
            const found = existing || latest;
            if (found && !installationId) setInstallationId(found);
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
            const trimmedName = String(name || '').trim();
            const normalizedRepo = normalizeRepo(repo);
            const normalizedDomain = normalizeDomain(domain);
            const normalizedFramework = String(framework || '').trim();

            if (!trimmedName) throw new Error('Name is required.');
            if (!normalizedRepo) throw new Error('Repo must be in the form owner/repo.');
            if (!normalizedDomain) throw new Error('Domain must be a hostname like example.com.');
            if (!['next', 'gatsby', 'static', 'node', 'vue'].includes(normalizedFramework)) {
                throw new Error('Framework must be next, gatsby, static, node, or vue.');
            }

            const { data: authData, error: authError } = await supabase.auth.getUser();
            if (authError || !authData?.user) throw new Error('You must be signed in to create a site.');

            const { data, error } = await supabase
                .from('sites')
                .insert({
                    name: trimmedName,
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
                    Custom domain
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

                <label>
                    Name
                    <input
                        type="text"
                        name="name"
                        placeholder="Site name"
                        autoComplete="off"
                        required
                        value={name}
                        onChange={e => {
                            setNameTouched(true);
                            setName(e.target.value);
                        }}
                        disabled={busy}
                    />
                </label>

                <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr', alignItems: 'end' }}>
                    <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)' }}>
                        <div>
                            <label>
                                Framework
                                <select name="framework" value={framework} onChange={e => setFramework(e.target.value)} required disabled={busy}>
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
                            name="repo"
                            placeholder="owner/repo"
                            autoComplete="off"
                            required
                            value={repo}
                            onChange={e => {
                                const nextRepo = e.target.value;
                                setRepo(nextRepo);
                                if (!nameTouched) {
                                    const normalized = normalizeRepo(nextRepo);
                                    if (normalized) {
                                        const repoName = normalized.split('/')[1] || '';
                                        if (repoName) setName(repoName);
                                    }
                                }
                            }}
                            disabled={busy}
                        />
                    </label>

                    <div className="platform-actions">
                        <button className="btn ghost" type="button" onClick={() => setShowGithubModal(true)} disabled={busy}>
                            Connect GitHub
                        </button>
                        <button className="btn ghost" type="button" onClick={chooseRepo} disabled={busy}>
                            Choose repo
                        </button>
                        <span className={`badge ${installationId ? 'success' : 'neutral'}`}>
                            {installationId ? 'GitHub installed' : 'Not connected'}
                        </span>
                    </div>
                </div>

                {error && <p className="platform-message error">{error}</p>}

                <div className="platform-actions" style={{ marginTop: '1rem' }}>
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
                                <p className="platform-subtitle">
                                    You’ll be redirected to GitHub to install the Hive Deploy app for your account or organization.
                                </p>
                            </div>
                            <button className="btn ghost" type="button" onClick={() => setShowGithubModal(false)}>
                                Close
                            </button>
                        </div>

                        <ul className="platform-subtitle" style={{ marginTop: '1rem' }}>
                            <li>
                                Choose access: <span className="platform-mono">All repositories</span> (recommended) or{' '}
                                <span className="platform-mono">Only select repositories</span>. You can change this later in GitHub → Settings →
                                Installed GitHub Apps.
                            </li>
                            <li>We’ll open GitHub in a new tab. Complete installation there, then return here and click “I’ve installed it”.</li>
                        </ul>
                        <p className="platform-message info" style={{ marginTop: '0.75rem' }}>
                            Tip: If you plan to add more sites later, choose “All repositories” so you won’t need to reinstall.
                        </p>

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
                                        const latest = window.localStorage.getItem('github_installation_latest') || '';
                                        const found = existing || latest;
                                        if (found) setInstallationId(found);
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
                                                                if (!nameTouched) {
                                                                    const repoName = String(r.full_name || '').split('/')[1] || '';
                                                                    if (repoName) setName(repoName);
                                                                }
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
