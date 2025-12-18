import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function PlatformBenefitsPage() {
    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Membership benefits</h1>
                    <p className="platform-subtitle">Coming soon.</p>
                </div>
                <Link className="btn ghost" href="/platform">
                    Back to dashboard
                </Link>
            </div>

            <section className="platform-card">
                <h2 style={{ marginTop: 0 }}>What’s coming</h2>
                <p className="platform-subtitle">
                    We’re adding member-only benefits here (discounts, resources, and partner offers). This page is front-end only for now.
                </p>
            </section>
        </main>
    );
}

