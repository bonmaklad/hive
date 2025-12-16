'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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

export async function createSite(prevState, formData) {
    const repo = normalizeRepo(formData.get('repo'));
    const domain = normalizeDomain(formData.get('domain'));
    const framework = String(formData.get('framework') || '').trim();

    if (!repo) return { error: 'Repo must be in the form owner/repo.' };
    if (!domain) return { error: 'Domain must be a hostname like example.com.' };
    if (!['next', 'static', 'node'].includes(framework)) return { error: 'Framework must be next, static, or node.' };

    const supabase = createSupabaseServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData?.user) {
        return { error: 'You must be signed in to create a site.' };
    }

    const { data, error } = await supabase
        .from('sites')
        .insert({
            owner_id: authData.user.id,
            repo,
            framework,
            domain
        })
        .select('id')
        .single();

    if (error) {
        if (error.code === '23505') {
            return { error: 'That domain is already in use.' };
        }
        return { error: error.message };
    }

    redirect(`/platform/sites/${data.id}`);
}
