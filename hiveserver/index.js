const http = require('node:http');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
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

function sha256Hex(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
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

function getGitPushToken() {
    return safeText(process.env.HIVESERVER_GIT_PUSH_TOKEN || process.env.GITHUB_TOKEN, 5000);
}

function getGitCommitIdentity() {
    const name = safeText(process.env.HIVESERVER_GIT_COMMIT_NAME, 200) || 'Hive Dev Mode';
    const email = safeText(process.env.HIVESERVER_GIT_COMMIT_EMAIL, 200) || 'devmode@hive.local';
    return { name, email };
}

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

    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    let body = {};
    try {
        body = await readJson(req);
    } catch (e) {
        return json(res, 400, { error: e?.message || 'Invalid JSON body.' });
    }

    const siteId = safeText(body.site_id, 80);
    if (!siteId) return json(res, 400, { error: 'site_id is required' });

    function workspacePathForSite() {
        return path.join(getWorkspaceRoot(), siteId);
    }

    function touchLastAccess() {
        try {
            const p = path.join(workspacePathForSite(), 'last_access');
            fs.writeFileSync(p, String(Date.now()));
        } catch {
            // ignore
        }
    }

    function sanitizeRelativePath(input) {
        const raw = safeText(input, 2000).replace(/\\/g, '/');
        const withoutLeading = raw.replace(/^\/+/, '');
        const normalized = path.posix.normalize(withoutLeading);
        if (normalized === '.' || normalized === '') return '';
        if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
            throw new Error('Invalid path.');
        }
        return normalized;
    }

    function isBlockedRelPath(relPath) {
        const parts = relPath.split('/').filter(Boolean);
        const blocked = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'out', 'coverage']);
        return parts.some(part => blocked.has(part));
    }

    function resolveWorkspaceFile(relPath) {
        const workspacePath = workspacePathForSite();
        const root = path.resolve(workspacePath);
        const rel = sanitizeRelativePath(relPath);

        if (rel && isBlockedRelPath(rel)) throw new Error('Path not allowed.');

        const absolute = path.resolve(workspacePath, rel);
        if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
            throw new Error('Invalid path.');
        }
        return { root, rel, absolute };
    }

    function listDir(relDir) {
        const { absolute, rel } = resolveWorkspaceFile(relDir || '');
        if (!fs.existsSync(absolute)) throw new Error('Directory not found.');
        const stat = fs.statSync(absolute);
        if (!stat.isDirectory()) throw new Error('Not a directory.');

        const ignoreNames = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'out', 'coverage']);
        const dirents = fs.readdirSync(absolute, { withFileTypes: true });
        const entries = dirents
            .filter(d => !d.isSymbolicLink())
            .filter(d => !ignoreNames.has(d.name))
            .map(d => {
                const entryRel = path.posix.join(rel, d.name).replace(/^\/+/, '');
                return {
                    path: entryRel,
                    name: d.name,
                    type: d.isDirectory() ? 'dir' : 'file'
                };
            })
            .sort((a, b) => {
                if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
                return a.path.localeCompare(b.path);
            });

        return { dir: rel, entries };
    }

    function listFilesRecursive(relDir, options = {}) {
        const limit = Number.isFinite(options?.limit) ? options.limit : 5000;
        const { absolute, rel } = resolveWorkspaceFile(relDir || '');
        if (!fs.existsSync(absolute)) throw new Error('Directory not found.');
        const stat = fs.statSync(absolute);
        if (!stat.isDirectory()) throw new Error('Not a directory.');

        const ignoreNames = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'out', 'coverage']);
        const files = [];

        function walk(absDir, relPrefix) {
            if (files.length >= limit) return;
            const dirents = fs.readdirSync(absDir, { withFileTypes: true });
            for (const d of dirents) {
                if (files.length >= limit) break;
                if (d.isSymbolicLink()) continue;
                if (ignoreNames.has(d.name)) continue;

                const nextAbs = path.join(absDir, d.name);
                const nextRel = relPrefix ? path.posix.join(relPrefix, d.name) : d.name;

                if (d.isDirectory()) {
                    walk(nextAbs, nextRel);
                    continue;
                }

                if (d.isFile()) files.push(nextRel);
            }
        }

        walk(absolute, rel);

        return { dir: rel, files, truncated: files.length >= limit, limit };
    }

    function readTextFile(relPath) {
        const { absolute, rel } = resolveWorkspaceFile(relPath);
        if (!rel) throw new Error('path is required.');
        if (!fs.existsSync(absolute)) throw new Error('File not found.');
        const stat = fs.statSync(absolute);
        if (!stat.isFile()) throw new Error('Not a file.');
        if (stat.size > 1024 * 1024) throw new Error('File too large (max 1MB).');

        const buffer = fs.readFileSync(absolute);
        const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
        if (sample.includes(0)) throw new Error('Binary files are not supported.');

        const content = buffer.toString('utf8');
        return {
            path: rel,
            content,
            hash: sha256Hex(content),
            mtime_ms: stat.mtimeMs
        };
    }

    function writeTextFile(relPath, content, options = {}) {
        const { absolute, rel } = resolveWorkspaceFile(relPath);
        if (!rel) throw new Error('path is required.');
        if (typeof content !== 'string') throw new Error('content must be a string.');
        if (Buffer.byteLength(content, 'utf8') > 1024 * 1024) throw new Error('Content too large (max 1MB).');

        const expectedHash = safeText(options?.expectedHash, 200);
        if (expectedHash) {
            if (!fs.existsSync(absolute)) throw new Error('File not found.');
            const current = fs.readFileSync(absolute, 'utf8');
            const currentHash = sha256Hex(current);
            if (currentHash !== expectedHash) {
                const error = new Error('File has changed on disk.');
                error.statusCode = 409;
                error.currentHash = currentHash;
                throw error;
            }
        }

        ensureDir(path.dirname(absolute));
        fs.writeFileSync(absolute, content, 'utf8');
        return { path: rel, ok: true, hash: sha256Hex(content) };
    }

    function applyUnifiedDiffToText(original, diffText) {
        const normalizedDiff = String(diffText || '').replace(/\r\n/g, '\n');
        const lines = normalizedDiff.split('\n');

        const hunks = [];
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            if (!line.startsWith('@@')) {
                i += 1;
                continue;
            }

            const header = line;
            const match = header.match(/^@@\s+\-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
            if (!match) throw new Error('Invalid diff hunk header.');
            const oldStart = Number(match[1]);
            const oldCount = match[2] ? Number(match[2]) : 1;
            const newStart = Number(match[3]);
            const newCount = match[4] ? Number(match[4]) : 1;

            i += 1;
            const hunkLines = [];
            while (i < lines.length && !lines[i].startsWith('@@')) {
                hunkLines.push(lines[i]);
                i += 1;
            }

            hunks.push({ oldStart, oldCount, newStart, newCount, lines: hunkLines });
        }

        if (!hunks.length) throw new Error('No hunks found in diff.');

        const normalizedOriginal = String(original || '').replace(/\r\n/g, '\n');
        const endsWithNewline = normalizedOriginal.endsWith('\n');
        const body = endsWithNewline ? normalizedOriginal.slice(0, -1) : normalizedOriginal;
        const originalLines = body ? body.split('\n') : [];

        let srcIndex = 0;
        const out = [];

        for (const hunk of hunks) {
            const targetIndex = Math.max(0, hunk.oldStart - 1);
            while (srcIndex < targetIndex && srcIndex < originalLines.length) {
                out.push(originalLines[srcIndex]);
                srcIndex += 1;
            }

            for (const hunkLine of hunk.lines) {
                if (!hunkLine) {
                    // Empty lines are valid context/add/remove lines, but unified diff always prefixes them.
                    // If we get a truly empty line here, treat it as context empty line.
                    if (srcIndex >= originalLines.length) throw new Error('Patch does not apply (unexpected EOF).');
                    if (originalLines[srcIndex] !== '') throw new Error('Patch does not apply (context mismatch).');
                    out.push('');
                    srcIndex += 1;
                    continue;
                }

                const prefix = hunkLine[0];
                const text = hunkLine.slice(1);

                if (prefix === ' ') {
                    if (srcIndex >= originalLines.length) throw new Error('Patch does not apply (unexpected EOF).');
                    if (originalLines[srcIndex] !== text) throw new Error('Patch does not apply (context mismatch).');
                    out.push(text);
                    srcIndex += 1;
                    continue;
                }

                if (prefix === '-') {
                    if (srcIndex >= originalLines.length) throw new Error('Patch does not apply (unexpected EOF).');
                    if (originalLines[srcIndex] !== text) throw new Error('Patch does not apply (remove mismatch).');
                    srcIndex += 1;
                    continue;
                }

                if (prefix === '+') {
                    out.push(text);
                    continue;
                }

                if (prefix === '\\') {
                    continue;
                }

                throw new Error('Invalid diff line.');
            }
        }

        while (srcIndex < originalLines.length) {
            out.push(originalLines[srcIndex]);
            srcIndex += 1;
        }

        const outBody = out.join('\n');
        return endsWithNewline ? `${outBody}\n` : outBody;
    }

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

    if (url.pathname === '/v1/dev-sessions/status') {
        const existing = sessions.get(siteId);
        if (!existing) return json(res, 200, { site_id: siteId, status: 'stopped' });
        return json(res, 200, existing);
    }

    if (url.pathname === '/v1/dev-files/list') {
        try {
            touchLastAccess();
            const dir = safeText(body.dir, 2000);
            const recursive = Boolean(body?.recursive);
            const data = recursive ? listFilesRecursive(dir) : listDir(dir);
            return json(res, 200, { site_id: siteId, ...data });
        } catch (e) {
            return json(res, 400, { error: e?.message || 'Could not list directory.' });
        }
    }

    if (url.pathname === '/v1/dev-files/read') {
        try {
            touchLastAccess();
            const filePath = safeText(body.path, 2000);
            const data = readTextFile(filePath);
            return json(res, 200, { site_id: siteId, ...data });
        } catch (e) {
            return json(res, 400, { error: e?.message || 'Could not read file.' });
        }
    }

    if (url.pathname === '/v1/dev-files/write') {
        try {
            touchLastAccess();
            const filePath = safeText(body.path, 2000);
            const content = body?.content;
            const expectedHash = safeText(body.hash, 200);
            const data = writeTextFile(filePath, content, { expectedHash });
            return json(res, 200, { site_id: siteId, ...data });
        } catch (e) {
            if (e?.statusCode === 409) {
                return json(res, 409, { error: e?.message || 'Conflict', hash: e?.currentHash || null });
            }
            return json(res, 400, { error: e?.message || 'Could not write file.' });
        }
    }

    if (url.pathname === '/v1/dev-files/apply-diff') {
        try {
            touchLastAccess();
            const filePath = safeText(body.path, 2000);
            const diff = safeText(body.diff, 500000);
            if (!diff) return json(res, 400, { error: 'diff is required' });

            const expectedHash = safeText(body.hash, 200);
            const current = readTextFile(filePath);
            if (expectedHash && current.hash !== expectedHash) {
                return json(res, 409, { error: 'File has changed on disk.', hash: current.hash });
            }

            const next = applyUnifiedDiffToText(current.content, diff);
            const written = writeTextFile(filePath, next, { expectedHash: current.hash });
            return json(res, 200, { site_id: siteId, ...written });
        } catch (e) {
            if (e?.statusCode === 409) {
                return json(res, 409, { error: e?.message || 'Conflict', hash: e?.currentHash || null });
            }
            return json(res, 400, { error: e?.message || 'Could not apply diff.' });
        }
    }

    if (url.pathname === '/v1/dev-git/push') {
        try {
            touchLastAccess();
            const token = getGitPushToken();
            if (!token) {
                return json(res, 501, {
                    error: 'Git push is not configured.',
                    detail: 'Set `HIVESERVER_GIT_PUSH_TOKEN` (or `GITHUB_TOKEN`) on the HiveServer.'
                });
            }

            const workspacePath = path.join(getWorkspaceRoot(), siteId);
            const gitDir = path.join(workspacePath, '.git');
            if (!fs.existsSync(gitDir)) {
                return json(res, 400, { error: 'No git repo found in workspace.' });
            }

            const identity = getGitCommitIdentity();
            await runCommand({ cmd: 'git', args: ['config', 'user.name', identity.name], cwd: workspacePath });
            await runCommand({ cmd: 'git', args: ['config', 'user.email', identity.email], cwd: workspacePath });

            const status = await runCommand({ cmd: 'git', args: ['status', '--porcelain'], cwd: workspacePath });
            if (!safeText(status.stdout, 100000).trim()) {
                return json(res, 200, { ok: true, pushed: false, reason: 'no changes' });
            }

            await runCommand({ cmd: 'git', args: ['add', '-A'], cwd: workspacePath });

            const message = safeText(body.message, 240) || `Hive deploy ${new Date().toISOString()}`;
            try {
                await runCommand({ cmd: 'git', args: ['commit', '-m', message], cwd: workspacePath });
            } catch (e) {
                const msg = String(e?.message || '');
                if (!msg.includes('nothing to commit')) throw e;
            }

            const origin = await runCommand({ cmd: 'git', args: ['remote', 'get-url', 'origin'], cwd: workspacePath });
            const originUrl = safeText(origin.stdout, 2000).trim();
            if (!originUrl) return json(res, 400, { error: 'Git origin remote is missing.' });

            let pushUrl = originUrl;
            if (originUrl.startsWith('https://')) {
                pushUrl = originUrl.replace(/^https:\/\//, `https://x-access-token:${token}@`);
            }
            await runCommand({ cmd: 'git', args: ['remote', 'set-url', 'origin', pushUrl], cwd: workspacePath });

            const branch = safeText(body.branch, 120) || safeText(sessions.get(siteId)?.branch, 120) || 'main';
            await runCommand({ cmd: 'git', args: ['push', 'origin', `HEAD:${branch}`], cwd: workspacePath });

            const commit = await runCommand({ cmd: 'git', args: ['rev-parse', 'HEAD'], cwd: workspacePath });
            return json(res, 200, { ok: true, pushed: true, branch, commit: safeText(commit.stdout, 80).trim() });
        } catch (e) {
            return json(res, 500, { error: e?.message || 'Could not push to GitHub.' });
        }
    }

    return json(res, 404, { error: 'Not found' });
});

server.listen(getPort(), () => {
    // eslint-disable-next-line no-console
    console.log(`HiveServer listening on :${getPort()}`);
});
