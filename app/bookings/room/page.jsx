import { Suspense } from 'react';
import SiteNav from '../../components/SiteNav';
import RoomBookingClient from './room-booking-client';

export const metadata = {
    title: 'Book a room | HIVE Whanganui',
    description: 'Check availability and book a meeting room or the Hive Lounge.'
};

export default function RoomBookingsPage() {
    return (
        <>
            <div className="hex-overlay" aria-hidden="true" />
            <header className="hero" id="top" style={{ minHeight: '60vh' }}>
                <SiteNav hashPrefix="/" logoHref="/" ctaHref="/#contact" ctaLabel="Book a tour" />
                <div className="hero-content">
                    <div className="hero-copy">
                        <p className="eyebrow">Bookings</p>
                        <h1>Book a room</h1>
                        <p>See availability, choose a time, and confirm your booking instantly.</p>
                    </div>
                </div>
            </header>

            <main>
                <section className="section">
                    <div className="container">
                        <Suspense fallback={<p>Loading booking…</p>}>
                            <RoomBookingClient />
                        </Suspense>
                    </div>
                </section>
            </main>

            <footer className="footer">
                <p>© {new Date().getFullYear()} HIVE Whanganui. Built for founders who want to get things moving.</p>
                <a href="#top">Back to top ↑</a>
            </footer>
        </>
    );
}
