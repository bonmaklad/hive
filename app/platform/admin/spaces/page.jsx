'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePlatformSession } from '../../PlatformContext';

function toDollars(cents) {
    const n = Number(cents);
    if (!Number.isFinite(n)) return '';
    return String((n / 100).toFixed(2));
}

function toCentsFromDollars(value) {
    const v = typeof value === 'string' ? value.trim() : '';
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
}

function linesToList(value) {
    const text = typeof value === 'string' ? value : '';
    return text
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
}

function listToLines(list) {
    return (Array.isArray(list) ? list : []).filter(Boolean).join('\n');
}

function layoutsToLines(layouts) {
    const list = Array.isArray(layouts) ? layouts : [];
    return list
        .map(l => {
            const label = typeof l?.label === 'string' ? l.label.trim() : '';
            const capacity = typeof l?.capacity === 'string' ? l.capacity.trim() : '';
            if (!label && !capacity) return '';
            return `${label} | ${capacity}`.trim();
        })
        .filter(Boolean)
        .join('\n');
}

function linesToLayouts(value) {
    const lines = typeof value === 'string' ? value.split('\n') : [];
    const out = [];
    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        const [labelRaw, capacityRaw] = line.split('|').map(s => (s || '').trim());
        const label = labelRaw || '';
        const capacity = capacityRaw || '';
        if (!label && !capacity) continue;
        out.push({ label, capacity });
    }
    return out;
}

function sortedImages(images) {
    const list = Array.isArray(images) ? images : [];
    return list
        .slice()
        .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
}

export default function AdminSpacesPage() {
    const { supabase } = usePlatformSession();

    const [spaces, setSpaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    const [selectedSlug, setSelectedSlug] = useState('');
    const selectedSpace = useMemo(() => spaces.find(s => s.slug === selectedSlug) || null, [selectedSlug, spaces]);

    const [draft, setDraft] = useState({
        slug: '',
        title: '',
        tokens_per_hour: '1',
        pricing_half_day: '',
        pricing_full_day: '',
        pricing_per_event: '',
        image: '',
        copy: '',
        capacity: '',
        highlights: '',
        best_for: '',
        layouts: ''
    });
    const [isNew, setIsNew] = useState(false);

    const [uploadFiles, setUploadFiles] = useState(null);
    const [uploadAlt, setUploadAlt] = useState('');
    const [externalUrl, setExternalUrl] = useState('');

    const authHeader = async () => {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) throw new Error('No session token. Please sign in again.');
        return { Authorization: `Bearer ${token}` };
    };

    const loadSpaces = async (opts = {}) => {
        const keepSelection = Boolean(opts.keepSelection);
        setLoading(true);
        setError('');
        setInfo('');
        try {
            const res = await fetch('/api/admin/spaces', { headers: await authHeader() });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to load spaces.');
            const list = Array.isArray(json?.spaces) ? json.spaces : [];
            setSpaces(list);
            if (!keepSelection) {
                const next = list?.[0]?.slug || '';
                setSelectedSlug(next);
            } else if (keepSelection && selectedSlug && !list.some(s => s.slug === selectedSlug)) {
                setSelectedSlug(list?.[0]?.slug || '');
            }
        } catch (e) {
            setError(e?.message || 'Failed to load spaces.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSpaces();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!selectedSpace) return;
        setIsNew(false);
        setDraft({
            slug: selectedSpace.slug || '',
            title: selectedSpace.title || '',
            tokens_per_hour: String(selectedSpace.tokens_per_hour ?? 1),
            pricing_half_day: toDollars(selectedSpace.pricing_half_day_cents),
            pricing_full_day: toDollars(selectedSpace.pricing_full_day_cents),
            pricing_per_event: toDollars(selectedSpace.pricing_per_event_cents),
            image: selectedSpace.image || '',
            copy: selectedSpace.copy || '',
            capacity: selectedSpace.capacity || '',
            highlights: listToLines(selectedSpace.highlights),
            best_for: listToLines(selectedSpace.best_for),
            layouts: layoutsToLines(selectedSpace.layouts)
        });
        setUploadFiles(null);
        setUploadAlt('');
        setExternalUrl('');
    }, [selectedSpace]);

    const startNew = () => {
        setIsNew(true);
        setSelectedSlug('');
        setDraft({
            slug: '',
            title: '',
            tokens_per_hour: '1',
            pricing_half_day: '',
            pricing_full_day: '',
            pricing_per_event: '',
            image: '',
            copy: '',
            capacity: '',
            highlights: '',
            best_for: '',
            layouts: ''
        });
        setUploadFiles(null);
        setUploadAlt('');
        setExternalUrl('');
        setError('');
        setInfo('');
    };

    const saveSpace = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setInfo('');
        try {
            const payload = {
                slug: draft.slug.trim(),
                title: draft.title.trim(),
                tokens_per_hour: Number(draft.tokens_per_hour || 0),
                pricing_half_day_cents: toCentsFromDollars(draft.pricing_half_day),
                pricing_full_day_cents: toCentsFromDollars(draft.pricing_full_day),
                pricing_per_event_cents: toCentsFromDollars(draft.pricing_per_event),
                image: draft.image.trim() || null,
                copy: draft.copy.trim() || null,
                capacity: draft.capacity.trim() || null,
                highlights: linesToList(draft.highlights),
                best_for: linesToList(draft.best_for),
                layouts: linesToLayouts(draft.layouts)
            };

            const res = await fetch(isNew ? '/api/admin/spaces' : `/api/admin/spaces/${encodeURIComponent(draft.slug)}`, {
                method: isNew ? 'POST' : 'PATCH',
                headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to save space.');

            const saved = json?.space || null;
            await loadSpaces({ keepSelection: true });
            if (saved?.slug) setSelectedSlug(saved.slug);
            setIsNew(false);
            setInfo('Saved.');
        } catch (e) {
            setError(e?.message || 'Failed to save space.');
        } finally {
            setBusy(false);
        }
    };

    const deleteSpace = async () => {
        const slug = draft.slug.trim();
        if (!slug) return;
        const ok = window.confirm(`Delete space "${slug}"? This cannot be undone.`);
        if (!ok) return;
        setBusy(true);
        setError('');
        setInfo('');
        try {
            const res = await fetch(`/api/admin/spaces/${encodeURIComponent(slug)}`, {
                method: 'DELETE',
                headers: await authHeader()
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to delete space.');
            await loadSpaces();
            setInfo('Deleted.');
        } catch (e) {
            setError(e?.message || 'Failed to delete space.');
        } finally {
            setBusy(false);
        }
    };

    const uploadImages = async event => {
        event.preventDefault();
        const slug = draft.slug.trim();
        if (!slug) {
            setError('Save the space first (slug required) before uploading images.');
            return;
        }
        if (!uploadFiles || !uploadFiles.length) {
            setError('Choose one or more files to upload.');
            return;
        }
        setBusy(true);
        setError('');
        setInfo('');
        try {
            const form = new FormData();
            for (const f of Array.from(uploadFiles)) form.append('files[]', f);
            if (uploadAlt.trim()) form.set('alt', uploadAlt.trim());
            form.set('make_cover', 'false');

            const res = await fetch(`/api/admin/spaces/${encodeURIComponent(slug)}/images`, {
                method: 'POST',
                headers: await authHeader(),
                body: form
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to upload images.');
            await loadSpaces({ keepSelection: true });
            setInfo('Images uploaded.');
            setUploadFiles(null);
        } catch (e) {
            setError(e?.message || 'Failed to upload images.');
        } finally {
            setBusy(false);
        }
    };

    const addExternalImage = async event => {
        event.preventDefault();
        const slug = draft.slug.trim();
        if (!slug) {
            setError('Save the space first (slug required) before adding images.');
            return;
        }
        if (!externalUrl.trim()) {
            setError('Enter an image URL.');
            return;
        }
        setBusy(true);
        setError('');
        setInfo('');
        try {
            const form = new FormData();
            form.set('url', externalUrl.trim());
            if (uploadAlt.trim()) form.set('alt', uploadAlt.trim());
            form.set('make_cover', 'false');

            const res = await fetch(`/api/admin/spaces/${encodeURIComponent(slug)}/images`, {
                method: 'POST',
                headers: await authHeader(),
                body: form
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to add image.');
            await loadSpaces({ keepSelection: true });
            setInfo('Image added.');
            setExternalUrl('');
        } catch (e) {
            setError(e?.message || 'Failed to add image.');
        } finally {
            setBusy(false);
        }
    };

    const setCover = async img => {
        const slug = draft.slug.trim();
        if (!slug || !img?.id) return;
        setBusy(true);
        setError('');
        setInfo('');
        try {
            const res = await fetch(`/api/admin/spaces/${encodeURIComponent(slug)}/images/${encodeURIComponent(img.id)}`, {
                method: 'PATCH',
                headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                body: JSON.stringify({ make_cover: true })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to set cover.');
            await loadSpaces({ keepSelection: true });
            setInfo('Cover updated.');
        } catch (e) {
            setError(e?.message || 'Failed to set cover.');
        } finally {
            setBusy(false);
        }
    };

    const deleteImage = async img => {
        const slug = draft.slug.trim();
        if (!slug || !img?.id) return;
        const ok = window.confirm('Delete this image?');
        if (!ok) return;
        setBusy(true);
        setError('');
        setInfo('');
        try {
            const res = await fetch(`/api/admin/spaces/${encodeURIComponent(slug)}/images/${encodeURIComponent(img.id)}`, {
                method: 'DELETE',
                headers: await authHeader()
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to delete image.');
            await loadSpaces({ keepSelection: true });
            setInfo('Image deleted.');
        } catch (e) {
            setError(e?.message || 'Failed to delete image.');
        } finally {
            setBusy(false);
        }
    };

    const moveImage = async (img, direction) => {
        const slug = draft.slug.trim();
        if (!slug || !img?.id) return;
        const images = sortedImages(selectedSpace?.images);
        const idx = images.findIndex(i => i.id === img.id);
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (idx < 0 || swapIdx < 0 || swapIdx >= images.length) return;

        const a = images[idx];
        const b = images[swapIdx];
        const nextA = Number(b.sort_order || 0);
        const nextB = Number(a.sort_order || 0);

        setBusy(true);
        setError('');
        setInfo('');
        try {
            const headers = { ...(await authHeader()), 'Content-Type': 'application/json' };
            const [resA, resB] = await Promise.all([
                fetch(`/api/admin/spaces/${encodeURIComponent(slug)}/images/${encodeURIComponent(a.id)}`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ sort_order: nextA })
                }),
                fetch(`/api/admin/spaces/${encodeURIComponent(slug)}/images/${encodeURIComponent(b.id)}`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ sort_order: nextB })
                })
            ]);
            const jsonA = await resA.json().catch(() => ({}));
            const jsonB = await resB.json().catch(() => ({}));
            if (!resA.ok) throw new Error(jsonA?.error || 'Failed to reorder image.');
            if (!resB.ok) throw new Error(jsonB?.error || 'Failed to reorder image.');
            await loadSpaces({ keepSelection: true });
        } catch (e) {
            setError(e?.message || 'Failed to reorder images.');
        } finally {
            setBusy(false);
        }
    };

    const images = useMemo(() => sortedImages(selectedSpace?.images), [selectedSpace]);

    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Spaces</h1>
                    <p className="platform-subtitle">Edit room names, pricing, tokens/hour, and images (Supabase Storage bucket: HIVE).</p>
                </div>
                <div className="platform-title-actions">
                    <button className="btn ghost" type="button" onClick={() => loadSpaces({ keepSelection: true })} disabled={busy || loading}>
                        Refresh
                    </button>
                    <button className="btn primary" type="button" onClick={startNew} disabled={busy}>
                        New space
                    </button>
                    <Link className="btn ghost" href="/platform/admin">
                        Back to admin
                    </Link>
                </div>
            </div>

            {error && <p className="platform-message error">{error}</p>}
            {info && <p className="platform-message success">{info}</p>}

            <div className="platform-grid">
                <section className="platform-card span-4">
                    <h2 style={{ marginTop: 0 }}>All spaces</h2>
                    {loading ? <p className="platform-subtitle">Loading…</p> : null}
                    <label className="platform-subtitle">Select a space</label>
                    <select
                        value={selectedSlug}
                        onChange={e => {
                            setSelectedSlug(e.target.value);
                            setIsNew(false);
                        }}
                        disabled={busy || loading || isNew}
                    >
                        <option value="" disabled>
                            {isNew ? 'Creating new…' : 'Choose…'}
                        </option>
                        {spaces.map(s => (
                            <option key={s.slug} value={s.slug}>
                                {s.title} ({s.slug})
                            </option>
                        ))}
                    </select>

                    {selectedSpace?.image ? (
                        <div style={{ marginTop: '1rem' }}>
                            <div className="platform-subtitle">Cover preview</div>
                            <div
                                className="hex hex-program"
                                style={{ backgroundImage: `url(${selectedSpace.image})`, width: 220, height: 220, marginTop: 10 }}
                            />
                        </div>
                    ) : null}
                </section>

                <section className="platform-card span-8">
                    <h2 style={{ marginTop: 0 }}>{isNew ? 'New space' : 'Edit space'}</h2>

                    <form className="contact-form" onSubmit={saveSpace}>
                        <label>
                            Slug {isNew ? '' : '(locked)'}
                            <input
                                value={draft.slug}
                                onChange={e => setDraft(d => ({ ...d, slug: e.target.value }))}
                                disabled={busy || !isNew}
                                placeholder="e.g. nikau-room"
                            />
                        </label>
                        <label>
                            Title
                            <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} disabled={busy} />
                        </label>
                        <label>
                            Tokens per hour
                            <input
                                type="number"
                                min="0"
                                step="1"
                                value={draft.tokens_per_hour}
                                onChange={e => setDraft(d => ({ ...d, tokens_per_hour: e.target.value }))}
                                disabled={busy}
                            />
                        </label>

                        <div className="platform-grid" style={{ gap: '0.75rem' }}>
                            <label className="span-4">
                                Half day ($)
                                <input
                                    value={draft.pricing_half_day}
                                    onChange={e => setDraft(d => ({ ...d, pricing_half_day: e.target.value }))}
                                    disabled={busy}
                                    placeholder="e.g. 120"
                                />
                            </label>
                            <label className="span-4">
                                Full day ($)
                                <input
                                    value={draft.pricing_full_day}
                                    onChange={e => setDraft(d => ({ ...d, pricing_full_day: e.target.value }))}
                                    disabled={busy}
                                    placeholder="e.g. 200"
                                />
                            </label>
                            <label className="span-4">
                                Per event ($)
                                <input
                                    value={draft.pricing_per_event}
                                    onChange={e => setDraft(d => ({ ...d, pricing_per_event: e.target.value }))}
                                    disabled={busy}
                                    placeholder="e.g. 500"
                                />
                            </label>
                        </div>

                        <label>
                            Cover image URL (optional; defaults to first image)
                            <input value={draft.image} onChange={e => setDraft(d => ({ ...d, image: e.target.value }))} disabled={busy} />
                        </label>

                        <label>
                            Copy (website)
                            <textarea value={draft.copy} onChange={e => setDraft(d => ({ ...d, copy: e.target.value }))} disabled={busy} rows={3} />
                        </label>
                        <label>
                            Capacity (website)
                            <input value={draft.capacity} onChange={e => setDraft(d => ({ ...d, capacity: e.target.value }))} disabled={busy} />
                        </label>

                        <label>
                            Highlights (one per line)
                            <textarea value={draft.highlights} onChange={e => setDraft(d => ({ ...d, highlights: e.target.value }))} disabled={busy} rows={4} />
                        </label>
                        <label>
                            Best for (one per line)
                            <textarea value={draft.best_for} onChange={e => setDraft(d => ({ ...d, best_for: e.target.value }))} disabled={busy} rows={4} />
                        </label>
                        <label>
                            Layouts (one per line: Label | Capacity)
                            <textarea value={draft.layouts} onChange={e => setDraft(d => ({ ...d, layouts: e.target.value }))} disabled={busy} rows={4} />
                        </label>

                        <div className="platform-actions">
                            <button className="btn primary" type="submit" disabled={busy || !draft.slug.trim() || !draft.title.trim()}>
                                {busy ? 'Working…' : 'Save'}
                            </button>
                            {!isNew ? (
                                <button className="btn danger" type="button" onClick={deleteSpace} disabled={busy || !draft.slug.trim()}>
                                    Delete space
                                </button>
                            ) : null}
                        </div>
                    </form>

                    {!isNew && selectedSpace ? (
                        <div style={{ marginTop: '1.5rem' }}>
                            <h3 style={{ marginTop: 0 }}>Images</h3>
                            <p className="platform-subtitle" style={{ marginTop: 0 }}>
                                Uploads go to the Supabase Storage bucket <span className="platform-mono">HIVE</span> under <span className="platform-mono">spaces/{selectedSpace.slug}/</span>.
                            </p>

                            <form onSubmit={uploadImages} className="contact-form" style={{ marginTop: '1rem' }}>
                                <label>
                                    Upload files
                                    <input type="file" multiple onChange={e => setUploadFiles(e.target.files)} disabled={busy} />
                                </label>
                                <label>
                                    Alt text (optional, applies to uploaded URLs)
                                    <input value={uploadAlt} onChange={e => setUploadAlt(e.target.value)} disabled={busy} />
                                </label>
                                <div className="platform-actions">
                                    <button className="btn primary" type="submit" disabled={busy}>
                                        Upload
                                    </button>
                                </div>
                            </form>

                            <form onSubmit={addExternalImage} className="contact-form" style={{ marginTop: '1rem' }}>
                                <label>
                                    Add external image URL
                                    <input value={externalUrl} onChange={e => setExternalUrl(e.target.value)} disabled={busy} placeholder="https://…" />
                                </label>
                                <div className="platform-actions">
                                    <button className="btn ghost" type="submit" disabled={busy || !externalUrl.trim()}>
                                        Add URL
                                    </button>
                                </div>
                            </form>

                            {images.length ? (
                                <div className="platform-grid" style={{ marginTop: '1rem', gap: '0.75rem' }}>
                                    {images.map(img => (
                                        <div className="platform-card span-4" key={img.id} style={{ padding: '0.75rem' }}>
                                            <div
                                                style={{
                                                    width: '100%',
                                                    height: 140,
                                                    aspectRatio: '16/10',
                                                    backgroundImage: `url(${img.url})`,
                                                    backgroundSize: 'cover',
                                                    backgroundPosition: 'center',
                                                    borderRadius: 12
                                                }}
                                            />
                                            <p className="platform-subtitle" style={{ marginTop: 10, marginBottom: 6 }}>
                                                Order: {img.sort_order}
                                            </p>
                                            <div className="platform-actions" style={{ marginTop: 0 }}>
                                                <button className="btn ghost" type="button" onClick={() => moveImage(img, 'up')} disabled={busy}>
                                                    Up
                                                </button>
                                                <button className="btn ghost" type="button" onClick={() => moveImage(img, 'down')} disabled={busy}>
                                                    Down
                                                </button>
                                                <button className="btn ghost" type="button" onClick={() => setCover(img)} disabled={busy}>
                                                    Set cover
                                                </button>
                                                <button className="btn danger" type="button" onClick={() => deleteImage(img)} disabled={busy}>
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="platform-subtitle" style={{ marginTop: '1rem' }}>
                                    No images yet.
                                </p>
                            )}
                        </div>
                    ) : null}
                </section>
            </div>
        </main>
    );
}
