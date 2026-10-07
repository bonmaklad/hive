'use client';

import { useEffect, useState } from 'react';
import ImageCarousel from './ImageCarousel';

function normalizeImageUrl(value) {
    const url = typeof value === 'string' ? value.trim() : '';
    return url || null;
}

function uniqueValues(values) {
    const seen = new Set();
    const out = [];
    for (const value of values) {
        if (!value || seen.has(value)) continue;
        seen.add(value);
        out.push(value);
    }
    return out;
}

export default function HomeSpacesGallery() {
    const [images, setImages] = useState([]);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                const res = await fetch('/api/bookings/room/spaces', { cache: 'no-store' });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || !Array.isArray(json?.spaces)) return;

                const next = uniqueValues(
                    json.spaces
                        .flatMap(space => [
                            normalizeImageUrl(space?.image),
                            ...(Array.isArray(space?.images) ? space.images : [])
                                .map(image => normalizeImageUrl(image?.url || image))
                        ])
                        .filter(Boolean)
                );

                if (!cancelled) {
                    setImages(next);
                }
            } catch {
                return;
            }
        };

        load();
        const interval = window.setInterval(load, 60_000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, []);

    if (!images.length) return null;

    return (
        <ImageCarousel
            images={images}
            alt="HIVE spaces and work areas"
            sizes="(max-width: 900px) 92vw, 50vw"
            quality={60}
        />
    );
}
