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

export default function DirectoryClient({ tenants = [], error = '', totalCount }) {
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
                        placeholder="Search by name, contact, or location"
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
                        const hasAbout = Boolean(tenant?.about);
                        return (
                            <article className="directory-card" style={{ '--i': index }} key={tenant?.id || `${tenant?.name}-${index}`}>
                                <div className="directory-card-top">
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
                                    <div>
                                        <h3>{displayName || 'Tenant'}</h3>
                                        {tenant?.keyContactName ? (
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
                                                <span className="directory-meta-label">Email</span>
                                                <a href={emailHref}>{tenant.email}</a>
                                            </div>
                                        ) : null}
                                        {hasWebsite ? (
                                            <div>
                                                <span className="directory-meta-label">Website</span>
                                                <a href={websiteHref} target="_blank" rel="noreferrer">
                                                    {websiteLabel || tenant?.websiteUrl}
                                                </a>
                                            </div>
                                        ) : null}
                                        {hasPhone ? (
                                            <div>
                                                <span className="directory-meta-label">Phone</span>
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
