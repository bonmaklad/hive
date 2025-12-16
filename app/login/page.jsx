import Link from 'next/link';
import { redirect } from 'next/navigation';
import LoginForm from './LoginForm';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }) {
    const supabase = createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();

    if (data?.user) {
        redirect(searchParams?.next || '/platform');
    }

    return (
        <main className="platform-shell">
            <div className="platform-card">
                <h1>Platform sign in</h1>
                <p className="platform-subtitle">Sign in to manage your sites and view deployments.</p>
                <LoginForm />
                <p className="platform-footer">
                    <Link href="/" className="btn ghost">
                        Back to site
                    </Link>
                </p>
            </div>
        </main>
    );
}
