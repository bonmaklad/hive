'use client';

import { useEffect, useMemo, useState } from 'react';
import HiveMembershipSignupModal from './HiveMembershipSignupModal';

const PLAN_UNIT_TYPES = {
    desk: new Set(['desk', 'desk_pod']),
    office: new Set(['private_office', 'small_office', 'premium_office'])
};

let availabilityPromise = null;

async function loadAvailability() {
    if (!availabilityPromise) {
        availabilityPromise = fetch('/api/availability', { cache: 'no-store' })
            .then(async res => {
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json?.error || 'Failed to load availability.');
                return Array.isArray(json?.units) ? json.units : [];
            });
    }
    return availabilityPromise;
}

function hasPlanAvailability(units, plan) {
    const types = PLAN_UNIT_TYPES[plan];
    if (!types) return true;
    return (units || []).some(unit => types.has(unit?.unit_type));
}

export default function MembershipTierCta({
    plan,
    availableLabel,
    waitlistLabel = 'Join the waitlist',
    memberLabel = 'Become a member'
}) {
    const isDynamicPlan = plan === 'desk' || plan === 'office';
    const [hasAvailability, setHasAvailability] = useState(null);

    useEffect(() => {
        if (!isDynamicPlan) return;
        let cancelled = false;

        const run = async () => {
            try {
                const units = await loadAvailability();
                if (cancelled) return;
                setHasAvailability(hasPlanAvailability(units, plan));
            } catch {
                if (!cancelled) setHasAvailability(false);
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [isDynamicPlan, plan]);

    const showWaitlist = useMemo(() => isDynamicPlan && hasAvailability === false, [hasAvailability, isDynamicPlan]);

    if (showWaitlist) {
        return (
            <a className="btn secondary" href="#contact">
                {waitlistLabel}
            </a>
        );
    }

    if (plan === 'member') {
        return <HiveMembershipSignupModal triggerLabel={memberLabel} plan="member" />;
    }

    return (
        <HiveMembershipSignupModal
            triggerLabel={availableLabel}
            plan={plan}
        />
    );
}

