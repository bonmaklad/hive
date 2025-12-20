'use client';

import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export const dynamic = 'force-dynamic';

const MonacoEditor = nextDynamic(() => import('@monaco-editor/react').then(m => m.Editor), { ssr: false });

type DevSession = {
    status?: string;
    preview_url?: string | null;
    editor_url?: string | null;
    workspace_path?: string | null;
    last_error?: string | null;
    updated_at?: string | null;
    branch?: string | null;
};

type Site = {
    id: string;
    name?: string | null;
    repo?: string | null;
    framework?: string | null;
};

type TreeNode = {
    name: string;
    path: string;
    type: 'dir' | 'file';
    children?: TreeNode[];
};

function safeText(value: unknown, limit = 300) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function formatTimestamp(value?: string | null) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
}

async function readJsonResponse(response: Response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return response.json();

    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return { _raw: text };
    }
}

function guessLanguage(filePath: string) {
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript';
    if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs')) return 'javascript';
    if (lower.endsWith('.json')) return 'json';
    if (lower.endsWith('.css')) return 'css';
    if (lower.endsWith('.md')) return 'markdown';
    if (lower.endsWith('.html')) return 'html';
    if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml';
    if (lower.endsWith('.py')) return 'python';
    if (lower.endsWith('.sh')) return 'shell';
    return 'plaintext';
}

async function sha256Hex(content: string) {
    const data = new TextEncoder().encode(content);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function buildTree(files: string[]) {
    const root: TreeNode = { name: '', path: '', type: 'dir', children: [] };

    for (const raw of files) {
        const filePath = raw.replace(/\\/g, '/').replace(/^\/+/, '');
        if (!filePath) continue;

        const parts = filePath.split('/').filter(Boolean);
        let current = root;
        let currentPath = '';

        for (let i = 0; i < parts.length; i += 1) {
            const part = parts[i];
            currentPath = currentPath ? `${currentPath}/${part}` : part;

            const isLeaf = i === parts.length - 1;
            const nextType: TreeNode['type'] = isLeaf ? 'file' : 'dir';

            const children = current.children || [];
            let node = children.find(c => c.name === part && c.type === nextType);
            if (!node) {
                node = { name: part, path: currentPath, type: nextType, children: nextType === 'dir' ? [] : undefined };
                children.push(node);
                current.children = children;
            }
            if (node.type === 'dir') current = node;
        }
    }

    function sortNode(node: TreeNode) {
        if (!node.children) return;
        node.children.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        for (const child of node.children) sortNode(child);
    }

    sortNode(root);
    return root.children || [];
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function Modal({
    title,
    children,
    onClose
}: {
    title: string;
    children: React.ReactNode;
    onClose: () => void;
}) {
    return (
        <div
            role="dialog"
            aria-modal="true"
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
                zIndex: 60
            }}
            onMouseDown={onClose}
        >
            <div
                className="platform-card"
                style={{ width: 'min(680px, 100%)', margin: 0 }}
                onMouseDown={e => e.stopPropagation()}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <h3 style={{ margin: 0 }}>{title}</h3>
                    <button className="btn ghost" type="button" onClick={onClose}>
                        Close
                    </button>
                </div>
                <div style={{ marginTop: 12 }}>{children}</div>
            </div>
        </div>
    );
}

function FileTree({
    nodes,
    activePath,
    expanded,
    setExpanded,
    onOpenFile,
    disabled
}: {
    nodes: TreeNode[];
    activePath: string;
    expanded: Set<string>;
    setExpanded: (next: Set<string>) => void;
    onOpenFile: (path: string) => void;
    disabled: boolean;
}) {
    const toggleDir = (dirPath: string) => {
        const next = new Set(expanded);
        if (next.has(dirPath)) next.delete(dirPath);
        else next.add(dirPath);
        setExpanded(next);
    };

    const renderNode = (node: TreeNode, depth: number) => {
        const padLeft = 10 + depth * 12;
        if (node.type === 'dir') {
            const isOpen = expanded.has(node.path);
            return (
                <div key={node.path}>
                    <button
                        className="btn ghost"
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleDir(node.path)}
                        style={{ width: '100%', justifyContent: 'flex-start', paddingLeft: padLeft }}
                    >
                        <span className="platform-mono">{isOpen ? '▾' : '▸'}</span>
                        <span className="platform-mono" style={{ marginLeft: 8 }}>
                            {node.name}/
                        </span>
                    </button>
                    {isOpen && node.children?.length ? (
                        <div>
                            {node.children.map(child => (
                                <div key={child.path}>{renderNode(child, depth + 1)}</div>
                            ))}
                        </div>
                    ) : null}
                </div>
            );
        }

        const selected = node.path === activePath;
        return (
            <button
                key={node.path}
                className="btn ghost"
                type="button"
                disabled={disabled}
                onClick={() => onOpenFile(node.path)}
                style={{
                    width: '100%',
                    justifyContent: 'flex-start',
                    paddingLeft: padLeft + 18,
                    background: selected ? 'rgba(255,255,255,0.08)' : undefined
                }}
            >
                <span className="platform-mono">{node.name}</span>
            </button>
        );
    };

    return <div>{nodes.map(n => renderNode(n, 0))}</div>;
}

export default function SiteDevModePage({ params }: { params: { id: string } }) {
    const siteId = params.id;
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);

    const tokenRef = useRef('');
    const [loadingStatus, setLoadingStatus] = useState(true);
    const [statusError, setStatusError] = useState('');
    const [site, setSite] = useState<Site | null>(null);
    const [session, setSession] = useState<DevSession | null>(null);
    const [branch, setBranch] = useState('main');
    const [actionBusy, setActionBusy] = useState(false);

    const [leftWidth, setLeftWidth] = useState(280);
    const [rightWidth, setRightWidth] = useState(520);
    const [aiOpen, setAiOpen] = useState(false);

    const containerRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<{ mode: 'left' | 'right' | null; startX: number; startLeft: number; startRight: number }>({
        mode: null,
        startX: 0,
        startLeft: 0,
        startRight: 0
    });

    const [filesLoading, setFilesLoading] = useState(false);
    const [filesError, setFilesError] = useState('');
    const [files, setFiles] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState<Set<string>>(new Set(['app', 'src', 'pages']));

    const [activePath, setActivePath] = useState('');
    const [content, setContent] = useState('');
    const [baseHash, setBaseHash] = useState<string | null>(null);
    const savedContentRef = useRef('');
    const [fileLoading, setFileLoading] = useState(false);
    const [saveBusy, setSaveBusy] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [conflictOpen, setConflictOpen] = useState(false);
    const conflictServerHashRef = useRef<string | null>(null);

    const [aiInstruction, setAiInstruction] = useState('');
    const [aiBusy, setAiBusy] = useState(false);
    const [aiError, setAiError] = useState('');
    const [aiDiff, setAiDiff] = useState('');
    const [applyBusy, setApplyBusy] = useState(false);
    const [deployOpen, setDeployOpen] = useState(false);
    const [deployMessage, setDeployMessage] = useState('Deploy from Hive Dev Mode');
    const [deployBusy, setDeployBusy] = useState(false);
    const [deployResult, setDeployResult] = useState('');
    const [previewKey, setPreviewKey] = useState(0);

    const previewPath = `/__dev/${siteId}`;
    const status = safeText(session?.status, 40) || '—';
    const canEdit = status === 'running';
    const dirty = Boolean(activePath && content !== savedContentRef.current);

    const authHeader = useCallback(async () => {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token || '';
        if (!token) throw new Error('No session token. Please sign in again.');
        tokenRef.current = token;
        return { Authorization: `Bearer ${token}` };
    }, [supabase]);

    const stopDevBestEffort = useCallback(() => {
        const token = tokenRef.current;
        if (!token) return;
        fetch('/api/dev/stop', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({ siteId }),
            keepalive: true
        }).catch(() => {});
    }, [siteId]);

    const loadStatus = useCallback(async () => {
        setLoadingStatus(true);
        setStatusError('');
        try {
            const res = await fetch(`/api/dev/status?siteId=${encodeURIComponent(siteId)}`, {
                headers: { Accept: 'application/json', ...(await authHeader()) },
                cache: 'no-store'
            });
            const body = await readJsonResponse(res);
            if (!res.ok) throw new Error(body?.detail || body?.error || 'Could not load Dev Mode status.');
            setSite(body?.site || null);
            setSession(body?.session || null);
            setBranch(body?.session?.branch || 'main');
        } catch (e: any) {
            setStatusError(e?.message || 'Could not load Dev Mode status.');
        } finally {
            setLoadingStatus(false);
        }
    }, [authHeader, siteId]);

    const loadFiles = useCallback(async () => {
        setFilesLoading(true);
        setFilesError('');
        try {
            const res = await fetch(`/api/dev/files?siteId=${encodeURIComponent(siteId)}`, {
                headers: { Accept: 'application/json', ...(await authHeader()) },
                cache: 'no-store'
            });
            const body = await readJsonResponse(res);
            if (!res.ok) throw new Error(body?.detail || body?.error || 'Could not load files.');
            setFiles(Array.isArray(body) ? body : []);
        } catch (e: any) {
            setFilesError(e?.message || 'Could not load files.');
        } finally {
            setFilesLoading(false);
        }
    }, [authHeader, siteId]);

    const openFile = useCallback(
        async (filePath: string) => {
            setFileLoading(true);
            setSaveError('');
            try {
                const res = await fetch(
                    `/api/dev/file?siteId=${encodeURIComponent(siteId)}&path=${encodeURIComponent(filePath)}`,
                    { headers: { Accept: 'application/json', ...(await authHeader()) }, cache: 'no-store' }
                );
                const body = await readJsonResponse(res);
                if (!res.ok) throw new Error(body?.detail || body?.error || 'Could not read file.');

                const nextContent = String(body?.content || '');
                const nextHash = safeText(body?.hash, 200) || (await sha256Hex(nextContent));

                setActivePath(filePath);
                setContent(nextContent);
                setBaseHash(nextHash);
                savedContentRef.current = nextContent;
                setAiDiff('');
                setAiError('');
            } catch (e: any) {
                setSaveError(e?.message || 'Could not read file.');
            } finally {
                setFileLoading(false);
            }
        },
        [authHeader, siteId]
    );

    const saveFile = useCallback(
        async (options?: { force?: boolean }) => {
            if (!activePath) return;
            setSaveBusy(true);
            setSaveError('');
            try {
                const res = await fetch('/api/dev/file', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', Accept: 'application/json', ...(await authHeader()) },
                    body: JSON.stringify({
                        siteId,
                        path: activePath,
                        content,
                        hash: options?.force ? null : baseHash
                    }),
                    cache: 'no-store'
                });
                const body = await readJsonResponse(res);
                if (res.status === 409) {
                    conflictServerHashRef.current = safeText(body?.hash, 200) || null;
                    setConflictOpen(true);
                    throw new Error(body?.error || 'File has changed on disk.');
                }
                if (!res.ok) throw new Error(body?.detail || body?.error || 'Could not save file.');
                const nextHash = safeText(body?.hash, 200) || (await sha256Hex(content));
                setBaseHash(nextHash);
                savedContentRef.current = content;
            } catch (e: any) {
                setSaveError(e?.message || 'Could not save file.');
            } finally {
                setSaveBusy(false);
            }
        },
        [activePath, authHeader, baseHash, content, siteId]
    );

    const startDev = useCallback(async () => {
        setActionBusy(true);
        setStatusError('');
        try {
            const res = await fetch('/api/dev/start', {
                method: 'POST',
                headers: { 'content-type': 'application/json', Accept: 'application/json', ...(await authHeader()) },
                body: JSON.stringify({ siteId, branch }),
                cache: 'no-store'
            });
            const body = await readJsonResponse(res);
            if (!res.ok) throw new Error(body?.detail || body?.error || 'Could not start Dev Mode.');
            setSite(body?.site || site);
            setSession(body?.session || null);
            setBranch(body?.session?.branch || branch);
            setPreviewKey(x => x + 1);
        } catch (e: any) {
            setStatusError(e?.message || 'Could not start Dev Mode.');
        } finally {
            setActionBusy(false);
        }
    }, [authHeader, branch, site, siteId]);

    const stopDev = useCallback(async () => {
        setActionBusy(true);
        setStatusError('');
        try {
            const res = await fetch('/api/dev/stop', {
                method: 'POST',
                headers: { 'content-type': 'application/json', Accept: 'application/json', ...(await authHeader()) },
                body: JSON.stringify({ siteId }),
                cache: 'no-store'
            });
            const body = await readJsonResponse(res);
            if (!res.ok) throw new Error(body?.detail || body?.error || 'Could not stop Dev Mode.');
            setSite(body?.site || site);
            setSession(body?.session || null);
            setActivePath('');
            setContent('');
            setBaseHash(null);
            savedContentRef.current = '';
        } catch (e: any) {
            setStatusError(e?.message || 'Could not stop Dev Mode.');
        } finally {
            setActionBusy(false);
        }
    }, [authHeader, site, siteId]);

    const refreshPreview = useCallback(() => {
        setPreviewKey(x => x + 1);
    }, []);

    const runAi = useCallback(async () => {
        if (!activePath) return;
        if (!aiInstruction.trim()) return;
        setAiBusy(true);
        setAiError('');
        setAiDiff('');
        try {
            const res = await fetch('/api/dev/ai', {
                method: 'POST',
                headers: { 'content-type': 'application/json', Accept: 'application/json', ...(await authHeader()) },
                body: JSON.stringify({ siteId, path: activePath, content, instruction: aiInstruction }),
                cache: 'no-store'
            });
            const body = await readJsonResponse(res);
            if (!res.ok) throw new Error(body?.detail || body?.error || 'AI request failed.');
            setAiDiff(String(body?.diff || '').trim());
        } catch (e: any) {
            setAiError(e?.message || 'AI request failed.');
        } finally {
            setAiBusy(false);
        }
    }, [activePath, aiInstruction, authHeader, content, siteId]);

    const applyDiff = useCallback(async () => {
        if (!activePath) return;
        if (!aiDiff.trim()) return;
        setApplyBusy(true);
        setAiError('');
        try {
            const res = await fetch('/api/dev/apply-diff', {
                method: 'POST',
                headers: { 'content-type': 'application/json', Accept: 'application/json', ...(await authHeader()) },
                body: JSON.stringify({ siteId, path: activePath, diff: aiDiff, hash: baseHash }),
                cache: 'no-store'
            });
            const body = await readJsonResponse(res);
            if (!res.ok) throw new Error(body?.detail || body?.error || 'Could not apply diff.');
            setAiDiff('');
            await openFile(activePath);
            refreshPreview();
        } catch (e: any) {
            setAiError(e?.message || 'Could not apply diff.');
        } finally {
            setApplyBusy(false);
        }
    }, [activePath, aiDiff, authHeader, baseHash, openFile, refreshPreview, siteId]);

    const deploy = useCallback(async () => {
        setDeployBusy(true);
        setDeployResult('');
        try {
            const res = await fetch('/api/dev/git/push', {
                method: 'POST',
                headers: { 'content-type': 'application/json', Accept: 'application/json', ...(await authHeader()) },
                body: JSON.stringify({ siteId, message: deployMessage }),
                cache: 'no-store'
            });
            const body = await readJsonResponse(res);
            if (!res.ok) throw new Error(body?.detail || body?.error || 'Deploy failed.');
            if (body?.pushed) setDeployResult(`Pushed ${safeText(body?.commit, 80)} → ${safeText(body?.branch, 80)}`);
            else setDeployResult(body?.reason ? `Not pushed (${body.reason})` : 'Deploy completed.');
        } catch (e: any) {
            setDeployResult(e?.message || 'Deploy failed.');
        } finally {
            setDeployBusy(false);
        }
    }, [authHeader, deployMessage, siteId]);

    const panesKey = `hive:devmode:panes:${siteId}`;
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(panesKey) || 'null');
            if (saved?.leftWidth) setLeftWidth(saved.leftWidth);
            if (saved?.rightWidth) setRightWidth(saved.rightWidth);
        } catch {
            // ignore
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId]);

    useEffect(() => {
        try {
            localStorage.setItem(panesKey, JSON.stringify({ leftWidth, rightWidth }));
        } catch {
            // ignore
        }
    }, [leftWidth, panesKey, rightWidth]);

    useEffect(() => {
        void loadStatus();
        // Keep a cached token for best-effort stop on leave.
        void authHeader().catch(() => {});

        const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
            tokenRef.current = next?.access_token || '';
        });

        return () => {
            sub?.subscription?.unsubscribe();
        };
    }, [authHeader, loadStatus, supabase]);

    useEffect(() => {
        if (!canEdit) return;
        void loadFiles();
    }, [canEdit, loadFiles]);

    useEffect(() => {
        if (status !== 'starting' && status !== 'stopping') return;
        const t = setInterval(() => {
            void loadStatus();
        }, 2000);
        return () => clearInterval(t);
    }, [loadStatus, status]);

    useEffect(() => {
        const onPointerMove = (e: PointerEvent) => {
            const mode = dragRef.current.mode;
            if (!mode) return;
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const total = rect.width;
            const dx = e.clientX - dragRef.current.startX;

            if (mode === 'left') {
                const next = clamp(dragRef.current.startLeft + dx, 200, Math.max(220, total - rightWidth - 240));
                setLeftWidth(next);
                return;
            }

            const nextRight = clamp(dragRef.current.startRight - dx, 360, Math.max(380, total - leftWidth - 320));
            setRightWidth(nextRight);
        };

        const onPointerUp = () => {
            dragRef.current.mode = null;
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        return () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        };
    }, [leftWidth, rightWidth]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const isCmd = e.metaKey || e.ctrlKey;
            if (!isCmd) return;

            if (e.key.toLowerCase() === 's') {
                e.preventDefault();
                void saveFile();
            }

            if (e.key === 'Enter' && !e.shiftKey) {
                if (!aiOpen) return;
                e.preventDefault();
                void runAi();
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [aiOpen, runAi, saveFile]);

    useEffect(() => {
        const onVisibility = () => {
            if (document.hidden) stopDevBestEffort();
        };
        const onPageHide = () => stopDevBestEffort();

        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pagehide', onPageHide);

        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pagehide', onPageHide);
            stopDevBestEffort();
        };
    }, [stopDevBestEffort]);

    useEffect(() => {
        if (!canEdit) return;
        const t = setInterval(() => {
            const token = tokenRef.current;
            if (!token) return;
            fetch(`/api/dev/files?siteId=${encodeURIComponent(siteId)}`, {
                headers: { authorization: `Bearer ${token}` },
                cache: 'no-store'
            }).catch(() => {});
        }, 60000);
        return () => clearInterval(t);
    }, [canEdit, siteId]);

    const treeNodes = useMemo(() => buildTree(files), [files]);
    const matchingFiles = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return [];
        return files.filter(f => f.toLowerCase().includes(q)).slice(0, 200);
    }, [files, search]);

    const startLeftDrag = (e: React.PointerEvent) => {
        dragRef.current = { mode: 'left', startX: e.clientX, startLeft: leftWidth, startRight: rightWidth };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };
    const startRightDrag = (e: React.PointerEvent) => {
        dragRef.current = { mode: 'right', startX: e.clientX, startLeft: leftWidth, startRight: rightWidth };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    return (
        <main className="platform-main" style={{ paddingBottom: 0 }}>
            <div className="platform-title-row" style={{ alignItems: 'center' }}>
                <div>
                    <h1 style={{ marginBottom: 4 }}>Dev Mode</h1>
                    <p className="platform-subtitle" style={{ margin: 0 }}>
                        <span className="platform-mono">{site?.repo || '—'}</span>
                        {site?.framework ? (
                            <>
                                {' '}
                                • <span className="platform-mono">{site.framework}</span>
                            </>
                        ) : null}
                    </p>
                </div>

                <div className="platform-actions" style={{ alignItems: 'center', gap: 10 }}>
                    <span className="platform-subtitle">
                        Status: <span className="platform-mono">{status}</span>
                    </span>

                    <input
                        className="table-input platform-mono"
                        value={branch}
                        onChange={e => setBranch(e.target.value)}
                        placeholder="main"
                        style={{ width: 180 }}
                        disabled={actionBusy}
                    />

                    <button className="btn primary" type="button" onClick={startDev} disabled={actionBusy || status === 'running'}>
                        Start Dev Mode
                    </button>
                    <button className="btn ghost" type="button" onClick={stopDev} disabled={actionBusy || status !== 'running'}>
                        Stop
                    </button>
                    <button className="btn secondary" type="button" onClick={() => void saveFile()} disabled={!canEdit || !dirty || saveBusy}>
                        {saveBusy ? 'Saving…' : 'Save'}
                    </button>
                    <button
                        className="btn secondary"
                        type="button"
                        onClick={() => setDeployOpen(true)}
                        disabled={!canEdit || deployBusy}
                    >
                        Deploy
                    </button>
                    <button className="btn ghost" type="button" onClick={() => setAiOpen(v => !v)} disabled={!canEdit}>
                        AI Assist
                    </button>
                    <button className="btn ghost" type="button" onClick={loadStatus} disabled={actionBusy}>
                        Refresh
                    </button>
                    <Link className="btn ghost" href={`/platform/sites/${siteId}`}>
                        Back
                    </Link>
                </div>
            </div>

            {statusError ? <p className="platform-message error">{statusError}</p> : null}
            {loadingStatus ? <p className="platform-subtitle">Loading…</p> : null}
            {!loadingStatus && session?.last_error ? (
                <p className="platform-message error">
                    <span className="platform-mono">{session.last_error}</span>
                </p>
            ) : null}

            <div
                ref={containerRef}
                style={{
                    marginTop: 12,
                    display: 'flex',
                    gap: 0,
                    minHeight: 'calc(100vh - 240px)',
                    height: 'calc(100vh - 240px)'
                }}
            >
                <div className="platform-card" style={{ width: leftWidth, margin: 0, padding: 12, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <strong>Files</strong>
                        <button className="btn ghost" type="button" onClick={() => void loadFiles()} disabled={!canEdit || filesLoading}>
                            {filesLoading ? '…' : 'Reload'}
                        </button>
                    </div>
                    <input
                        className="table-input platform-mono"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search…"
                        style={{ width: '100%', marginTop: 10 }}
                        disabled={!canEdit || filesLoading}
                    />
                    {filesError ? (
                        <p className="platform-message error" style={{ marginTop: 10 }}>
                            {filesError}
                        </p>
                    ) : null}
                    <div style={{ marginTop: 10, overflow: 'auto', height: 'calc(100% - 86px)' }}>
                        {!canEdit ? (
                            <p className="platform-subtitle">Start Dev Mode to load files.</p>
                        ) : search.trim() ? (
                            <div>
                                {matchingFiles.map(f => (
                                    <button
                                        key={f}
                                        className="btn ghost"
                                        type="button"
                                        disabled={!canEdit || fileLoading}
                                        onClick={() => void openFile(f)}
                                        style={{
                                            width: '100%',
                                            justifyContent: 'flex-start',
                                            background: f === activePath ? 'rgba(255,255,255,0.08)' : undefined
                                        }}
                                    >
                                        <span className="platform-mono">{f}</span>
                                    </button>
                                ))}
                                {!matchingFiles.length ? <p className="platform-subtitle">No matches.</p> : null}
                            </div>
                        ) : (
                            <FileTree
                                nodes={treeNodes}
                                activePath={activePath}
                                expanded={expanded}
                                setExpanded={setExpanded}
                                onOpenFile={p => void openFile(p)}
                                disabled={!canEdit || fileLoading}
                            />
                        )}
                    </div>
                </div>

                <div
                    role="separator"
                    aria-label="Resize file tree"
                    onPointerDown={startLeftDrag}
                    style={{ width: 8, cursor: 'col-resize', display: 'flex', alignItems: 'stretch', padding: '0 2px' }}
                >
                    <div style={{ width: '100%', borderRadius: 999, background: 'rgba(255,255,255,0.08)' }} />
                </div>

                <div className="platform-card" style={{ flex: 1, margin: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div className="platform-mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {activePath || 'Select a file'}
                        </div>
                        <div className="platform-subtitle">
                            {saveBusy ? 'Saving…' : dirty ? 'Unsaved' : baseHash ? 'Saved' : '—'} • Updated{' '}
                            <span className="platform-mono">{formatTimestamp(session?.updated_at)}</span>
                        </div>
                    </div>

                    {saveError ? (
                        <div style={{ padding: '0 12px 12px' }}>
                            <p className="platform-message error" style={{ margin: 0 }}>
                                {saveError}
                            </p>
                        </div>
                    ) : null}

                    <div style={{ flex: 1, minHeight: 0 }}>
                        <MonacoEditor
                            path={activePath || undefined}
                            defaultLanguage="plaintext"
                            language={activePath ? guessLanguage(activePath) : 'plaintext'}
                            value={content}
                            onChange={value => setContent(value ?? '')}
                            options={{
                                readOnly: !canEdit || !activePath || fileLoading,
                                minimap: { enabled: false },
                                fontSize: 13,
                                scrollBeyondLastLine: false,
                                wordWrap: 'off',
                                automaticLayout: true
                            }}
                        />
                    </div>
                </div>

                <div
                    role="separator"
                    aria-label="Resize preview"
                    onPointerDown={startRightDrag}
                    style={{ width: 8, cursor: 'col-resize', display: 'flex', alignItems: 'stretch', padding: '0 2px' }}
                >
                    <div style={{ width: '100%', borderRadius: 999, background: 'rgba(255,255,255,0.08)' }} />
                </div>

                <div className="platform-card" style={{ width: rightWidth, margin: 0, padding: 12, overflow: 'hidden', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <strong>Preview</strong>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn ghost" type="button" onClick={refreshPreview} disabled={!canEdit}>
                                Refresh
                            </button>
                            <a className="btn ghost" href={previewPath} target="_blank" rel="noopener noreferrer">
                                Open
                            </a>
                        </div>
                    </div>
                    <div style={{ marginTop: 10, height: 'calc(100% - 44px)' }}>
                        <iframe
                            key={previewKey}
                            title="Dev preview"
                            src={previewPath}
                            style={{ width: '100%', height: '100%', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}
                        />
                    </div>

                    {aiOpen ? (
                        <div
                            style={{
                                position: 'absolute',
                                top: 0,
                                right: 0,
                                bottom: 0,
                                width: 420,
                                background: 'rgba(10,10,10,0.92)',
                                borderLeft: '1px solid rgba(255,255,255,0.08)',
                                padding: 12,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 10
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <strong>AI Assist</strong>
                                <button className="btn ghost" type="button" onClick={() => setAiOpen(false)}>
                                    Close
                                </button>
                            </div>
                            <p className="platform-subtitle" style={{ margin: 0 }}>
                                Sends the current file to AI and expects a unified diff for <span className="platform-mono">{activePath || '—'}</span>.
                            </p>
                            <textarea
                                className="table-input"
                                value={aiInstruction}
                                onChange={e => setAiInstruction(e.target.value)}
                                placeholder="Describe the change… (Cmd/Ctrl+Enter to send)"
                                disabled={!activePath || aiBusy}
                                style={{ width: '100%', height: 90, resize: 'none' }}
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    className="btn primary"
                                    type="button"
                                    onClick={() => void runAi()}
                                    disabled={!activePath || aiBusy || !aiInstruction.trim()}
                                >
                                    {aiBusy ? 'Thinking…' : 'Generate diff'}
                                </button>
                                <button
                                    className="btn secondary"
                                    type="button"
                                    onClick={() => void applyDiff()}
                                    disabled={!activePath || applyBusy || !aiDiff.trim()}
                                >
                                    {applyBusy ? 'Applying…' : 'Apply'}
                                </button>
                            </div>
                            {aiError ? <p className="platform-message error">{aiError}</p> : null}
                            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                                <pre
                                    className="platform-mono"
                                    style={{
                                        whiteSpace: 'pre',
                                        fontSize: 12,
                                        lineHeight: 1.4,
                                        margin: 0,
                                        padding: 10,
                                        borderRadius: 10,
                                        border: '1px solid rgba(255,255,255,0.08)'
                                    }}
                                >
                                    {aiDiff || 'Diff preview…'}
                                </pre>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            {conflictOpen ? (
                <Modal title="Conflict: file changed on disk" onClose={() => setConflictOpen(false)}>
                    <p className="platform-subtitle" style={{ marginTop: 0 }}>
                        Someone (or something) modified this file after you loaded it.
                    </p>
                    <p className="platform-subtitle">
                        Your base hash: <span className="platform-mono">{baseHash || '—'}</span>
                        <br />
                        Server hash: <span className="platform-mono">{conflictServerHashRef.current || '—'}</span>
                    </p>
                    <div className="platform-actions" style={{ marginTop: 12 }}>
                        <button
                            className="btn secondary"
                            type="button"
                            onClick={() => {
                                setConflictOpen(false);
                                if (activePath) void openFile(activePath);
                            }}
                        >
                            Reload
                        </button>
                        <button
                            className="btn primary"
                            type="button"
                            onClick={() => {
                                setConflictOpen(false);
                                void saveFile({ force: true });
                            }}
                        >
                            Overwrite anyway
                        </button>
                    </div>
                </Modal>
            ) : null}

            {deployOpen ? (
                <Modal title="Deploy (commit + push)" onClose={() => setDeployOpen(false)}>
                    <p className="platform-subtitle" style={{ marginTop: 0 }}>
                        Commits workspace changes and pushes to GitHub to trigger your pipeline.
                    </p>
                    <input
                        className="table-input"
                        value={deployMessage}
                        onChange={e => setDeployMessage(e.target.value)}
                        placeholder="Commit message"
                        style={{ width: '100%' }}
                        disabled={deployBusy}
                    />
                    <div className="platform-actions" style={{ marginTop: 12 }}>
                        <button className="btn primary" type="button" onClick={() => void deploy()} disabled={deployBusy || !deployMessage.trim()}>
                            {deployBusy ? 'Deploying…' : 'Deploy'}
                        </button>
                        <button className="btn ghost" type="button" onClick={() => setDeployOpen(false)} disabled={deployBusy}>
                            Close
                        </button>
                    </div>
                    {deployResult ? (
                        <p className="platform-message info" style={{ marginTop: 12 }}>
                            {deployResult}
                        </p>
                    ) : null}
                </Modal>
            ) : null}
        </main>
    );
}
