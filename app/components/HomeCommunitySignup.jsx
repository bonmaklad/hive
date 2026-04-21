'use client';

import { useState } from 'react';

function joinClasses(...values) {
    return values.filter(Boolean).join(' ');
}

function normalizeEmail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function HomeCommunitySignup({
    variant = 'hero',
    sectioned = true,
    title,
    description,
    tag,
    trustText,
    pills
}) {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState('idle');
    const [message, setMessage] = useState('');
    const isCompact = variant === 'compact';

    const resolvedTitle = title || (isCompact ? 'Get startup updates as well.' : 'Free events, startup news, and local momentum.');
    const resolvedDescription =
        description ||
        (isCompact
            ? 'If you are not ready to enquire yet, join the community list for free events, newsletter drops, and local startup scene updates.'
            : 'Join the HIVE community list to hear about free events, our business and startup newsletter, and what is happening across the Whanganui startup scene.');
    const resolvedTag = tag || (isCompact ? 'Community list' : 'Stay in the loop');
    const resolvedTrustText = trustText || '';
    const resolvedPills = Array.isArray(pills)
        ? pills
        : ['Free events', 'Startup newsletter', 'Local scene updates'];

    async function handleSubmit(event) {
        event.preventDefault();

        const nextEmail = normalizeEmail(email);
        if (!isValidEmail(nextEmail)) {
            setStatus('error');
            setMessage('Enter a valid email address.');
            return;
        }

        setStatus('loading');
        setMessage('');

        try {
            const response = await fetch('/api/community-signups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: nextEmail,
                    personType: 'community',
                    source: 'homepage_subscribe'
                })
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error || 'Could not save your signup right now.');
            }

            setStatus('success');
            setMessage(payload?.message || "Thanks, you're on the list.");
            setEmail('');
        } catch (error) {
            console.error(error);
            setStatus('error');
            setMessage(error?.message || 'Could not save your signup right now.');
        }
    }

    const RootTag = sectioned ? 'section' : 'div';

    return (
        <RootTag
            className={joinClasses(
                sectioned ? 'section community-signup-section' : 'community-signup-card',
                isCompact ? 'is-compact' : null
            )}
            aria-labelledby="community-signup-title"
        >
            <div className="community-signup-shell">
                <div className="community-signup-copy">
                    <p className="section-tag">{resolvedTag}</p>
                    <h2 id="community-signup-title">{resolvedTitle}</h2>
                    <p>{resolvedDescription}</p>
                    <div className="community-signup-pills" aria-hidden="true">
                        {resolvedPills.map(item => (
                            <span key={item}>{item}</span>
                        ))}
                    </div>
                </div>

                <form className="community-signup-form" onSubmit={handleSubmit}>
                    <label className="sr-only" htmlFor="community-signup-email">
                        Email
                    </label>
                    <div className="community-signup-controls">
                        <input
                            id="community-signup-email"
                            type="email"
                            name="email"
                            autoComplete="email"
                            inputMode="email"
                            placeholder="you@company.com"
                            value={email}
                            onChange={event => setEmail(event.target.value)}
                            disabled={status === 'loading'}
                            required
                        />
                        <button className="btn primary" type="submit" disabled={status === 'loading'}>
                            {status === 'loading' ? 'Saving...' : 'Confirm'}
                        </button>
                    </div>
                    <p className="community-signup-trust">{resolvedTrustText}</p>
                    {message ? (
                        <p className={`community-signup-feedback is-${status}`} role="status" aria-live="polite">
                            {message}
                        </p>
                    ) : null}
                </form>
            </div>
        </RootTag>
    );
}
