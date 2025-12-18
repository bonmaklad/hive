import Link from 'next/link';
import NewSiteForm from './NewSiteForm';

export const dynamic = 'force-dynamic';

export default function NewSitePage() {
    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Create a site</h1>
                    <p className="platform-subtitle">This only stores metadata and deployment status in Supabase.</p>
                </div>
                <Link className="btn ghost" href="/platform/hosting">
                    Back to hosting
                </Link>
            </div>

            <div className="platform-card">
                <NewSiteForm />
            </div>
        </main>
    );
}
