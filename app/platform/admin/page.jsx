'use client';

import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function AdminHomePage() {
    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Admin</h1>
                    <p className="platform-subtitle">Manage tenants, membership approvals, rooms, and bookings.</p>
                </div>
                <Link className="btn ghost" href="/platform">
                    Back to dashboard
                </Link>
            </div>

            <div className="platform-grid">
                <section className="platform-card span-6">
                    <h2 style={{ marginTop: 0 }}>Tenants</h2>
                    <p className="platform-subtitle">View tenants, users, memberships, credits, and invoices.</p>
                    <div className="platform-card-actions">
                        <Link className="btn primary" href="/platform/admin/tenants">
                            Open tenants
                        </Link>
                    </div>
                </section>

                <section className="platform-card span-6">
                    <h2 style={{ marginTop: 0 }}>Membership requests</h2>
                    <p className="platform-subtitle">Approve or decline membership change requests.</p>
                    <div className="platform-card-actions">
                        <Link className="btn primary" href="/platform/admin/requests">
                            Review requests
                        </Link>
                    </div>
                </section>

                <section className="platform-card span-6">
                    <h2 style={{ marginTop: 0 }}>Bookings</h2>
                    <p className="platform-subtitle">View all room bookings and book on behalf of members.</p>
                    <div className="platform-card-actions">
                        <Link className="btn primary" href="/platform/admin/bookings">
                            Manage bookings
                        </Link>
                    </div>
                </section>
            </div>
        </main>
    );
}

