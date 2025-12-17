import type { MetadataRoute } from 'next';

function getSiteUrl() {
    return (process.env.NEXT_PUBLIC_SITE_URL || 'https://hivehq.nz').replace(/\/$/, '');
}

export default function robots(): MetadataRoute.Robots {
    const siteUrl = getSiteUrl();

    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: ['/platform', '/login', '/auth']
            }
        ],
        sitemap: `${siteUrl}/sitemap.xml`,
        host: siteUrl
    };
}

