import './globals.css';
import { Space_Grotesk } from 'next/font/google';

const spaceGrotesk = Space_Grotesk({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700']
});

export const metadata = {
    title: 'HIVE Whanganui | Tech Incubator & Workspace',
    description: 'HIVE Whanganui is the tech-focused incubator and startup workspace accelerating 1,000 new ventures.'
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body className={spaceGrotesk.className}>{children}</body>
        </html>
    );
}
