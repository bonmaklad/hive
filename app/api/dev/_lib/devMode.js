import { createSupabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseAuth';

export function safeText(value, limit = 200) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

export function isMissing(value) {
    const v = typeof value === 'string' ? value.trim() : '';
    if (!v) return true;
    if (v.toLowerCase() === 'undefined') return true;
    if (v.toLowerCase() === 'null') return true;
    return false;
}

export function isMissingTableError(error) {
    const msg = String(error?.message || error || '');
    return msg.includes('does not exist') && msg.includes('site_dev_sessions');
}

export function hintForMissingTable() {
    return 'Run the Dev Mode migration to create public.site_dev_sessions in Supabase.';
}

export async function requireSiteAccess({ request, siteId }) {
    const { user, error: authError } = await getUserFromRequest(request);
    if (!user) return { ok: false, status: 401, error: authError || 'Unauthorized' };

    const admin = createSupabaseAdminClient();

    const { data: site, error: siteError } = await admin
        .from('sites')
        .select('id, owner_id, name, domain, repo, framework, github_installation_id')
        .eq('id', siteId)
        .maybeSingle();

    if (siteError) return { ok: false, status: 500, error: siteError.message };
    if (!site) return { ok: false, status: 404, error: 'Site not found.' };

    if (site.owner_id === user.id) return { ok: true, admin, user, site, isAdmin: false };

    const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('id, is_admin')
        .eq('id', user.id)
        .maybeSingle();

    if (profileError) return { ok: false, status: 500, error: profileError.message };
    if (!profile?.is_admin) return { ok: false, status: 403, error: 'Not allowed.' };

    return { ok: true, admin, user, site, isAdmin: true };
}

export async function getOrCreateSession({ admin, siteId, userId }) {
    const { data: existing, error } = await admin.from('site_dev_sessions').select('*').eq('site_id', siteId).maybeSingle();
    if (error) throw error;
    if (existing) return existing;

    const { data: created, error: insertError } = await admin
        .from('site_dev_sessions')
        .insert({
            site_id: siteId,
            status: 'stopped',
            branch: 'main',
            requested_by: userId
        })
        .select('*')
        .single();

    if (insertError) throw insertError;
    return created;
}

export async function updateSession({ admin, siteId, patch }) {
    const { data, error } = await admin
        .from('site_dev_sessions')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('site_id', siteId)
        .select('*')
        .single();
    if (error) throw error;
    return data;
}

export function getHiveServerConfig() {
    const baseUrl = safeText(process.env.HIVESERVER_URL, 500).replace(/\/$/, '');
    const token = safeText(process.env.HIVESERVER_TOKEN, 500);

    return {
        baseUrl: isMissing(baseUrl) ? '' : baseUrl,
        token: isMissing(token) ? '' : token
    };
}

async function parseJsonOrText(res) {
    try {
        return await res.json();
    } catch {
        return { error: await res.text().catch(() => '') };
    }
}

export async function callHiveServer({ path, payload, method = 'POST' }) {
    const cfg = getHiveServerConfig();
    if (!cfg.baseUrl) {
        return {
            ok: false,
            status: 501,
            error: 'Dev server not configured.',
            detail: 'Set `HIVESERVER_URL` and `HIVESERVER_TOKEN` on the Next.js server.'
        };
    }
    if (!cfg.token) {
        return {
            ok: false,
            status: 501,
            error: 'Dev server token not configured.',
            detail: 'Set `HIVESERVER_TOKEN` on the Next.js server.'
        };
    }

    const url = `${cfg.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

    let res;
    try {
        res = await fetch(url, {
            method,
            headers: {
                'content-type': 'application/json',
                accept: 'application/json',
                authorization: `Bearer ${cfg.token}`
            },
            body: method === 'GET' ? undefined : JSON.stringify(payload || {})
        });
    } catch (e) {
        return { ok: false, status: 502, error: 'Dev server unreachable.', detail: `${e?.message || String(e)} (${url})` };
    }

    const body = await parseJsonOrText(res);

    if (!res.ok) {
        return {
            ok: false,
            status: res.status,
            error: body?.error || `Dev server error (${res.status}).`,
            detail: body?.detail || null,
            body
        };
    }

    return { ok: true, status: res.status, data: body };
}

export async function callHiveServerWithFallback({ primary, fallback }) {
    const first = await callHiveServer(primary);
    if (first.ok) return first;
    if (first.status !== 404) return first;
    if (!fallback) return first;
    return callHiveServer(fallback);
}

export function normalizeHiveDevSessionPayload(data) {
    const payload = data || {};
    return {
        status: payload?.status || 'running',
        preview_url: payload?.preview_url || payload?.previewUrl || null,
        editor_url: payload?.editor_url || payload?.editorUrl || null,
        workspace_path: payload?.workspace_path || payload?.workspacePath || payload?.workspace || null,
        server_session_id: payload?.server_session_id || payload?.serverSessionId || payload?.server_session || null,
        started_at: payload?.started_at || payload?.startedAt || null
    };
}

export async function runDevSessionAction({ guard, siteId, action, branch }) {
    const normalizedAction = safeText(action, 30).toLowerCase();
    if (!['start', 'stop', 'restart'].includes(normalizedAction)) {
        throw new Error('action must be start, stop, or restart');
    }

    const normalizedBranch = safeText(branch || 'main', 120);
    if (!normalizedBranch) throw new Error('branch is required');

    let session = await getOrCreateSession({ admin: guard.admin, siteId, userId: guard.user.id });

    const requestMeta = {
        requested_by: guard.user.id,
        branch: normalizedBranch
    };

    if (normalizedAction === 'stop') {
        session = await updateSession({
            admin: guard.admin,
            siteId,
            patch: { ...requestMeta, status: 'stopping', last_error: null }
        });

        const res = await callHiveServerWithFallback({
            primary: { path: '/dev/stop', payload: { siteId } },
            fallback: { path: '/v1/dev-sessions/stop', payload: { site_id: siteId } }
        });

        if (!res.ok) {
            session = await updateSession({
                admin: guard.admin,
                siteId,
                patch: { ...requestMeta, status: 'error', last_error: res.detail || res.error }
            });
            return { ok: false, status: res.status, error: res.error, detail: res.detail || null, site: guard.site, session };
        }

        session = await updateSession({
            admin: guard.admin,
            siteId,
            patch: { ...requestMeta, status: 'stopped', preview_url: null, editor_url: null, stopped_at: new Date().toISOString() }
        });

        return { ok: true, status: 200, site: guard.site, session };
    }

    session = await updateSession({
        admin: guard.admin,
        siteId,
        patch: { ...requestMeta, status: 'starting', last_error: null }
    });

    const res = await callHiveServerWithFallback({
        primary: {
            path: normalizedAction === 'restart' ? '/dev/restart' : '/dev/start',
            payload: {
                siteId,
                branch: normalizedBranch
            }
        },
        fallback: {
            path: normalizedAction === 'restart' ? '/v1/dev-sessions/restart' : '/v1/dev-sessions/start',
            payload: {
                site_id: siteId,
                repo: guard.site.repo,
                framework: guard.site.framework,
                branch: normalizedBranch,
                github_installation_id: guard.site.github_installation_id || null
            }
        }
    });

    if (!res.ok) {
        session = await updateSession({
            admin: guard.admin,
            siteId,
            patch: { ...requestMeta, status: 'error', last_error: res.detail || res.error }
        });
        return { ok: false, status: res.status, error: res.error, detail: res.detail || null, site: guard.site, session };
    }

    const data = normalizeHiveDevSessionPayload(res.data || {});

    session = await updateSession({
        admin: guard.admin,
        siteId,
        patch: {
            ...requestMeta,
            status: data?.status || 'running',
            preview_url: data?.preview_url || null,
            editor_url: data?.editor_url || null,
            workspace_path: data?.workspace_path || null,
            server_session_id: data?.server_session_id || null,
            started_at: data?.started_at || new Date().toISOString(),
            last_error: null
        }
    });

    return { ok: true, status: 200, site: guard.site, session };
}
