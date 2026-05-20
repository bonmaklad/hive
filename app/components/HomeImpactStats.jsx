'use client';

import { useEffect, useMemo, useState } from 'react';

const EMPTY_STATS = {
    peopleCount: null,
    externalRevenueCents: null,
    memberRevenueCents: null
};

function toNumberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function formatInteger(value) {
    if (value === null) return '...';
    return new Intl.NumberFormat('en-NZ', { maximumFractionDigits: 0 }).format(value);
}

function formatNZD(cents) {
    if (cents === null) return '...';
    return new Intl.NumberFormat('en-NZ', {
        style: 'currency',
        currency: 'NZD',
        maximumFractionDigits: 0
    }).format(cents / 100);
}

export default function HomeImpactStats() {
    const [stats, setStats] = useState(EMPTY_STATS);
    const [status, setStatus] = useState('loading');
    const [openInfo, setOpenInfo] = useState(null);

    useEffect(() => {
        let cancelled = false;

        async function loadStats() {
            try {
                const res = await fetch('/api/public-impact', { cache: 'no-store' });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json?.error || 'Could not load impact stats.');
                if (cancelled) return;

                setStats({
                    peopleCount: toNumberOrNull(json?.stats?.people_count),
                    externalRevenueCents: toNumberOrNull(json?.stats?.external_revenue_cents),
                    memberRevenueCents: toNumberOrNull(json?.stats?.member_revenue_cents)
                });
                setStatus('ready');
            } catch {
                if (!cancelled) setStatus('error');
            }
        }

        loadStats();
        return () => {
            cancelled = true;
        };
    }, []);

    const cards = useMemo(
        () => [
            {
                key: 'people',
                label: 'Supported Jobs',
                value: formatInteger(stats.peopleCount)
            },
            {
                key: 'external',
                label: 'External revenue per year',
                value: formatNZD(stats.externalRevenueCents),
                info: 'Annual money coming from outside Whanganui into HIVE member activity through clients, customers, grants, or projects.'
            },
            {
                key: 'member',
                label: 'Member revenue',
                value: formatNZD(stats.memberRevenueCents),
                info: 'Revenue generated between HIVE members, including members hiring each other, buying services, or helping deliver paid projects together.'
            }
        ],
        [stats.externalRevenueCents, stats.memberRevenueCents, stats.peopleCount]
    );

    return (
        <section className="section home-impact-panel" aria-label="HIVE collective impact statistics">
            <div className="section-tag">Achieved so far</div>
            <div className="home-impact-grid">
                {cards.map(card => (
                    <article className={`home-impact-card ${status === 'loading' ? 'is-loading' : ''}`} key={card.key}>
                        <span className="home-impact-value">{card.value}</span>
                        <div className="home-impact-label-row">
                            <span className="home-impact-label">{card.label}</span>
                            {card.info ? (
                                <button
                                    className={`home-impact-info ${openInfo === card.key ? 'is-open' : ''}`}
                                    type="button"
                                    aria-expanded={openInfo === card.key}
                                    aria-label={card.info}
                                    onClick={() => setOpenInfo(openInfo === card.key ? null : card.key)}
                                >
                                    i
                                    <span className="home-impact-info-tooltip" role="tooltip" aria-hidden={openInfo !== card.key}>
                                        {card.info}
                                    </span>
                                </button>
                            ) : null}
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}
