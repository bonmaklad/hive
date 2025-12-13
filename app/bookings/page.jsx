import Link from 'next/link';

import SiteNav from '../components/SiteNav';
import { bookingInclusions, spaces } from '../../lib/spaces';

export const metadata = {
    title: 'Bookings | HIVE Whanganui',
    description: 'Book a room, boardroom, training space, or event lounge at HIVE Whanganui.'
};

export default function BookingsPage() {
    const getPricingLines = space => {
        if (space.pricing?.perEvent) return [`$${space.pricing.perEvent} per event`];
        const lines = [];
        if (space.pricing?.halfDay) lines.push(`$${space.pricing.halfDay} half day`);
        if (space.pricing?.fullDay) lines.push(`$${space.pricing.fullDay} full day`);
        return lines;
    };

    return (
        <>
            <div className="hex-overlay" aria-hidden="true" />
            <header
                className="hero"
                id="top"
                style={{
                    minHeight: '70vh',
                    backgroundImage:
                        `linear-gradient(120deg, rgba(11, 12, 16, 0.9), rgba(28, 38, 52, 0.85)), url('${spaces[0]?.images?.[0]}')`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                }}
            >
                <SiteNav hashPrefix="/" logoHref="/" ctaHref="/#contact" ctaLabel="Book a tour" />
                <div className="hero-content">
                    <div className="hero-copy">
                        <p className="eyebrow">Bookings</p>
                        <h1>Spaces that make good work feel easy.</h1>
                        <p>
                            From small boardroom conversations to 50-person evening events, HIVE is built for clarity, momentum, and a
                            great experience end-to-end.
                        </p>
                        <div className="hero-cta">
                            <a className="btn primary" href="#venues">
                                Explore venues
                            </a>
                            <a className="btn secondary" href="#included">
                                What is included
                            </a>
                        </div>
                    </div>
                </div>
            </header>

            <main>
                <section className="section" id="venues">
                    <div className="container">
                        <div className="section-tag">Venues</div>
                        <h2>Choose the room that fits the moment.</h2>
                        <div className="programs-list">
                            {spaces.map((space, i) => (
                                <Link
                                    className={`program-item ${i % 2 === 0 ? 'left' : 'right'}`}
                                    href={`/bookings/${space.slug}`}
                                    key={space.slug}
                                    aria-label={`${space.title} booking details`}
                                >
                                    <figure
                                        className="hex hex-program"
                                        style={{ backgroundImage: `url(${space.images[0]})` }}
                                    >
                                        <figcaption>{space.title}</figcaption>
                                    </figure>
                                    <div className="program-copy">
                                        <h3>{space.title}</h3>
                                        <p>{space.copy}</p>
                                        <p>
                                            <strong>Capacity:</strong> {space.capacity}
                                        </p>
                                        <div>
                                            <strong>Pricing:</strong>
                                            <div>
                                                {getPricingLines(space).map(line => (
                                                    <div key={line}>{line}</div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="section" id="included">
                    <div className="container">
                        <div className="section-tag">Included</div>
                        <h2>Everything you need to run a smooth session.</h2>
                        <div className="grid grid-3">
                            <article>
                                <h3>In every booking</h3>
                                <ul className="feature-list">
                                    {bookingInclusions.map(item => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            </article>
                            <article>
                                <h3>Catering options</h3>
                                <p>
                                    Outside catering and self-catering are welcome. If you want it handled, tell us what you are aiming
                                    for and we can arrange it.
                                </p>
                            </article>
                            <article>
                                <h3>Charity discounts</h3>
                                <p>Discounts are available for charities and not-for-profits—enquire when you request availability.</p>
                            </article>
                        </div>
                    </div>
                </section>

                <section className="section">
                    <div className="container">
                        <div className="section-tag">Next step</div>
                        <h2>Ready to book?</h2>
                        <p>
                            Pick a venue to see photos, layouts, pricing, and to request availability for a date and time.
                        </p>
                        <p>
                            <Link className="btn bookings" href="#venues">
                                View venues
                            </Link>
                        </p>
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
