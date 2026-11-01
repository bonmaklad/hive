'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import HiveMapOverlay, { MAP_W, MAP_H, HIVE_MAP_AREAS, normalizeCode, getAreaStatus, buildUnitsByCode } from '@/app/components/HiveMapOverlay';

function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

export default function HiveWorkUnitMap({ units, onUnitSelect }) {
    const containerRef = useRef(null);
    const pointerRef = useRef({ id: null, x: 0, y: 0 });
    const suppressClickRef = useRef(false);
    const [hasInteracted, setHasInteracted] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
    const [svgMarkup, setSvgMarkup] = useState('');

    const unitsByCode = useMemo(() => buildUnitsByCode(units), [units]);

    const mapStats = useMemo(() => {
        const seen = new Set();
        let tracked = 0;
        let available = 0;
        let partial = 0;
        let taken = 0;
        let inactive = 0;
        for (const area of HIVE_MAP_AREAS) {
            const code = normalizeCode(area.code);
            if (!code || seen.has(code)) continue;
            seen.add(code);
            const unit = unitsByCode.get(code);
            if (!unit) continue;
            tracked += 1;
            const status = getAreaStatus(unit);
            if (status === 'available') available += 1;
            if (status === 'partial') partial += 1;
            if (status === 'taken') taken += 1;
            if (status === 'inactive') inactive += 1;
        }
        return { tracked, available, partial, taken, inactive };
    }, [unitsByCode]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const res = await fetch('/HIVE.svg', { cache: 'force-cache' });
                let text = await res.text();
                text = text.replace(/<\?xml[^>]*\?>/i, '');
                if (!cancelled) setSvgMarkup(text);
            } catch (_) {
                if (!cancelled) setSvgMarkup('');
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, []);

    const fitToContainer = () => {
        const el = containerRef.current;
        if (!el) return;
        const width = el.clientWidth || 0;
        const height = el.clientHeight || 0;
        if (!width || !height) return;
        const scaleFit = Math.max(0.1, Math.min(width / MAP_W, height / MAP_H));
        const x = Math.round((width - MAP_W * scaleFit) / 2);
        const y = Math.round((height - MAP_H * scaleFit) / 2);
        setTransform({ scale: scaleFit, x, y });
    };

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
        if (hasInteracted) return undefined;
        fitToContainer();
        const onResize = () => fitToContainer();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasInteracted]);

    const onPointerDown = event => {
        if (!containerRef.current) return;
        setHasInteracted(true);
        setIsDragging(true);
        suppressClickRef.current = false;
        pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        containerRef.current.setPointerCapture(event.pointerId);
    };

    const onPointerMove = event => {
        if (!isDragging) return;
        if (pointerRef.current.id !== event.pointerId) return;
        const dx = event.clientX - pointerRef.current.x;
        const dy = event.clientY - pointerRef.current.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) suppressClickRef.current = true;
        pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    };

    const onPointerUp = event => {
        if (pointerRef.current.id !== event.pointerId) return;
        setIsDragging(false);
        pointerRef.current = { id: null, x: 0, y: 0 };
        try {
            containerRef.current?.releasePointerCapture(event.pointerId);
        } catch (_) {
            // ignore stale pointer capture
        }
        window.setTimeout(() => {
            suppressClickRef.current = false;
        }, 0);
    };

    const handleAreaSelect = (unit, event) => {
        event.stopPropagation();
        if (!unit || suppressClickRef.current) return;
        onUnitSelect?.(unit);
    };

    return (
        <section className="platform-card hive-work-unit-map" aria-label="HIVE work-unit room map">
            <div className="hive-work-unit-map-header">
                <div>
                    <h2>HIVE room map</h2>
                    <p className="platform-subtitle">Green rooms are empty, orange rooms have some desks gone, and red rooms are full.</p>
                </div>
                <div className="hive-map-legend" aria-label="Map status legend">
                    <span><i className="available" aria-hidden="true" /> Available {mapStats.available}</span>
                    <span><i className="partial" aria-hidden="true" /> Partial {mapStats.partial}</span>
                    <span><i className="taken" aria-hidden="true" /> Taken {mapStats.taken}</span>
                    <span><i className="untracked" aria-hidden="true" /> Untracked</span>
                </div>
            </div>
            <div
                className={`hive-map-viewer hive-work-unit-map-viewer ${hasInteracted ? 'active' : ''}`}
                ref={containerRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                role="img"
                aria-label="Interactive HIVE map with work-unit availability overlays"
            >
                <div
                    className="hive-map-content"
                    style={{
                        transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`
                    }}
                    aria-hidden="true"
                >
                    <div className="hive-map-svg" dangerouslySetInnerHTML={svgMarkup ? { __html: svgMarkup } : undefined} />
                    <HiveMapOverlay units={units} onUnitSelect={handleAreaSelect} />
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
                <button className="btn ghost" type="button" onClick={fitToContainer}>
                    Reset
                </button>
            </div>
            {mapStats.tracked ? (
                <p className="platform-subtitle hive-work-unit-map-footnote">
                    {mapStats.tracked} mapped work units matched to the inventory{mapStats.inactive ? `, including ${mapStats.inactive} inactive` : ''}.
                </p>
            ) : null}
        </section>
    );
}
