'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export const dynamic = 'force-dynamic';

function formatTimestamp(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
}

async function readJsonResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return response.json();

    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return { _raw: text };
    }
}

export default function SiteDevModePage({ params }) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);

    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const [site, setSite] = useState(null);
    const [session, setSession] = useState(null);
    const [branch, setBranch] = useState('main');

    const authHeader = async () => {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) throw new Error('No session token. Please sign in again.');
        return { Authorization: `Bearer ${token}` };
    };

    async function loadSession() {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/dev/sessions?site_id=${encodeURIComponent(params.id)}`, {
                headers: { Accept: 'application/json', ...(await authHeader()) }
            });
            const body = await readJsonResponse(res);
            if (!res.ok) {
                throw new Error(body?.detail || body?.error || 'Could not load Dev Mode session.');
            }

            setSite(body?.site || null);
            setSession(body?.session || null);
            setBranch(body?.session?.branch || 'main');
        } catch (e) {
            setError(e?.message || 'Could not load Dev Mode session.');
        } finally {
            setLoading(false);
        }
    }

    async function runAction(action) {
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/dev/sessions', {
                method: 'POST',
                headers: { 'content-type': 'application/json', Accept: 'application/json', ...(await authHeader()) },
                body: JSON.stringify({ site_id: params.id, action, branch })
            });
            const body = await readJsonResponse(res);
            if (!res.ok) {
                throw new Error(body?.detail || body?.error || 'Dev Mode action failed.');
            }
            setSite(body?.site || site);
            setSession(body?.session || null);
            setBranch(body?.session?.branch || branch);
        } catch (e) {
            setError(e?.message || 'Dev Mode action failed.');
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        void loadSession();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.id]);

    const status = session?.status || '—';
    const previewUrl = session?.preview_url || '';
    const editorUrl = session?.editor_url || '';

    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Dev Mode</h1>
                    <p className="platform-subtitle">Pull, run, and live-edit this site on your on-prem Hive server.</p>
                    {site?.repo ? (
                        <p className="platform-subtitle">
                            <span className="platform-mono">{site.repo}</span> • <span className="platform-mono">{site.framework}</span>
                        </p>
                    ) : null}
                </div>
                <div className="platform-actions">
                    <Link className="btn ghost" href={`/platform/sites/${params.id}`}>
                        Back to site
                    </Link>
                </div>
            </div>

            {error ? <p className="platform-message error">{error}</p> : null}

            {loading ? (
                <p className="platform-subtitle">Loading…</p>
            ) : (
                <>
                    <section className="platform-card" aria-label="Dev mode session">
                        <h2 style={{ marginTop: 0 }}>Session</h2>
                        <p className="platform-subtitle">
                            Starts a workspace on your on-prem server, then exposes a preview URL and (optionally) an editor URL.
                        </p>

                        <div className="platform-table-wrap" style={{ marginTop: '1rem' }}>
                            <table className="platform-table">
                                <tbody>
                                    <tr>
                                        <th>Status</th>
                                        <td className="platform-mono">{status}</td>
                                    </tr>
                                    <tr>
                                        <th>Branch</th>
                                        <td>
                                            <input
                                                className="table-input platform-mono"
                                                value={branch}
                                                onChange={e => setBranch(e.target.value)}
                                                placeholder="main"
                                                style={{ maxWidth: 320 }}
                                                disabled={busy}
                                            />
                                        </td>
                                    </tr>
                                    <tr>
                                        <th>Preview</th>
                                        <td>
                                            {previewUrl ? (
                                                <a className="platform-link platform-mono" href={previewUrl} target="_blank" rel="noopener noreferrer">
                                                    {previewUrl}
                                                </a>
                                            ) : (
                                                <span className="platform-subtitle">—</span>
                                            )}
                                        </td>
                                    </tr>
                                    <tr>
                                        <th>Editor</th>
                                        <td>
                                            {editorUrl ? (
                                                <a className="platform-link platform-mono" href={editorUrl} target="_blank" rel="noopener noreferrer">
                                                    {editorUrl}
                                                </a>
                                            ) : (
                                                <span className="platform-subtitle">—</span>
                                            )}
                                        </td>
                                    </tr>
                                    <tr>
                                        <th>Workspace</th>
                                        <td className="platform-mono">{session?.workspace_path || '—'}</td>
                                    </tr>
                                    <tr>
                                        <th>Updated</th>
                                        <td className="platform-mono">{formatTimestamp(session?.updated_at)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {session?.last_error ? (
                            <p className="platform-message error" style={{ marginTop: '1rem' }}>
                                <span className="platform-mono">{session.last_error}</span>
                            </p>
                        ) : null}

                        <div className="platform-actions" style={{ marginTop: '1rem' }}>
                            <button
                                className="btn primary"
                                type="button"
                                onClick={() => runAction('start')}
                                disabled={busy || status === 'running' || status === 'starting'}
                            >
                                {busy ? 'Working…' : status === 'running' ? 'Running' : 'Start'}
                            </button>
                            <button className="btn secondary" type="button" onClick={() => runAction('restart')} disabled={busy}>
                                Restart
                            </button>
                            <button
                                className="btn ghost"
                                type="button"
                                onClick={() => runAction('stop')}
                                disabled={busy || status === 'stopped' || status === 'stopping'}
                            >
                                Stop
                            </button>
                            <button className="btn ghost" type="button" onClick={loadSession} disabled={busy}>
                                Refresh
                            </button>
                        </div>
                    </section>

                    <section className="platform-card" style={{ marginTop: '1.25rem' }} aria-label="Live coding">
                        <h2 style={{ marginTop: 0 }}>Live coding</h2>
                        <p className="platform-subtitle">
                            Next up: a Base44/Codex-style editor + AI assistant wired to this workspace. For now, use the Editor URL (code-server)
                            or SSH into the on-prem server workspace and push your changes to GitHub.
                        </p>
                        <p className="platform-message info" style={{ marginTop: '0.75rem' }}>
                            All users share a single server-side AI key (no per-user key management in the UI).
                        </p>
                    </section>
                </>
            )}
        </main>
    );
}

