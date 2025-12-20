const http = require('node:http');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function safeText(value, limit = 500) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function json(res, statusCode, data) {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body)
    });
    res.end(body);
}

function readJson(req) {
    return new Promise((resolve, reject) => {
        let buffer = '';
        req.on('data', chunk => {
            buffer += chunk.toString('utf8');
        });
        req.on('end', () => {
            if (!buffer) return resolve({});
            try {
                resolve(JSON.parse(buffer));
            } catch (e) {
                reject(new Error('Invalid JSON body.'));
            }
        });
        req.on('error', reject);
    });
}

function isAuthorized(req) {
    const configured = safeText(process.env.HIVESERVER_TOKEN, 2000);
    if (!configured) return false;
    const auth = safeText(req.headers.authorization, 2200);
    if (!auth.startsWith('Bearer ')) return false;
    const token = auth.slice('Bearer '.length).trim();
    return token && token === configured;
}

function getWorkspaceRoot() {
    const configured = safeText(process.env.HIVESERVER_WORKSPACE_ROOT, 2000);
    return configured || path.join(__dirname, 'workspaces');
}

function getPublicBaseUrl() {
    const configured = safeText(process.env.HIVESERVER_PUBLIC_BASE_URL, 2000).replace(/\/$/, '');
    return configured || 'http://localhost';
}

function getPort() {
    const fromEnv = Number(process.env.HIVESERVER_PORT || process.env.PORT || 8787);
    return Number.isFinite(fromEnv) ? fromEnv : 8787;
}

function isRunnerEnabled() {
    const v = safeText(process.env.HIVESERVER_ENABLE_RUNNER, 20).toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}

function getPreviewPortStart() {
    const fromEnv = Number(process.env.HIVESERVER_PREVIEW_PORT_START || 5100);
    return Number.isFinite(fromEnv) ? fromEnv : 5100;
}

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function runCommand({ cmd, args, cwd, env }) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            cwd,
            env: { ...process.env, ...(env || {}) },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', chunk => {
            stdout += chunk.toString('utf8');
        });
        child.stderr.on('data', chunk => {
            stderr += chunk.toString('utf8');
        });

        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) return resolve({ stdout, stderr });
            reject(new Error(stderr || stdout || `Command failed: ${cmd} ${args.join(' ')}`));
        });
    });
}

function allocatePreviewPort(sessions) {
    const used = new Set(Array.from(sessions.values()).map(s => s.preview_port).filter(Boolean));
    let port = getPreviewPortStart();
    while (used.has(port)) port += 1;
    return port;
}

const sessions = new Map();

async function startSession({ siteId, repo, framework, branch }) {
    const existing = sessions.get(siteId);
    if (existing?.status === 'running') return existing;

    const workspaceRoot = getWorkspaceRoot();
    const workspacePath = path.join(workspaceRoot, siteId);
    ensureDir(workspacePath);

    const previewPort = existing?.preview_port || allocatePreviewPort(sessions);
    const previewUrl = `${getPublicBaseUrl()}:${previewPort}`;

    const editorBase = safeText(process.env.HIVESERVER_CODE_SERVER_BASE_URL, 2000).replace(/\/$/, '');
    const editorUrl = editorBase ? `${editorBase}/${siteId}` : null;

    const session = {
        site_id: siteId,
        server_session_id: existing?.server_session_id || `${siteId}-${Date.now()}`,
        status: 'starting',
        branch: branch || 'main',
        repo: repo || null,
        framework: framework || null,
        workspace_path: workspacePath,
        preview_port: previewPort,
        preview_url: previewUrl,
        editor_url: editorUrl,
        started_at: new Date().toISOString(),
        last_error: null,
        child: null
    };

    sessions.set(siteId, session);

    if (!isRunnerEnabled()) {
        session.status = 'running';
        return session;
    }

    try {
        const repoName = safeText(repo, 300);
        if (!repoName || !repoName.includes('/')) throw new Error('repo must be in the form owner/repo');

        const gitDir = path.join(workspacePath, '.git');
        const cloneUrl = `https://github.com/${repoName}.git`;

        if (!fs.existsSync(gitDir)) {
            await runCommand({ cmd: 'git', args: ['clone', '--depth', '1', cloneUrl, '.'], cwd: workspacePath });
        }

        await runCommand({ cmd: 'git', args: ['fetch', '--all', '--prune'], cwd: workspacePath });
        await runCommand({ cmd: 'git', args: ['checkout', branch || 'main'], cwd: workspacePath });
        await runCommand({ cmd: 'git', args: ['pull', 'origin', branch || 'main'], cwd: workspacePath });

        if (fs.existsSync(path.join(workspacePath, 'package-lock.json'))) {
            await runCommand({ cmd: 'npm', args: ['ci'], cwd: workspacePath });
        } else {
            await runCommand({ cmd: 'npm', args: ['install'], cwd: workspacePath });
        }

        const child = spawn('npm', ['run', 'dev', '--', '-p', String(previewPort)], {
            cwd: workspacePath,
            env: { ...process.env, PORT: String(previewPort) },
            stdio: 'inherit'
        });

        session.child = child;
        session.status = 'running';

        child.on('exit', code => {
            const current = sessions.get(siteId);
            if (!current) return;
            current.child = null;
            current.status = 'stopped';
            current.last_error = code === 0 ? null : `Dev process exited (${code}).`;
        });

        return session;
    } catch (e) {
        session.status = 'error';
        session.last_error = e?.message || String(e);
        return session;
    }
}

async function stopSession({ siteId }) {
    const existing = sessions.get(siteId);
    if (!existing) {
        return { site_id: siteId, status: 'stopped' };
    }

    existing.status = 'stopping';

    try {
        if (existing.child) {
            existing.child.kill('SIGTERM');
            existing.child = null;
        }
    } catch (e) {
        existing.last_error = e?.message || String(e);
    }

    existing.status = 'stopped';
    return existing;
}

async function restartSession({ siteId, repo, framework, branch }) {
    await stopSession({ siteId });
    return startSession({ siteId, repo, framework, branch });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
        return json(res, 200, { ok: true });
    }

    if (!url.pathname.startsWith('/v1/')) {
        return json(res, 404, { error: 'Not found' });
    }

    if (!isAuthorized(req)) {
        return json(res, 401, { error: 'Unauthorized' });
    }

    if (req.method !== 'POST') {
        return json(res, 405, { error: 'Method not allowed' });
    }

    let body = {};
    try {
        body = await readJson(req);
    } catch (e) {
        return json(res, 400, { error: e?.message || 'Invalid JSON body.' });
    }

    const siteId = safeText(body.site_id, 80);
    if (!siteId) return json(res, 400, { error: 'site_id is required' });

    if (url.pathname === '/v1/dev-sessions/start') {
        const session = await startSession({
            siteId,
            repo: safeText(body.repo, 300),
            framework: safeText(body.framework, 50),
            branch: safeText(body.branch, 120) || 'main'
        });
        return json(res, 200, session);
    }

    if (url.pathname === '/v1/dev-sessions/stop') {
        const session = await stopSession({ siteId });
        return json(res, 200, session);
    }

    if (url.pathname === '/v1/dev-sessions/restart') {
        const session = await restartSession({
            siteId,
            repo: safeText(body.repo, 300),
            framework: safeText(body.framework, 50),
            branch: safeText(body.branch, 120) || 'main'
        });
        return json(res, 200, session);
    }

    return json(res, 404, { error: 'Not found' });
});

server.listen(getPort(), () => {
    // eslint-disable-next-line no-console
    console.log(`HiveServer listening on :${getPort()}`);
});

