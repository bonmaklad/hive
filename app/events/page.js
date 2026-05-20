import Link from 'next/link';

import SiteNav from '../components/SiteNav';
import EventCalendarClient from './EventCalendarClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Events | HIVE Whanganui',
    description: 'HIVE events calendar for founders, members, and the Whanganui tech community.'
};

export default function EventsPage() {
    return (
        <>
            <div className="hex-overlay" aria-hidden="true" />
            <header className="events-hero" id="top">
                <SiteNav hashPrefix="/" logoHref="/" ctaHref="/platform/events" ctaLabel="Member events" />
                <div className="events-hero-copy">
                    <p className="eyebrow">Events</p>
                    <h1>What is on at HIVE.</h1>
                    <p>Discover, incubate, accelerate, scale.</p>
                    <div className="hero-cta">
                        <Link className="btn primary" href="#calendar">Open calendar</Link>
                        <Link className="btn secondary" href="/#programs">Programs</Link>
                    </div>
                </div>
            </header>
            <main id="calendar" className="section events-calendar-section">
                <EventCalendarClient audience="public" />
            </main>
            <footer className="footer">
                <p>© {new Date().getFullYear()} HIVE Whanganui.</p>
                <a href="#top">Back to top</a>
            </footer>
        </>
    );
}
