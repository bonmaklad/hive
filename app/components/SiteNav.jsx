'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

export default function SiteNav({
    hashPrefix = '',
    logoHref = '#top',
    ctaHref = '#contact',
    ctaLabel = 'Book a tour'
}) {
    const [navOpen, setNavOpen] = useState(false);

    const links = [
        { label: 'Mission', href: `${hashPrefix}#why` },
        { label: 'Location', href: `${hashPrefix}#where` },
        { label: 'Pains', href: `${hashPrefix}#problems` },
        { label: 'Events', href: `${hashPrefix}#programs` },
        { label: 'Memberships', href: `${hashPrefix}#memberships` }
    ];

    return (
        <nav className="nav">
            <div className="logo-wrap">
                <Link href={logoHref} aria-label="HIVE Whanganui">
                    <Image className="site-logo" src="/logo.png" alt="HIVE Whanganui logo" width={72} height={72} priority />
                </Link>
            </div>
            <button
                className="menu-toggle"
                aria-expanded={navOpen}
                aria-controls="nav-links"
                onClick={() => setNavOpen(open => !open)}
                type="button"
            >
                Menu
            </button>
            <ul id="nav-links" className={`nav-links ${navOpen ? 'open' : ''}`}>
                {links.map(link => (
                    <li key={link.href}>
                        <Link href={link.href} onClick={() => setNavOpen(false)}>
                            {link.label}
                        </Link>
                    </li>
                ))}
            </ul>
            <Link className="btn ghost" href={ctaHref}>
                {ctaLabel}
            </Link>
        </nav>
    );
}
