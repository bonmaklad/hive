'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function formatPhoneHref(value) {
    const cleaned = String(value || '').replace(/[^+\d]/g, '');
    return cleaned ? `tel:${cleaned}` : '';
}

function formatWebsiteHref(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
}

function formatWebsiteLabel(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function getInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'H';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function ContactLabel({ type, compact }) {
    if (!compact) return <span className="directory-meta-label">{type}</span>;

    return (
        <span className="directory-meta-icon">
            <span className="sr-only">{type}</span>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                {type === 'Email' ? (
                    <>
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <path d="m3 6 9 7 9-7" />
                    </>
                ) : type === 'Website' ? (
                    <>
                        <circle cx="12" cy="12" r="9" />
                        <ellipse cx="12" cy="12" rx="4" ry="9" />
                        <path d="M3 12h18" />
                    </>
                ) : (
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.79a2 2 0 0 1-.45 2.11L8.09 9.89a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.89.33 1.83.56 2.79.69A2 2 0 0 1 22 16.92Z" />
                )}
            </svg>
        </span>
    );
}

export default function DirectoryClient({
    tenants = [],
    error = '',
    totalCount,
    showDescriptions = true,
    showDirections = false,
    showKeyContact = true,
    compactContacts = false
}) {
    const [query, setQuery] = useState('');

    const normalizedQuery = normalizeText(query);

    const filteredTenants = useMemo(() => {
        const list = Array.isArray(tenants) ? tenants : [];

        return list.filter(tenant => {
            if (!normalizedQuery) return true;

            const haystack = normalizeText([
                tenant?.name,
                tenant?.profileName,
                tenant?.about,
                tenant?.phone,
                tenant?.email,
                tenant?.websiteUrl,
                tenant?.officeLocation,
                tenant?.keyContactName
            ].filter(Boolean).join(' '));

            return haystack.includes(normalizedQuery);
        });
    }, [normalizedQuery, tenants]);

    const listCount = Array.isArray(tenants) ? tenants.length : 0;
    const displayTotal = Number.isFinite(totalCount) ? totalCount : listCount;
    const filteredCount = filteredTenants.length;

    return (
        <div className="directory-panel">
            <div className="directory-controls">
                <label className="directory-search">
                    <input
                        type="search"
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder="Search by name"
                        aria-label="Search directory"
                    />
                </label>

                <div className="directory-results">
                    {error ? (
                        <p className="platform-message error">{error}</p>
                    ) : (
                        <p>
                            Showing {filteredCount} of {displayTotal} teams
                        </p>
                    )}
                </div>
            </div>

            {filteredCount ? (
                <div className="directory-grid">
                    {filteredTenants.map((tenant, index) => {
                        const phoneHref = formatPhoneHref(tenant?.phone);
                        const emailHref = tenant?.email ? `mailto:${tenant.email}` : '';
                        const websiteHref = formatWebsiteHref(tenant?.websiteUrl);
                        const websiteLabel = formatWebsiteLabel(tenant?.websiteUrl);
                        const displayName = tenant?.profileName || tenant?.name || '';
                        const initials = getInitials(displayName);
                        const hasEmail = Boolean(tenant?.email);
                        const hasPhone = Boolean(tenant?.phone);
                        const hasWebsite = Boolean(websiteHref);
                        const hasContact = hasEmail || hasPhone || hasWebsite;
                        const hasLocation = Boolean(tenant?.officeLocation);
                        const hasAbout = showDescriptions && Boolean(tenant?.about);
                        const directionBuildings = showDirections
                            ? (tenant?.buildings?.length ? tenant.buildings : ['122'])
                            : [];
                        return (
                            <article className="directory-card" style={{ '--i': index }} key={tenant?.id || `${tenant?.name}-${index}`}>
                                <div className="directory-card-top">
                                    <div className="directory-logo-row">
                                        <div className="directory-logo" aria-hidden="true">
                                            {tenant?.logoUrl ? (
                                                <Image
                                                    src={tenant.logoUrl}
                                                    alt=""
                                                    width={72}
                                                    height={72}
                                                    sizes="72px"
                                                    quality={60}
                                                />
                                            ) : (
                                                <span>{initials}</span>
                                            )}
                                        </div>
                                        {showDirections ? (
                                            <div className="directory-directions">
                                                {directionBuildings.map(building => (
                                                    <span
                                                        className="directory-direction"
                                                        role="img"
                                                        aria-label={building === '116' ? 'Turn right for 116' : 'Turn left for 122 and members'}
                                                        key={building}
                                                    >
                                                        <svg viewBox="0 0 32 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                                                            <path d={building === '116' ? 'M4 12h24m-9-9 9 9-9 9' : 'M28 12H4m9-9-9 9 9 9'} />
                                                        </svg>
                                                    </span>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                    <div>
                                        <h3>{displayName || 'Tenant'}</h3>
                                        {showKeyContact && tenant?.keyContactName ? (
                                            <p className="directory-contact">Key contact: {tenant.keyContactName}</p>
                                        ) : null}
                                        {hasLocation ? (
                                            <p className="directory-location">{tenant.officeLocation}</p>
                                        ) : null}
                                    </div>
                                </div>

                                {hasAbout ? (
                                    <p className="directory-about">{tenant.about}</p>
                                ) : null}

                                {hasContact ? (
                                    <div className="directory-meta">
                                        {hasEmail ? (
                                            <div>
                                                <ContactLabel type="Email" compact={compactContacts} />
                                                <a href={emailHref}>{tenant.email}</a>
                                            </div>
                                        ) : null}
                                        {hasWebsite ? (
                                            <div>
                                                <ContactLabel type="Website" compact={compactContacts} />
                                                <a href={websiteHref} target="_blank" rel="noreferrer">
                                                    {websiteLabel || tenant?.websiteUrl}
                                                </a>
                                            </div>
                                        ) : null}
                                        {hasPhone ? (
                                            <div>
                                                <ContactLabel type="Phone" compact={compactContacts} />
                                                <a href={phoneHref}>{tenant.phone}</a>
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                            </article>
                        );
                    })}
                </div>
            ) : (
                <div className="directory-empty">
                    <h3>No matches</h3>
                    <p>Try another keyword to see everyone in HIVE HQ.</p>
                </div>
            )}
        </div>
    );
}
