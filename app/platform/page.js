import DashboardClient from './DashboardClient';

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

            <DashboardClient />
        </main>
    );
}
