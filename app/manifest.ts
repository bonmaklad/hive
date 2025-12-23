export default function manifest() {
    return {
        id: '/platform',
        name: 'HIVE Platform',
        short_name: 'HIVE',
        description: 'HIVE member platform',
        start_url: '/platform',
        scope: '/platform',
        display: 'standalone',
        background_color: '#0a0c12',
        theme_color: '#0a0c12',
        icons: [
            {
                src: '/icons/icon-192-dark.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any maskable'
            },
            {
                src: '/icons/icon-512-dark.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable'
            },
            {
                src: '/icons/icon-512-dark.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable'
            }
        ]
    };
}
