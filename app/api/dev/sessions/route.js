import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseAuth';

export const runtime = 'nodejs';

function safeText(value, limit = 200) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function isMissing(value) {
    const v = typeof value === 'string' ? value.trim() : '';
    if (!v) return true;
    if (v.toLowerCase() === 'undefined') return true;
    if (v.toLowerCase() === 'null') return true;
    return false;
}

function isMissingTableError(error) {
    const msg = String(error?.message || error || '');
    return msg.includes('does not exist') && msg.includes('site_dev_sessions');
}

function hintForMissingTable() {
    return 'Run the Dev Mode migration to create public.site_dev_sessions in Supabase.';
}

async function getAdminClient() {
    try {
        return createSupabaseAdminClient();
    } catch (e) {
        throw new Error(
            e?.message ||
                'Server Supabase admin key is missing/invalid. Set `SUPABASE_SERVICE_KEY` (service_role key) on the Next.js server.'
        );
    }
}

async function requireSiteAccess({ request, siteId }) {
    const { user, error: authError } = await getUserFromRequest(request);
    if (!user) return { ok: false, status: 401, error: authError || 'Unauthorized' };

    const admin = await getAdminClient();

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

async function getOrCreateSession({ admin, siteId, userId }) {
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

async function updateSession({ admin, siteId, patch }) {
    const { data, error } = await admin
        .from('site_dev_sessions')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('site_id', siteId)
        .select('*')
        .single();
    if (error) throw error;
    return data;
}

function getHiveServerConfig() {
    const baseUrl = safeText(process.env.HIVESERVER_URL, 500).replace(/\/$/, '');
    const token = safeText(process.env.HIVESERVER_TOKEN, 500);

    return {
        baseUrl: isMissing(baseUrl) ? '' : baseUrl,
        token: isMissing(token) ? '' : token
    };
}

function isServerConfigured() {
    const cfg = getHiveServerConfig();
    return Boolean(cfg.baseUrl && cfg.token);
}

async function callHiveServer({ path, payload }) {
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
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                accept: 'application/json',
                authorization: `Bearer ${cfg.token}`
            },
            body: JSON.stringify(payload || {})
        });
    } catch (e) {
        return { ok: false, status: 502, error: 'Dev server unreachable.', detail: e?.message || String(e) };
    }

    let body = null;
    try {
        body = await res.json();
    } catch {
        body = { error: await res.text().catch(() => '') };
    }

    if (!res.ok) {
        return {
            ok: false,
            status: res.status,
            error: body?.error || `Dev server error (${res.status}).`,
            detail: body?.detail || null
        };
    }

    return { ok: true, status: res.status, data: body };
}

export async function GET(request) {
    const url = new URL(request.url);
    const siteId = safeText(url.searchParams.get('site_id'), 60);
    if (!siteId) return NextResponse.json({ error: 'site_id is required' }, { status: 400 });

    const guard = await requireSiteAccess({ request, siteId });
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    try {
        const session = await getOrCreateSession({ admin: guard.admin, siteId, userId: guard.user.id });
        return NextResponse.json({ site: guard.site, session });
    } catch (e) {
        if (isMissingTableError(e)) {
            // Fallback: no DB table; treat Dev Mode as always-on static preview
            const preview = `/__dev/${siteId}`;
            const session = {
                status: 'running',
                preview_url: preview,
                editor_url: null,
                workspace_path: null,
                last_error: null,
                updated_at: new Date().toISOString(),
                branch: 'main'
            };
            return NextResponse.json({ site: guard.site, session });
        }
        return NextResponse.json({ error: e?.message || 'Could not load Dev Mode session.' }, { status: 500 });
    }
}

export async function POST(request) {
    const payload = await request.json().catch(() => ({}));
    const siteId = safeText(payload?.site_id, 60);
    const action = safeText(payload?.action, 30).toLowerCase();
    const branch = safeText(payload?.branch || 'main', 120);

    if (!siteId) return NextResponse.json({ error: 'site_id is required' }, { status: 400 });
    if (!['start', 'stop', 'restart'].includes(action)) {
        return NextResponse.json({ error: 'action must be start, stop, or restart' }, { status: 400 });
    }

    const guard = await requireSiteAccess({ request, siteId });
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    if (!branch) return NextResponse.json({ error: 'branch is required' }, { status: 400 });

    // If the external dev server is not configured, short-circuit with a synthetic session
    if (!isServerConfigured()) {
        const running = action !== 'stop';
        const preview = `/__dev/${siteId}`;
        const fallback = {
            status: running ? 'running' : 'stopped',
            preview_url: running ? preview : null,
            editor_url: null,
            workspace_path: null,
            last_error: null,
            updated_at: new Date().toISOString(),
            branch
        };
        return NextResponse.json({ site: guard.site, session: fallback });
    }

    let session = null;
    try {
        session = await getOrCreateSession({ admin: guard.admin, siteId, userId: guard.user.id });
    } catch (e) {
        if (isMissingTableError(e)) {
            // Fallback behavior without DB: no-op start/stop, return synthetic session
            const preview = `/__dev/${siteId}`;
            const running = action !== 'stop';
            const fallback = {
                status: running ? 'running' : 'stopped',
                preview_url: running ? preview : null,
                editor_url: null,
                workspace_path: null,
                last_error: null,
                updated_at: new Date().toISOString(),
                branch
            };
            return NextResponse.json({ site: guard.site, session: fallback });
        }
        return NextResponse.json({ error: e?.message || 'Could not load Dev Mode session.' }, { status: 500 });
    }

    const requestMeta = {
        requested_by: guard.user.id,
        branch
    };

    try {
        if (action === 'stop') {
            session = await updateSession({
                admin: guard.admin,
                siteId,
                patch: { ...requestMeta, status: 'stopping', last_error: null }
            });

            const res = await callHiveServer({
                path: '/v1/dev-sessions/stop',
                payload: { site_id: siteId }
            });

            if (!res.ok) {
                session = await updateSession({
                    admin: guard.admin,
                    siteId,
                    patch: { ...requestMeta, status: 'error', last_error: res.detail || res.error }
                });
                return NextResponse.json({ error: res.error, detail: res.detail || null, site: guard.site, session }, { status: res.status });
            }

            session = await updateSession({
                admin: guard.admin,
                siteId,
                patch: { ...requestMeta, status: 'stopped', preview_url: null, editor_url: null, stopped_at: new Date().toISOString() }
            });

            return NextResponse.json({ site: guard.site, session });
        }

        session = await updateSession({
            admin: guard.admin,
            siteId,
            patch: { ...requestMeta, status: 'starting', last_error: null }
        });

        const res = await callHiveServer({
            path: action === 'restart' ? '/v1/dev-sessions/restart' : '/v1/dev-sessions/start',
            payload: {
                site_id: siteId,
                repo: guard.site.repo,
                framework: guard.site.framework,
                branch,
                github_installation_id: guard.site.github_installation_id || null
            }
        });

        if (!res.ok) {
            session = await updateSession({
                admin: guard.admin,
                siteId,
                patch: { ...requestMeta, status: 'error', last_error: res.detail || res.error }
            });
            return NextResponse.json({ error: res.error, detail: res.detail || null, site: guard.site, session }, { status: res.status });
        }

        const data = res.data || {};

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

        return NextResponse.json({ site: guard.site, session });
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Dev Mode action failed.' }, { status: 500 });
    }
}
