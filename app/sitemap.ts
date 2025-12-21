import type { MetadataRoute } from 'next';

import { events } from '@/lib/events';
import { spaces } from '@/lib/spaces';

function getSiteUrl() {
    return (process.env.NEXT_PUBLIC_SITE_URL || 'https://hivehq.nz').replace(/\/$/, '');
}

export default function sitemap(): MetadataRoute.Sitemap {
    const siteUrl = getSiteUrl();
    const now = new Date();

    const staticRoutes = [
        '/',
        '/bookings',
        '/bookings/room',
        '/rsvp'
    ];

    const dynamicRoutes = [
        ...events.map(event => `/events/${event.slug}`),
        ...spaces.map(space => `/bookings/${space.slug}`)
    ];

    return [...staticRoutes, ...dynamicRoutes].map(route => ({
        url: `${siteUrl}${route}`,
        lastModified: now
    }));
}
