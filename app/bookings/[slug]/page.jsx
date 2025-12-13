import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import ContactForm from '../../components/ContactForm';
import SiteNav from '../../components/SiteNav';
import { bookingInclusions, getSpaceBySlug } from '../../../lib/spaces';

export function generateMetadata({ params }) {
    const space = getSpaceBySlug(params.slug);
    if (!space) return {};

    return {
        title: `${space.title} bookings | HIVE Whanganui`,
        description: space.copy
    };
}

function getPricingLines(space) {
    if (space.pricing?.perEvent) return [`$${space.pricing.perEvent} per event`];
    const lines = [];
    if (space.pricing?.halfDay) lines.push(`$${space.pricing.halfDay} half day`);
    if (space.pricing?.fullDay) lines.push(`$${space.pricing.fullDay} full day`);
    return lines;
}

export default function BookingVenuePage({ params }) {
    const space = getSpaceBySlug(params.slug);
    if (!space) notFound();

    return (
        <>
            <div className="hex-overlay" aria-hidden="true" />
            <header
                className="hero"
                id="top"
                style={{
                    minHeight: '70vh',
                    backgroundImage: `linear-gradient(120deg, rgba(11, 12, 16, 0.9), rgba(28, 38, 52, 0.85)), url('${space.headerImage || space.images?.[0]}')`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                }}
            >
                <SiteNav hashPrefix="/" logoHref="/" ctaHref="#request" ctaLabel="Request availability" />
                <div className="hero-content">
                    <div className="hero-copy">
                        <p className="eyebrow">Venue</p>
                        <h1>{space.title}</h1>
                        <p>{space.copy}</p>
                        <div className="hero-cta">
                            <a className="btn primary" href="#photos">
                                View photos
                            </a>
                            <a className="btn secondary" href="#request">
                                Request availability
                            </a>
                        </div>
                    </div>
                </div>
            </header>

            <main>
                <section className="section">
                    <div className="container">
                        <div className="section-tag">At a glance</div>
                        <div className="grid grid-3">
                            <article className="card">
                                <h3>Capacity</h3>
                                <p>{space.capacity}</p>
                            </article>
                            <article className="card">
                                <h3>Pricing</h3>
                                <div>
                                    {getPricingLines(space).map(line => (
                                        <div key={line}>{line}</div>
                                    ))}
                                </div>
                            </article>
                            <article className="card">
                                <h3>Best for</h3>
                                <ul className="feature-list">
                                    {space.bestFor.map(item => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            </article>
                        </div>
                    </div>
                </section>

                <section className="section" id="layouts">
                    <div className="container">
                        <div className="section-tag">Layouts</div>
                        <h2>Set it up the way you work.</h2>
                        <div className="grid grid-3">
                            {space.layouts.map(layout => (
                                <article className="card" key={layout.label}>
                                    <h3>{layout.label}</h3>
                                    <p>{layout.capacity}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="section">
                    <div className="container">
                        <div className="section-tag">Included</div>
                        <h2>What comes with the space</h2>
                        <div className="grid grid-3">
                            <article className="card">
                                <h3>Every booking</h3>
                                <ul className="feature-list">
                                    {bookingInclusions.map(item => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            </article>
                            <article className="card">
                                <h3>Room highlights</h3>
                                <ul className="feature-list">
                                    {space.highlights.map(item => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            </article>
                            <article className="card">
                                <h3>Good to know</h3>
                                <p>
                                    Discounts are available for charities and not-for-profits. Let us know what you are organising and we
                                    will do our best to help.
                                </p>
                            </article>
                        </div>
                    </div>
                </section>

                <section className="section" id="photos">
                    <div className="container">
                        <div className="section-tag">Photos</div>
                        <h2>Get a feel for the room.</h2>
                        <div className="photo-grid" aria-label={`${space.title} photos`}>
                            {space.images.map((src, index) => (
                                <div className="photo-tile" key={src}>
                                    <Image
                                        src={src}
                                        alt={`${space.title} venue photo ${index + 1}`}
                                        fill
                                        sizes="(max-width: 900px) 100vw, 33vw"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section id="request" className="section contact">
                    <div className="container">
                        <div className="section-tag">Request availability</div>
                        <h2>Tell us your date and timeframe.</h2>
                        <div className="card" style={{ maxWidth: 720 }}>
                            <p>
                                Send the details and we will confirm availability, pricing, and any catering or setup requests.
                            </p>
                            <ContactForm
                                mode="booking"
                                eventName={space.title}
                                subject={`Venue booking request: ${space.title}`}
                                submitLabel="Request"
                                minHour={space.slug === 'hive-lounge' ? 17 : 8}
                                maxHour={22}
                            />
                            <div className="contact-meta">
                                <p>
                                    <strong>General:</strong> info@hivehq.nz
                                </p>
                                <p>
                                    <strong>Phone:</strong> +64 9 390 0117
                                </p>
                                <p>
                                    <Link href="/bookings">Back to bookings</Link>
                                </p>
                            </div>
                        </div>
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
