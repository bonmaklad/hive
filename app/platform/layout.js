import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = {
    robots: {
        index: false,
        follow: false
    }
};

export default async function PlatformLayout({ children }) {
    const supabase = createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();

    if (!data?.user) {
        redirect('/login?next=/platform');
    }

    return (
        <div className="platform-shell">
            <header className="platform-header">
                <Link href="/platform" className="platform-brand">
                    Platform
                </Link>
                <nav className="platform-nav">
                    <Link href="/platform" className="btn ghost">
                        Dashboard
                    </Link>
                    <Link href="/platform/sites/new" className="btn primary">
                        New site
                    </Link>
                    <Link href="/auth/signout" className="btn secondary">
                        Sign out
                    </Link>
                </nav>
            </header>
            <div className="platform-content">{children}</div>
        </div>
    );
}
