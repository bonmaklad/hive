import Link from 'next/link';
import { Suspense } from 'react';
import LoginForm from './LoginForm';

export const metadata = {
    robots: {
        index: false,
        follow: false
    }
};

export default function LoginPage() {
    return (
        <main className="platform-shell">
            <div className="auth-wrap">
            <div className="platform-card auth-card">
                <h1>Platform sign in</h1>
                <p className="platform-subtitle">Sign in to manage your sites and view deployments.</p>
                <Suspense fallback={<p className="platform-subtitle">Loading…</p>}>
                    <LoginForm />
                </Suspense>
                <p className="platform-message info" style={{ marginTop: '1rem' }}>
                    First time here? Use the invite email you received to sign in and set your password in settings.
                </p>
                <p className="platform-footer">
                    <Link href="/" className="btn ghost">
                        Back to site
                    </Link>
                </p>
            </div>
            </div>
        </main>
    );
}
