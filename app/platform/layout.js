import PlatformShell from './PlatformShell';

export const dynamic = 'force-dynamic';

export const metadata = {
    robots: {
        index: false,
        follow: false
    }
};

export default async function PlatformLayout({ children }) {
    return <PlatformShell>{children}</PlatformShell>;
}
