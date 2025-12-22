import type { MetadataRoute } from 'next';

import { events } from '@/lib/events';
import { getSpaceSlugs } from '@/lib/spaces';

function getSiteUrl() {
    return (process.env.NEXT_PUBLIC_SITE_URL || 'https://hivehq.nz').replace(/\/$/, '');
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const siteUrl = getSiteUrl();
    const now = new Date();

    const staticRoutes = [
        '/',
        '/bookings',
        '/bookings/room',
        '/rsvp'
    ];

    const spaceSlugs = await getSpaceSlugs().catch(() => []);

    const dynamicRoutes = [
        ...events.map(event => `/events/${event.slug}`),
        ...spaceSlugs.map(slug => `/bookings/${slug}`)
    ];

    return [...staticRoutes, ...dynamicRoutes].map(route => ({
        url: `${siteUrl}${route}`,
        lastModified: now
    }));
}
