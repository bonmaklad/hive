import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function PlatformDashboardPage() {
    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Dashboard</h1>
                    <p className="platform-subtitle">Manage your membership, bookings, and hosting in one place.</p>
                </div>
            </div>

            <div className="platform-grid">
                <section className="platform-card span-6" aria-label="Membership">
                    <div className="platform-kpi-row">
                        <h2 style={{ margin: 0 }}>Membership</h2>
                        <span className="badge success">Live</span>
                    </div>
                    <p className="platform-subtitle">Plan: Premium • $499 / month</p>
                    <p className="platform-subtitle">Next invoice: 05 Jan 2026</p>
                    <div className="platform-card-actions">
                        <Link className="btn primary" href="/platform/membership">
                            See details
                        </Link>
                    </div>
                </section>

                <section className="platform-card span-6" aria-label="Room booking">
                    <div className="platform-kpi-row">
                        <h2 style={{ margin: 0 }}>Book a room</h2>
                        <span className="badge neutral">3 tokens</span>
                    </div>
                    <p className="platform-subtitle">Use your monthly credits, or pay-as-you-go when you run out.</p>
                    <div className="platform-card-actions">
                        <Link className="btn primary" href="/platform/rooms">
                            Book now
                        </Link>
                    </div>
                </section>

                <section className="platform-card span-6" aria-label="Website hosting">
                    <div className="platform-kpi-row">
                        <h2 style={{ margin: 0 }}>Website hosting</h2>
                        <span className="badge neutral">Sites</span>
                    </div>
                    <p className="platform-subtitle">View sites, create new ones, and track deployment status.</p>
                    <div className="platform-card-actions">
                        <Link className="btn primary" href="/platform/hosting">
                            Manage hosting
                        </Link>
                        <Link className="btn ghost" href="/platform/sites/new">
                            Create site
                        </Link>
                    </div>
                </section>

                <section className="platform-card span-6" aria-label="Membership benefits">
                    <div className="platform-kpi-row">
                        <h2 style={{ margin: 0 }}>Membership benefits</h2>
                        <span className="badge pending">Coming soon</span>
                    </div>
                    <p className="platform-subtitle">Perks, partner discounts, events, and member-only resources.</p>
                    <div className="platform-card-actions">
                        <Link className="btn ghost" href="/platform/benefits">
                            View benefits
                        </Link>
                    </div>
                </section>
            </div>
        </main>
    );
}
