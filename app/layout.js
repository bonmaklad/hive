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
