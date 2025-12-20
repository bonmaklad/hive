import Link from 'next/link';
import BookingsClient from './BookingsClient';

export const dynamic = 'force-dynamic';

export default function PlatformBookingsPage() {
    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Bookings</h1>
                    <p className="platform-subtitle">View your room bookings and token usage.</p>
                </div>
                <Link className="btn ghost" href="/platform">
                    Back to dashboard
                </Link>
            </div>

            <BookingsClient />
        </main>
    );
}

