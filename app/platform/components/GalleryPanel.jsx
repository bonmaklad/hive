'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlatformSession } from '../PlatformContext';

const BUCKET = 'hive_gallery';
const MAX_RESULTS = 60;

function parseTags(value) {
    if (!value) return [];
    const raw = value
        .split(',')
        .map(tag => tag.trim().toLowerCase())
        .filter(Boolean);
    return Array.from(new Set(raw));
}

function sanitizeFileName(name) {
    const trimmed = String(name || 'upload').trim();
    return trimmed.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
}

export default function GalleryPanel() {
    const { supabase, user } = usePlatformSession();
    const storage = useMemo(() => supabase.storage.from(BUCKET), [supabase]);

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [tagsInput, setTagsInput] = useState('');
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const fileInputRef = useRef(null);

    const searchTags = useMemo(() => parseTags(search), [search]);

    const loadGallery = useCallback(async () => {
        setLoading(true);
        setError('');
        let query = supabase
            .from('gallery_items')
            .select('id, object_path, file_name, mime_type, tags, created_at')
            .order('created_at', { ascending: false })
            .limit(MAX_RESULTS);

        if (searchTags.length) {
            query = query.contains('tags', searchTags);
        }

        const { data, error: loadError } = await query;
        if (loadError) {
            setError(loadError.message);
            setItems([]);
        } else {
            setItems(Array.isArray(data) ? data : []);
        }
        setLoading(false);
    }, [searchTags, supabase]);

    useEffect(() => {
        loadGallery();
    }, [loadGallery]);

    const handleFileChange = event => {
        const files = Array.from(event.target.files || []);
        setSelectedFiles(files);
        setError('');
        setNotice('');
    };

    const handleUpload = async event => {
        event?.preventDefault?.();
        setError('');
        setNotice('');

        if (!selectedFiles.length) {
            setError('Select at least one photo or video.');
            return;
        }
        if (!user?.id) {
            setError('You must be signed in to upload.');
            return;
        }

        setUploading(true);
        const tags = parseTags(tagsInput);
        let successCount = 0;

        for (let index = 0; index < selectedFiles.length; index += 1) {
            const file = selectedFiles[index];
            const mimeType = file.type || '';
            if (!mimeType.startsWith('image/') && !mimeType.startsWith('video/')) {
                setError(`Unsupported file type: ${file.name}`);
                continue;
            }

            const safeName = sanitizeFileName(file.name);
            const path = `${user.id}/${Date.now()}-${index}-${safeName}`;
            const { error: uploadError } = await storage.upload(path, file, {
                contentType: mimeType || undefined,
                upsert: false
            });

            if (uploadError) {
                setError(uploadError.message);
                continue;
            }

            const { error: insertError } = await supabase.from('gallery_items').insert({
                owner_id: user.id,
                bucket_id: BUCKET,
                object_path: path,
                file_name: file.name,
                mime_type: mimeType,
                size_bytes: file.size,
                tags
            });

            if (insertError) {
                setError(insertError.message);
                continue;
            }

            successCount += 1;
        }

        setUploading(false);
        if (successCount) {
            setNotice(`Uploaded ${successCount} file${successCount === 1 ? '' : 's'}.`);
            setSelectedFiles([]);
            setTagsInput('');
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            await loadGallery();
        }
    };

    return (
        <section className="platform-card span-12" aria-label="Gallery">
            <div className="platform-kpi-row">
                <div>
                    <h2 style={{ margin: 0 }}>Gallery</h2>
                    <p className="platform-subtitle">Upload photos or videos, tag them, and browse the latest moments. All photos here can be used by members for advertisement and marketing.</p>
                </div>
                <span className="badge neutral">{loading ? '...' : `${items.length} items`}</span>
            </div>

            <div className="gallery-toolbar">
                <div className="gallery-field gallery-search">
                    <label className="platform-subtitle" htmlFor="gallery-search">
                        Search tags
                    </label>
                    <input
                        id="gallery-search"
                        className="table-input"
                        type="text"
                        placeholder="events, founders, launch"
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                    />
                </div>
                <div className="gallery-field gallery-upload">
                    <label className="platform-subtitle" htmlFor="gallery-files">
                        Upload photos & videos
                    </label>
                    <input
                        ref={fileInputRef}
                        id="gallery-files"
                        className="table-input gallery-file-input"
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        onChange={handleFileChange}
                    />
                    <input
                        className="table-input"
                        type="text"
                        placeholder="Tags (comma separated)"
                        value={tagsInput}
                        onChange={event => setTagsInput(event.target.value)}
                    />
                    <div className="gallery-upload-actions">
                        <button className="btn primary" type="button" onClick={handleUpload} disabled={uploading}>
                            {uploading ? 'Uploading...' : 'Upload'}
                        </button>
                        {selectedFiles.length ? (
                            <span className="platform-subtitle">Selected: {selectedFiles.length}</span>
                        ) : null}
                    </div>
                </div>
            </div>

            {error ? <p className="platform-message error">{error}</p> : null}
            {notice ? <p className="platform-message info">{notice}</p> : null}

            {loading ? <p className="platform-subtitle">Loading gallery...</p> : null}
            {!loading && !items.length ? <p className="platform-subtitle">No uploads yet. Add the first photo.</p> : null}

            <div className="gallery-grid">
                {items.map(item => {
                    const url = storage.getPublicUrl(item.object_path).data?.publicUrl || '';
                    const isVideo = item.mime_type?.startsWith('video/');
                    return (
                        <article className="gallery-item" key={item.id}>
                            {isVideo ? (
                                <video className="gallery-media" controls preload="metadata" src={url} />
                            ) : (
                                <img className="gallery-media" src={url} alt={item.file_name || 'Gallery upload'} loading="lazy" />
                            )}
                            <div className="gallery-meta">
                                <span className="platform-subtitle">Uploaded {formatDateTime(item.created_at)}</span>
                                <div className="gallery-tags">
                                    {(item.tags || []).map(tag => (
                                        <span key={`${item.id}-${tag}`} className="gallery-tag">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
