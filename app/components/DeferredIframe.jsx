'use client';

import { useEffect, useRef, useState } from 'react';

export default function DeferredIframe({
    title,
    src,
    className,
    allowFullScreen = false,
    loading = 'lazy',
    referrerPolicy = 'no-referrer-when-downgrade',
    rootMargin = '600px 0px',
    height = '100%',
    width = '100%'
}) {
    const iframeRef = useRef(null);
    const [active, setActive] = useState(false);

    useEffect(() => {
        if (active) return undefined;
        const el = iframeRef.current;
        if (!el) return undefined;

        const observer = new IntersectionObserver(
            entries => {
                const entry = entries[0];
                if (!entry?.isIntersecting) return;
                setActive(true);
                observer.disconnect();
            },
            { root: null, rootMargin, threshold: 0.01 }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, [active, rootMargin]);

    return (
        <>
            <iframe
                ref={iframeRef}
                title={title}
                className={className}
                src={active ? src : 'about:blank'}
                loading={loading}
                referrerPolicy={referrerPolicy}
                allowFullScreen={allowFullScreen}
                width={width}
                height={height}
            />
            <noscript>
                <iframe
                    title={title}
                    className={className}
                    src={src}
                    loading={loading}
                    referrerPolicy={referrerPolicy}
                    allowFullScreen={allowFullScreen}
                    width={width}
                    height={height}
                />
            </noscript>
        </>
    );
}

