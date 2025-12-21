function parseTimeToMinutes(value) {
    const [hh, mm] = String(value || '0:0').split(':').map(v => Number(v));
    return (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
}

function minutesToTime(minutes) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
}

function normalizeTime(value) {
    const v = typeof value === 'string' ? value.trim() : '';
    if (!v) return '';
    if (/^\d{2}:\d{2}$/.test(v)) return v;
    if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v.slice(0, 5);
    return '';
}

function isWeekday(dateString) {
    const d = new Date(`${dateString}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return false;
    const day = d.getUTCDay(); // 0 Sun .. 6 Sat
    return day >= 1 && day <= 5;
}

function yyyyMmDdLocal(date) {
    const d = date instanceof Date ? date : new Date();
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function tomorrowLocal() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return yyyyMmDdLocal(d);
}

export function getAllowedWindow({ spaceSlug, bookingDate }) {
    if (spaceSlug === 'hive-lounge') {
        return {
            kind: 'fixed',
            start_time: '17:00',
            end_time: '22:00',
            label: '5:00pm–10:00pm',
            reason: 'Hive Lounge is booked as a single 5pm–10pm event slot.'
        };
    }

    if (!isWeekday(bookingDate)) {
        return {
            kind: 'blocked',
            reason: 'Meeting rooms can only be booked Monday to Friday.'
        };
    }

    return {
        kind: 'window',
        start_time: '09:00',
        end_time: '17:00',
        label: '9:00am–5:00pm',
        reason: null
    };
}

export function validateBookingWindow({ spaceSlug, bookingDate, startTime, endTime }) {
    const start = normalizeTime(startTime);
    const end = normalizeTime(endTime);
    if (!start || !end) return { ok: false, error: 'Invalid start_time or end_time.' };

    // Public bookings are next-day onwards only.
    const minDate = tomorrowLocal();
    if (typeof bookingDate === 'string' && bookingDate < minDate) {
        return { ok: false, error: 'Bookings must be made at least one day in advance.' };
    }

    const window = getAllowedWindow({ spaceSlug, bookingDate });
    if (window.kind === 'blocked') return { ok: false, error: window.reason };

    if (window.kind === 'fixed') {
        if (start !== window.start_time || end !== window.end_time) {
            return { ok: false, error: `This room can only be booked for ${window.label}.` };
        }
        return { ok: true };
    }

    const startMin = parseTimeToMinutes(start);
    const endMin = parseTimeToMinutes(end);
    if (!(endMin > startMin)) return { ok: false, error: 'end_time must be after start_time.' };

    const minStart = parseTimeToMinutes(window.start_time);
    const maxEnd = parseTimeToMinutes(window.end_time);

    if (startMin < minStart || endMin > maxEnd) {
        return { ok: false, error: `Bookings must be within ${window.label}.` };
    }

    return { ok: true };
}

export function getDefaultRangeForSpace({ spaceSlug, bookingDate }) {
    const window = getAllowedWindow({ spaceSlug, bookingDate });
    if (window.kind === 'fixed') {
        return { start_time: window.start_time, end_time: window.end_time };
    }
    if (window.kind === 'blocked') {
        return { start_time: '', end_time: '' };
    }
    return { start_time: window.start_time, end_time: minutesToTime(parseTimeToMinutes(window.start_time) + 60) };
}
