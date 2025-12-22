import './globals.css';
import { Space_Grotesk } from 'next/font/google';
import AuthSessionSync from './AuthSessionSync';

const spaceGrotesk = Space_Grotesk({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
    display: 'swap'
});

export const metadata = {
    title: 'HIVE Whanganui | Tech Incubator & Workspace',
    description: 'HIVE Whanganui is the tech-focused incubator and startup workspace accelerating 1,000 new ventures.',
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://hivehq.nz'),
    manifest: '/manifest.webmanifest',
    appleWebApp: {
        capable: true,
        title: 'HIVE Platform',
        statusBarStyle: 'black-translucent'
    },
    icons: {
        icon: [
            { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ],
        apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }]
    },
    openGraph: {
        type: 'website',
        url: '/',
        title: 'HIVE Whanganui | Tech Incubator & Workspace',
        description: 'HIVE Whanganui is the tech-focused incubator and startup workspace accelerating 1,000 new ventures.'
    },
    twitter: {
        card: 'summary_large_image',
        title: 'HIVE Whanganui | Tech Incubator & Workspace',
        description: 'HIVE Whanganui is the tech-focused incubator and startup workspace accelerating 1,000 new ventures.'
    }
};

export const viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: '#0a0c12'
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body className={spaceGrotesk.className}>
                <AuthSessionSync />
                {children}
            </body>
        </html>
    );
}
