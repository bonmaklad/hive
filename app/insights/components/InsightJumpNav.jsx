'use client';

import { useEffect, useState } from 'react';

export default function InsightJumpNav({ items }) {
    const [isFixed, setIsFixed] = useState(false);
    const [activeHref, setActiveHref] = useState(items[0]?.href || '#overview');

    useEffect(() => {
        let frame = null;

        const updateNavState = () => {
            if (frame) return;

            frame = window.requestAnimationFrame(() => {
                const hero = document.querySelector('.insights-article-hero');
                setIsFixed(hero ? hero.getBoundingClientRect().bottom <= 0 : true);

                const activeLine = window.innerWidth <= 820 ? 120 : 130;
                let current = items[0]?.href || '#overview';

                items.forEach(item => {
                    const section = document.querySelector(item.href);
                    if (section && section.getBoundingClientRect().top <= activeLine) {
                        current = item.href;
                    }
                });

                setActiveHref(current);
                frame = null;
            });
        };

        updateNavState();
        window.addEventListener('scroll', updateNavState, { passive: true });
        window.addEventListener('resize', updateNavState);
        window.addEventListener('hashchange', updateNavState);

        return () => {
            if (frame) window.cancelAnimationFrame(frame);
            window.removeEventListener('scroll', updateNavState);
            window.removeEventListener('resize', updateNavState);
            window.removeEventListener('hashchange', updateNavState);
        };
    }, [items]);

    return (
        <div className="insights-jump-wrap">
            <nav className={`insights-jump-nav ${isFixed ? 'is-fixed' : ''}`} aria-label="Report sections">
                {items.map(item => (
                    <a
                        className={activeHref === item.href ? 'is-active' : ''}
                        href={item.href}
                        key={item.href}
                    >
                        {item.label}
                    </a>
                ))}
            </nav>
        </div>
    );
}
