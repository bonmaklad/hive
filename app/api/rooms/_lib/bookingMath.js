function parseTimeToMinutes(value) {
    const [hh, mm] = String(value || '0:0').split(':').map(v => Number(v));
    return (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
}

export function computeHours({ startTime, endTime }) {
    const startMin = parseTimeToMinutes(startTime);
    const endMin = parseTimeToMinutes(endTime);
    const minutes = endMin - startMin;
    if (!Number.isFinite(minutes) || minutes <= 0) return 0;
    return Math.round(minutes / 60);
}

export function getPricingCents(spaceRow, hours) {
    const perEvent = Number(spaceRow?.pricing_per_event_cents || 0);
    const halfDay = Number(spaceRow?.pricing_half_day_cents || 0);
    const fullDay = Number(spaceRow?.pricing_full_day_cents || 0);

    if (!hours || hours <= 0) return { label: '', amount: 0 };

    // Per-event spaces (e.g. Hive Lounge) are a flat rate.
    if (perEvent > 0) {
        return { label: 'per event', amount: perEvent };
    }

    if (fullDay && hours >= 8) {
        return { label: 'full day', amount: fullDay };
    }
    if (halfDay && hours >= 4) {
        // Scale 4–7 hours between half-day and full-day, so the first 4 hours are effectively more expensive per hour.
        if (fullDay && fullDay > halfDay && hours > 4) {
            const extraHours = Math.min(4, hours - 4);
            const extraPerHour = (fullDay - halfDay) / 4;
            return { label: `${hours} hour(s)`, amount: Math.round(halfDay + extraPerHour * extraHours) };
        }
        return { label: 'half day', amount: halfDay };
    }

    // Hourly pricing: use half-day as the 0–4 hour rate when available, otherwise full-day as 0–8.
    if (halfDay) {
        return { label: `${hours} hour(s)`, amount: Math.round((halfDay / 4) * hours) };
    }
    if (fullDay) {
        return { label: `${hours} hour(s)`, amount: Math.round((fullDay / 8) * hours) };
    }

    return { label: `${hours} hour(s)`, amount: 0 };
}

export function computeCashDueCents({ basePriceCents, requiredTokens, tokensApplied }) {
    const price = Math.max(0, Number(basePriceCents || 0));
    const req = Math.max(0, Number(requiredTokens || 0));
    const applied = Math.max(0, Number(tokensApplied || 0));
    if (!price) return 0;
    if (!req) return price;
    const remaining = Math.max(0, req - Math.min(req, applied));
    if (!remaining) return 0;
    return Math.round((price * remaining) / req);
}

export function overlaps({ aStart, aEnd, bStart, bEnd }) {
    const a0 = parseTimeToMinutes(aStart);
    const a1 = parseTimeToMinutes(aEnd);
    const b0 = parseTimeToMinutes(bStart);
    const b1 = parseTimeToMinutes(bEnd);
    return a0 < b1 && a1 > b0;
}

export function monthStart(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-01`;
}
