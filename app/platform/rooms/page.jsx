import Link from 'next/link';
import RoomBookingClient from './room-booking-client';

export const dynamic = 'force-dynamic';

export default function PlatformRoomsPage() {
    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Book a room</h1>
                    <p className="platform-subtitle">Choose a room and time, then request a booking.</p>
                </div>
                <Link className="btn ghost" href="/platform">
                    Back to dashboard
                </Link>
            </div>

            <RoomBookingClient />
        </main>
    );
}
