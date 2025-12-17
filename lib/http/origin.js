function isLikelyInternalHostname(hostname) {
    const h = String(hostname || '').toLowerCase();
    return h === '0.0.0.0' || h === '127.0.0.1' || h === 'localhost';
}

function firstHeaderValue(value) {
    return String(value || '')
        .split(',')[0]
        .trim();
}

export function getPublicOrigin(request) {
    const headers = request.headers;
    const forwardedProto = firstHeaderValue(headers.get('x-forwarded-proto')) || 'https';

    const forwardedHost = firstHeaderValue(headers.get('x-forwarded-host'));
    const host = firstHeaderValue(headers.get('host'));

    const preferredHost = forwardedHost || host;
    const hostname = preferredHost.split(':')[0];

    if (preferredHost && !isLikelyInternalHostname(hostname)) {
        return `${forwardedProto}://${preferredHost}`;
    }

    const configured =
        (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '').trim().replace(/\/$/, '');

    if (configured) return configured;

    return new URL(request.url).origin;
}

