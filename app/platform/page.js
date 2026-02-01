import DashboardClient from './DashboardClient';
import TokenPurchaseModal from './components/TokenPurchaseModal';

export const dynamic = 'force-dynamic';

export default function PlatformDashboardPage() {
    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Dashboard</h1>
                    <p className="platform-subtitle">Manage your membership, bookings, and hosting in one place.</p>
                </div>
                <TokenPurchaseModal triggerLabel="Tokens" triggerVariant="icon" showStatus returnPath="/platform" />
            </div>

            <DashboardClient />
        </main>
    );
}
