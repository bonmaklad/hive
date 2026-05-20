import Link from 'next/link';
import EventCalendarClient from '../../events/EventCalendarClient';

export const dynamic = 'force-dynamic';

export default function PlatformEventsPage() {
    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Events</h1>
                    <p className="platform-subtitle">Public and member events.</p>
                </div>
                <Link className="btn ghost" href="/events">
                    Public view
                </Link>
            </div>
            <EventCalendarClient audience="member" canCreate />
        </main>
    );
}
