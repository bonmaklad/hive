/** @type {import('next').NextConfig} */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
let supabaseHost = null;
try {
    supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : null;
} catch {
    supabaseHost = null;
}

const nextConfig = {
    reactStrictMode: true,
    output: "standalone",
    poweredByHeader: false,
    productionBrowserSourceMaps: true,
    images: {
        formats: ['image/avif', 'image/webp'],
        deviceSizes: [360, 640, 750, 828, 1080, 1200, 1600],
        imageSizes: [16, 32, 48, 64, 96, 128, 256],
        minimumCacheTTL: 86400,
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'images.unsplash.com'
            },
            {
                protocol: 'https',
                hostname: 'plus.unsplash.com'
            },
            ...(supabaseHost
                ? [
                    { protocol: 'https', hostname: supabaseHost },
                    { protocol: 'http', hostname: supabaseHost }
                ]
                : [])
        ]
    },
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
                ]
            },
            {
                source: '/hero/(.*)',
                headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]
            },
            {
                source: '/logo-square.png',
                headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]
            },
            {
                source: '/icons/(.*)'
                ,headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]
            }
        ];
    }
};

module.exports = nextConfig;
