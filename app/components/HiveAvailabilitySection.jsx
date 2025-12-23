'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';

const FILTERS = [
    { id: 'desk', label: 'Desk', unitTypes: ['desk', 'desk_pod'] },
    { id: 'office', label: 'Office', unitTypes: ['private_office', 'small_office'] },
    { id: 'premium', label: 'Premium office', unitTypes: ['premium_office'] }
];

function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

function formatUnitType(value) {
    const v = typeof value === 'string' ? value.trim() : '';
    if (!v) return '—';
    const map = {
        premium_office: 'premium_office',
        private_office: 'private_office',
        small_office: 'small_office',
        desk: 'desk',
        desk_pod: 'desk_pod'
    };
    return map[v] || v;
}

function formatNZDFromCents(cents) {
    const n = Number(cents);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n / 100);
}

function HiveMapViewer() {
    const containerRef = useRef(null);
    const pointerRef = useRef({ id: null, x: 0, y: 0 });
    const [hasInteracted, setHasInteracted] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
    const aspectRatio = 1432 / 2115.21;

    const zoomTo = (nextScale, origin) => {
        setTransform(prev => {
            const scale = clamp(nextScale, 0.7, 6);
            if (!origin) return { ...prev, scale };
            const ratio = scale / prev.scale;
            const x = origin.x - (origin.x - prev.x) * ratio;
            const y = origin.y - (origin.y - prev.y) * ratio;
            return { scale, x, y };
        });
    };

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return undefined;

        const onWheel = event => {
            if (!containerRef.current) return;
            event.preventDefault();
            setHasInteracted(true);

            const rect = containerRef.current.getBoundingClientRect();
            const origin = { x: event.clientX - rect.left, y: event.clientY - rect.top };
            const direction = event.deltaY > 0 ? -1 : 1;
            const multiplier = event.ctrlKey ? 0.04 : 0.12;
            const zoomFactor = 1 + direction * multiplier;

            setTransform(prev => {
                const nextScale = clamp(prev.scale * zoomFactor, 0.7, 6);
                const ratio = nextScale / prev.scale;
                const x = origin.x - (origin.x - prev.x) * ratio;
                const y = origin.y - (origin.y - prev.y) * ratio;
                return { scale: nextScale, x, y };
            });
        };

        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return undefined;
        if (hasInteracted) return undefined;

        const centerContent = () => {
            const width = el.clientWidth || 0;
            const height = el.clientHeight || 0;
            if (!width || !height) return;
            const contentWidth = Math.min(1200, width);
            const contentHeight = contentWidth * aspectRatio;
            setTransform(prev => ({
                ...prev,
                scale: 1,
                x: Math.round((width - contentWidth) / 2),
                y: Math.round((height - contentHeight) / 2)
            }));
        };

        const onResize = () => {
            centerContent();
        };

        centerContent();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [aspectRatio, hasInteracted]);

    const onPointerDown = event => {
        if (!containerRef.current) return;
        setHasInteracted(true);
        setIsDragging(true);
        pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        containerRef.current.setPointerCapture(event.pointerId);
    };

    const onPointerMove = event => {
        if (!isDragging) return;
        if (pointerRef.current.id !== event.pointerId) return;
        const dx = event.clientX - pointerRef.current.x;
        const dy = event.clientY - pointerRef.current.y;
        pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    };

    const onPointerUp = event => {
        if (pointerRef.current.id !== event.pointerId) return;
        setIsDragging(false);
        pointerRef.current = { id: null, x: 0, y: 0 };
        try {
            containerRef.current?.releasePointerCapture(event.pointerId);
        } catch (err) {
            // ignore
        }
    };

    const reset = () => setTransform({ scale: 1, x: 0, y: 0 });

    return (
        <div className="hive-map">
            <div
                className={`hive-map-viewer ${hasInteracted ? 'active' : ''}`}
                ref={containerRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                role="img"
                aria-label="Interactive HIVE map"
            >
                <div
                    className="hive-map-content"
                    style={{
                        transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`
                    }}
                >
                    <Image
                        className="hive-map-img"
                        src="/HIVE.svg"
                        alt="HIVE map"
                        width={2115}
                        height={1432}
                        draggable={false}
                        sizes="(max-width: 900px) 92vw, 1200px"
                        priority={false}
                    />
                </div>
                {!hasInteracted ? (
                    <div className="hive-map-hint">
                        Click and drag to pan. Scroll to zoom.
                    </div>
                ) : null}
            </div>
            <div className="hive-map-controls" aria-label="Map controls">
                <button className="btn secondary" type="button" onClick={() => zoomTo(transform.scale * 1.2)}>
                    Zoom in
                </button>
                <button className="btn secondary" type="button" onClick={() => zoomTo(transform.scale / 1.2)}>
                    Zoom out
                </button>
                <button className="btn ghost" type="button" onClick={reset}>
                    Reset
                </button>
            </div>
        </div>
    );
}

function AvailabilityModal({ unit, onClose }) {
    useEffect(() => {
        if (!unit) return undefined;
        const onKey = event => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [unit, onClose]);

    if (!unit) return null;

    const title = `${unit.building || '—'} ${unit.unit_number ?? '—'}`;

    return (
        <div
            className="platform-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={`Space image: ${title}`}
            onMouseDown={event => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div className="platform-modal">
                <div className="platform-modal-header">
                    <div>
                        <h3 style={{ marginTop: 0, marginBottom: '0.35rem' }}>{title}</h3>
                        <p className="platform-subtitle" style={{ marginTop: 0 }}>
                            Image coming soon (placeholder)
                        </p>
                    </div>
                    <button className="btn ghost" type="button" onClick={onClose}>
                        Close
                    </button>
                </div>
                <div className="availability-image-placeholder" aria-hidden="true">
                    <div className="availability-image-placeholder-inner">Image placeholder</div>
                </div>
            </div>
        </div>
    );
}

export default function HiveAvailabilitySection() {
    const [units, setUnits] = useState([]);
    const [activeFilter, setActiveFilter] = useState(FILTERS[0].id);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeUnit, setActiveUnit] = useState(null);
    const closeModal = useCallback(() => setActiveUnit(null), []);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                setError('');
                const res = await fetch('/api/availability', { cache: 'no-store' });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json?.error || 'Failed to load availability.');
                if (cancelled) return;
                setUnits(Array.isArray(json?.units) ? json.units : []);
            } catch (err) {
                if (cancelled) return;
                setUnits([]);
                setError(err?.message || 'Failed to load availability.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        const interval = window.setInterval(load, 60_000);
        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, []);

    const filter = useMemo(() => FILTERS.find(f => f.id === activeFilter) || FILTERS[0], [activeFilter]);
    const visibleUnits = useMemo(() => {
        const types = new Set(filter.unitTypes);
        return (units || [])
            .filter(unit => {
                if (!types.has(unit?.unit_type)) return false;
                const remaining = Number(unit?.slots_remaining);
                if (Number.isFinite(remaining)) return remaining > 0;
                return unit?.is_vacant === true || unit?.is_full === false || unit?.is_occupied === false;
            })
            .sort((a, b) => {
                const ab = String(a?.building || '').localeCompare(String(b?.building || ''));
                if (ab !== 0) return ab;
                const an = Number(a?.unit_number);
                const bn = Number(b?.unit_number);
                const aIsNum = Number.isFinite(an);
                const bIsNum = Number.isFinite(bn);
                if (aIsNum && bIsNum) return an - bn;
                return String(a?.unit_number || '').localeCompare(String(b?.unit_number || ''));
            });
    }, [units, filter.unitTypes]);

    return (
        <>
            <section id="availability" className="section availability">
                <div className="section-tag">Who’s here</div>
                <h2>Who Is At HIVE HQ?</h2>

                <HiveMapViewer />

                <div className="availability-panel">
                    <h3>Check Availability</h3>
                    <p>Weekly Prices are subject to change and based on one membership and exclude GST. Need something custom? Feel free to message us below.</p>
                    <div className="availability-filters" role="tablist" aria-label="Availability filters">
                        {FILTERS.map(option => (
                            <button
                                key={option.id}
                                type="button"
                                className={`availability-filter ${activeFilter === option.id ? 'active' : ''}`}
                                onClick={() => setActiveFilter(option.id)}
                                aria-pressed={activeFilter === option.id}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    {loading ? <p className="platform-subtitle">Loading availability…</p> : null}
                    {error ? <p className="platform-message error">{error}</p> : null}

                    <div className="platform-table-wrap">
                        <table className="platform-table">
                            <thead>
                                <tr>
                                    <th>Building</th>
                                    <th>Unit</th>
                                    <th>Unit type</th>
                                    <th>Weekly Price</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {visibleUnits.length ? (
                                    visibleUnits.map(unit => (
                                        <tr key={unit?.id || `${unit?.building}.${unit?.unit_number}`}>
                                            <td className="platform-mono">{unit?.building || '—'}</td>
                                            <td className="platform-mono">{unit?.unit_number ?? '—'}</td>
                                            <td className="platform-mono">{formatUnitType(unit?.unit_type)}</td>
                                            <td className="platform-mono">{formatNZDFromCents(unit?.display_price_cents)}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button className="btn secondary" type="button" onClick={() => setActiveUnit(unit)}>
                                                    See image
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="platform-subtitle">
                                            No vacant {filter.label.toLowerCase()} spaces right now.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <AvailabilityModal unit={activeUnit} onClose={closeModal} />
        </>
    );
}
