'use client';

import { useMemo, useState } from 'react';
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

export default function NewSiteForm() {
    const router = useRouter();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);

    const [repo, setRepo] = useState('');
    const [framework, setFramework] = useState('next');
    const [domain, setDomain] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

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
                    domain: normalizedDomain
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
    );
}
