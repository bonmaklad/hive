import PlatformShell from './PlatformShell';
import PwaRegister from './PwaRegister';

export const dynamic = 'force-dynamic';

export const metadata = {
    robots: {
        index: false,
        follow: false
    }
};

export default async function PlatformLayout({ children }) {
    return (
        <>
            <PwaRegister />
            <PlatformShell>{children}</PlatformShell>
        </>
    );
}
