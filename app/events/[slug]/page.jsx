import Link from 'next/link';
import { notFound } from 'next/navigation';

import ContactForm from '../../components/ContactForm';
import SiteNav from '../../components/SiteNav';
import { getEventBySlug } from '../../../lib/events';

export function generateMetadata({ params }) {
    const event = getEventBySlug(params.slug);
    if (!event) return {};

    return {
        title: `${event.title} | HIVE Whanganui`,
        description: event.copy
    };
}

export default function EventPage({ params }) {
    const event = getEventBySlug(params.slug);
    if (!event) notFound();

    return (
        <>
            <div className="hex-overlay" aria-hidden="true" />
            <header
                className="hero"
                id="top"
                style={{ 
                    minHeight: '80vh',
                    backgroundImage:
                        `linear-gradient(120deg, rgba(11, 12, 16, 0.9), rgba(28, 38, 52, 0.85)), url('${event.image}')`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                }}
            > 
                <SiteNav hashPrefix="/" logoHref="/" ctaHref="#get-info" ctaLabel="Get more info" />
                <div className="hero-content">
                    <div className="hero-copy">
                        <p className="eyebrow">Delivery event</p>
                        <h1>{event.title}</h1>
                        <p>{event.copy}</p>
                        <div className="hero-cta">
                            <a className="btn primary" href="#syllabus">
                                Explore the syllabus
                            </a>
                            <a className="btn secondary" href="#get-info">
                                Get more info
                            </a>
                        </div>
                    </div>
                </div>
            </header>

            <main>
                {/* Intro copy to set context */}
                <section className="section">
                    <div className="container">
                        <div className="card">
                            <p>
                                Our delivery events are built around one simple idea: momentum through making. Each program blends expert guidance,
                                peer collaboration, and practical frameworks so you leave with tangible outcomes—not just notes.
                            </p>
                            <p>
                                Whether you are validating a problem, building an MVP, or getting investor-ready, this {event.title.toLowerCase()} focuses on
                                real customer learning, clear milestones, and a repeatable operating cadence you can keep using after the event.
                            </p>
                        </div>
                    </div>
                </section>

                <section className="section">
                    <div className="container">
                        <div className="section-tag">At a glance</div>
                        <div className="grid grid-3">
                            <article className="card">
                                <h3>Duration</h3>
                                <p>{event.duration}</p>
                            </article>
                            <article className="card">
                                <h3>Cadence</h3>
                                <p>{event.cadence}</p>
                            </article>
                            <article className="card">
                                <h3>Built for</h3>
                                <ul className="feature-list">
                                    {event.idealFor.map(item => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            </article>
                        </div>
                    </div>
                </section>

                <section className="section" id="syllabus">
                    <div className="container">
                        <div className="section-tag">Syllabus</div>
                        <h2>What you will ship</h2>
                        <div className="grid grid-3">
                            {event.syllabus.map(module => (
                                <article className="card" key={module.title}>
                                    <h3>{module.title}</h3>
                                    <ul className="feature-list">
                                        {module.bullets.map(bullet => (
                                            <li key={bullet}>{bullet}</li>
                                        ))}
                                    </ul>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="section">
                    <div className="container">
                        <div className="section-tag">Outcomes</div>
                        <div className="grid grid-4">
                            {event.outcomes.map(item => (
                                <article className="card" key={item}>
                                    <h3>{item}</h3>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section id="get-info" className="section contact">
                    <div className="container">
                        <div className="section-tag">Get more information</div>
                        <h2>Want dates, costs, and the full outline?</h2>
                        <div className="card" style={{ maxWidth: 720 }}>
                            <p>Send us a note and we will reply with the next intake and what to expect.</p>
                            <ContactForm eventName={event.title} subject={`Event enquiry: ${event.title}`} />
                            <div className="contact-meta">
                                <p>
                                    <strong>General:</strong> info@hivehq.nz
                                </p>
                                <p>
                                    <strong>Phone:</strong> +64 9 390 0117
                                </p>
                                <p>
                                    <Link href="/#programs">Back to events</Link>
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
