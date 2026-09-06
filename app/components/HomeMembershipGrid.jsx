'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import MembershipTierCta from './MembershipTierCta';

const FALLBACK_MEMBERSHIPS = [
    {
        title: 'Private office',
        priceCents: 12500,
        image: '/office6.jpg',
        perks: ['24/7 secure access', 'Lockable Privacy', 'Priority Space Booking', 'Additional Members'],
        plan: 'office',
        availableCta: 'Secure Office Space',
        waitlistCta: 'Join the waitlist',
        ctaType: 'cta'
    },
    {
        title: 'Assigned desk',
        priceCents: 5000,
        image: '/desks.jpg',
        perks: ['Dedicated desk', 'Allocated Secure Storeroom', 'Event + workshop invites', 'Guest pass access'],
        plan: 'desk',
        availableCta: 'Reserve a private desk',
        waitlistCta: 'Join the waitlist',
        ctaType: 'cta'
    },
    {
        title: 'Hive membership',
        priceCents: 2500,
        image: '/lounge1.jpg',
        perks: ['Drop-in lounge access', 'HIVE Event Access', 'Hot desk access', 'Coffee!'],
        plan: 'member',
        ctaLabel: 'Become a member',
        ctaType: 'member'
    }
];

const UNIT_TYPES = {
    desk: new Set(['desk', 'desk_pod']),
    office: new Set(['private_office', 'small_office', 'premium_office'])
};

function formatPrice(cents) {
    const value = Number(cents);
    if (!Number.isFinite(value) || value < 0) return '$0';
    return new Intl.NumberFormat('en-NZ', {
        style: 'currency',
        currency: 'NZD',
        maximumFractionDigits: 0
    }).format(value / 100);
}

function isAvailableUnit(unit, types) {
    if (!unit || !types.has(unit?.unit_type)) return false;
    const remaining = Number(unit?.slots_remaining);
    if (Number.isFinite(remaining)) return remaining > 0;
    return unit?.is_vacant === true || unit?.is_full === false;
}

function pickUnit(units, typeKey) {
    const types = UNIT_TYPES[typeKey];
    if (!types) return null;

    const matches = Array.isArray(units)
        ? units.filter(unit => isAvailableUnit(unit, types))
        : [];

    if (!matches.length) return null;

    return matches.slice().sort((a, b) => {
        const priceA = Number(a?.display_price_cents || Infinity);
        const priceB = Number(b?.display_price_cents || Infinity);
        if (priceA !== priceB) return priceA - priceB;

        const buildingA = String(a?.building || '').localeCompare(String(b?.building || ''));
        if (buildingA !== 0) return buildingA;

        const unitA = Number(a?.unit_number);
        const unitB = Number(b?.unit_number);
        const aIsNum = Number.isFinite(unitA);
        const bIsNum = Number.isFinite(unitB);
        if (aIsNum && bIsNum) return unitA - unitB;

        return String(a?.unit_number || '').localeCompare(String(b?.unit_number || ''));
    })[0];
}

export default function HomeMembershipGrid() {
    const [units, setUnits] = useState([]);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                const res = await fetch('/api/availability', { cache: 'no-store' });
                const json = await res.json().catch(() => ({}));
                if (cancelled) return;
                if (!res.ok) return setUnits([]);
                setUnits(Array.isArray(json?.units) ? json.units : []);
            } catch {
                if (!cancelled) setUnits([]);
            }
        };

        load();
        const interval = window.setInterval(load, 60_000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, []);

    const derivedMemberships = useMemo(() => {
        const deskUnit = pickUnit(units, 'desk');
        const officeUnit = pickUnit(units, 'office');

        return FALLBACK_MEMBERSHIPS.map(card => {
            if (card.plan === 'desk') {
                const image = card.image;
                const priceCents = deskUnit ? Number(deskUnit.display_price_cents || 0) : card.priceCents;
                return {
                    ...card,
                    image: deskUnit?.image_url || deskUnit?.signed_image_url || image,
                    priceCents: Number.isFinite(priceCents) && priceCents > 0 ? priceCents : card.priceCents
                };
            }

            if (card.plan === 'office') {
                const image = card.image;
                const priceCents = officeUnit ? Number(officeUnit.display_price_cents || 0) : card.priceCents;
                return {
                    ...card,
                    image: officeUnit?.image_url || officeUnit?.signed_image_url || image,
                    priceCents: Number.isFinite(priceCents) && priceCents > 0 ? priceCents : card.priceCents
                };
            }

            return card;
        });
    }, [units]);

    return (
        <section id="memberships" className="section memberships">
            <div className="section-tag">Membership</div>
            <h2>Pick the landing pad that matches your build cycle.</h2>
            <div className="membership-grid">
                {derivedMemberships.map(tier => (
                    <article key={tier.title}>
                        <h3>{tier.title}</h3>
                        <div className="membership-photo" aria-hidden="true">
                            <Image
                                src={tier.image}
                                alt=""
                                fill
                                sizes="(max-width: 960px) 100vw, 33vw"
                                style={{ objectFit: 'cover' }}
                            />
                        </div>
                        <p className="price">
                            {formatPrice(tier.priceCents)}
                            <span>/week</span>
                        </p>
                        <ul>
                            {tier.perks.map(perk => (
                                <li key={perk}>{perk}</li>
                            ))}
                        </ul>
                        {tier.plan === 'member' ? (
                            <MembershipTierCta
                                plan={tier.plan}
                                memberLabel={tier.ctaLabel}
                                availableLabel={tier.ctaLabel}
                                waitlistLabel={tier.waitlistCta || 'Join the waitlist'}
                            />
                        ) : (
                            <MembershipTierCta
                                plan={tier.plan}
                                availableLabel={tier.availableCta || tier.cta}
                                waitlistLabel={tier.waitlistCta || 'Join the waitlist'}
                                memberLabel={tier.ctaLabel || 'Become a member'}
                            />
                        )}
                    </article>
                ))}
                <article className="day-rate-card">
                    <div className="day-rate-copy">
                        <h3>Day rate</h3>
                        <p className="price">
                            $25
                            <span>/day</span>
                        </p>
                        <p>
                            Need a single high-focus day at HIVE? Grab a day pass for lounge and hot desk access.
                        </p>
                    </div>
                    <a
                        className="btn primary"
                        href="https://buy.stripe.com/fZu5kC7et0OPfS1cjCeME04"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Buy a Day
                    </a>
                </article>
            </div>
        </section>
    );
}
