'use client';

import { useEffect } from 'react';

export default function HomePageEffects() {
    useEffect(() => {
        const counters = document.querySelectorAll('.stat-counter');
        if (!counters.length) return undefined;

        const observer = new IntersectionObserver(
            entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    const target = Number(entry.target.dataset.target);
                    const duration = 2000;
                    const start = performance.now();

                    const step = now => {
                        const progress = Math.min((now - start) / duration, 1);
                        entry.target.textContent = Math.floor(progress * target).toLocaleString();
                        if (progress < 1) requestAnimationFrame(step);
                    };

                    requestAnimationFrame(step);
                    observer.unobserve(entry.target);
                });
            },
            { threshold: 0.4 }
        );

        counters.forEach(counter => observer.observe(counter));
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const bars = document.querySelectorAll('.metric-bar');
        if (!bars.length) return undefined;

        const observer = new IntersectionObserver(
            entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    entry.target.style.width = `${entry.target.dataset.progress}%`;
                    observer.unobserve(entry.target);
                });
            },
            { threshold: 0.6 }
        );

        bars.forEach(bar => observer.observe(bar));
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const section = document.querySelector('#industries.horizontal-scroll');
        if (!section) return undefined;

        const pin = section.querySelector('.pin');
        const track = section.querySelector('.track');
        if (!pin || !track) return undefined;

        const vh = () => window.innerHeight;
        const vw = () => window.innerWidth;

        const setup = () => {
            const total = track.scrollWidth;
            const buffer = 32;
            const range = Math.max(total - vw() + buffer, 0);
            section.style.height = `${range + vh()}px`;
        };

        const update = () => {
            const rect = section.getBoundingClientRect();
            const start = rect.top;
            const viewHeight = vh();
            const max = section.offsetHeight - viewHeight;
            const y = Math.min(Math.max(-start, 0), max);
            const total = track.scrollWidth;
            const buffer = 32;
            const range = Math.max(total - vw() + buffer, 0);
            const progress = max > 0 ? y / max : 0;
            const x = -progress * range;
            track.style.transform = `translate3d(${x}px, 0, 0)`;

            const pinned = rect.top <= 0 && rect.bottom >= viewHeight;
            const ended = rect.bottom < viewHeight;
            section.classList.toggle('is-fixed', pinned);
            section.classList.toggle('is-end', ended);
        };

        let raf = null;
        const onScroll = () => {
            if (raf) return;
            raf = window.requestAnimationFrame(() => {
                raf = null;
                update();
            });
        };

        const onResize = () => {
            setup();
            update();
        };

        setup();
        update();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onResize);
        window.addEventListener('load', onResize);
        return () => {
            if (raf) window.cancelAnimationFrame(raf);
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('load', onResize);
            section.classList.remove('is-fixed');
            section.classList.remove('is-end');
        };
    }, []);

    useEffect(() => {
        const items = document.querySelectorAll('.program-item');
        if (!items.length) return undefined;

        const observer = new IntersectionObserver(
            entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add('in-view');
                    observer.unobserve(entry.target);
                });
            },
            { threshold: 0.3 }
        );

        items.forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    return null;
}
