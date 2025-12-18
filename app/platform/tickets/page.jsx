import Link from 'next/link';
import TicketsClient from './tickets-client';

export const dynamic = 'force-dynamic';

export default function PlatformTicketsPage() {
    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Tickets</h1>
                    <p className="platform-subtitle">Raise support requests and track progress.</p>
                </div>
                <Link className="btn ghost" href="/platform">
                    Back to dashboard
                </Link>
            </div>

            <TicketsClient />
        </main>
    );
}

