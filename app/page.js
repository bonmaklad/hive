import HomePageEffects from './components/HomePageEffects';
import DeferredIframe from './components/DeferredIframe';
import Image from 'next/image';
import Link from 'next/link';

import ContactForm from './components/ContactForm';
import HomeCommunitySignup from './components/HomeCommunitySignup';
import HomeImpactStats from './components/HomeImpactStats';
import HomeSpacesGallery from './components/HomeSpacesGallery';
import HomeMembershipGrid from './components/HomeMembershipGrid';
import EventWeekStrip from './components/EventWeekStrip';
import SiteNav from './components/SiteNav';
import HiveAvailabilitySection from './components/HiveAvailabilitySection';
import { events as programs } from '../lib/events';

const heroGoals = [
    { label: 'Startups', value: 1000, finalValue: '1,000' },
    { label: 'High-income jobs', value: 3000, finalValue: '3,000' },
    { label: 'Additional GDP', value: 1000000000, finalValue: '$1B', format: 'currency-compact' }
];

const whoWeServe = [
    'Founders moving from prototype to revenue',
    'Remote teams needing a base',
    'Youth talent leveling-up',
    'Corporate intrapreneurs validating new ventures'
];

const problems = [
    { title: 'Talent flight', copy: 'Too many creatives and engineers leave Whanganui for opportunity elsewhere.' },
    { title: 'Fragmented support', copy: 'Founders lack a single place for capital, mentorship, product labs, and community.' },
    { title: 'Capital access', copy: 'Regional ventures struggle to reach aligned investors before traction is proven.' },
    { title: 'Pathway clarity', copy: 'Future founders need structured programs from first idea through scale.' }
];

const solutionPillars = [
    { title: 'Educate & train', copy: 'Targeted youth-to-adult pipelines with coding camps, internships, and mentor office hours.' },
    { title: 'Support & nurture', copy: 'Milestone-based incubators, accelerators, and venture studio squads keep founders shipping.' },
    { title: 'Community & collaboration', copy: 'Monthly events, design camps, and startup weekends connect founders with domain experts.' }
];

const futureIndustries = ['Gaming', 'AI & Applied ML', 'Software Automation', 'Robotics', 'Big Data', 'Future Industries Lab'];
const futureIndustryTiles = [
    { label: 'Gaming', src: '/gaming.jpg' },
    { label: 'AI & Applied ML', src: '/ai.jpg' },
    { label: 'Software Automation', src: '/software.jpg' },
    { label: 'Robotics', src: '/robotics.jpg' },
    { label: 'Big Data', src: '/bigdata.jpg' },
    { label: 'Future Industries Lab', src: '/augment.jpg' }
];

const objectives = [
    { title: 'Educate & train', copy: 'Programs and internships that graduate confident builders from high school to high growth.' },
    { title: 'Support & nurture', copy: 'Dedicated mentors, shared labs, prototype grants, and investor readiness sprints.' },
    { title: 'Community & collaboration', copy: 'Peer guilds and partner showcases to keep wins visible and lessons shared.' }
];

// Images now live on each event in lib/events.js (event.image)

const strategy = [
    { title: 'Program design', copy: 'Structured, scalable playbooks for every phase of the startup journey powered by volunteer experts.' },
    { title: 'Partnerships & funding', copy: 'Collaboration with local agencies, tech firms, and investors plus blended grants, sponsorships, and capital.' },
    { title: 'Evaluation & marketing', copy: 'Always-on measurement with pulse dashboards and campaigns that draw diverse founders into the pipeline.' }
];

const programJourney = [
    {
        title: 'Discover',
        programs: 'Hackathons, design camps, Startup Weekend, and school-linked coding camps',
        result: 'Problem, team, prototype, and evidence'
    },
    {
        title: 'Incubate',
        programs: 'Incubators for approved scalable ideas',
        result: 'First $1 of real revenue'
    },
    {
        title: 'Accelerate',
        programs: 'Accelerators for approved companies already making money',
        result: 'A growth flywheel where each $1 spent returns more than $1'
    },
    {
        title: 'Scale',
        programs: 'End-of-year Dragons Den and May Whanganui Innovation Awards',
        result: 'Investment readiness, recognition, and growth capital'
    }
];

export default function HomePage() {
    return ( 
        <>
            <HomePageEffects />
            <div className="hex-overlay" aria-hidden="true" />
            <header className="hero" id="top">
                <picture className="hero-bg">
                    <source
                        type="image/avif"
                        srcSet="/hero/hive-hero-800.avif 800w, /hero/hive-hero-1600.avif 1600w"
                        sizes="100vw"
                    />
                    <source
                        type="image/webp"
                        srcSet="/hero/hive-hero-800.webp 800w, /hero/hive-hero-1600.webp 1600w"
                        sizes="100vw"
                    />
	                    <img
	                        src="/hero/hive-hero-1600.jpg"
	                        alt=""
	                        decoding="async"
	                        loading="eager"
	                        fetchPriority="high"
	                    />
	                </picture>
	                <SiteNav />

                <div className="hero-content">
                    <div className="hero-copy">
                        <p className="eyebrow">Technology Capital of Aotearoa</p>
                        <h1>Where collaboration meets momentum.</h1>
                        <p>
                            Our goal is clear: 1,000 Whanganui startups, 3,000 high-income jobs, and $1B in additional GDP.
                        </p>
                        <div className="hero-cta">
                            <a className="btn primary" href="#memberships">
                                See memberships
                            </a>
                            <a className="btn secondary" href="#programs">
                                Explore programs
                            </a>
                        </div>
                        <div className="hero-goals" aria-label="HIVE regional goals">
                            {heroGoals.map(stat => (
                                <div key={stat.label}>
                                    <span className="stat-counter" data-target={stat.value} data-final={stat.finalValue} data-format={stat.format || 'number'}>
                                        0
                                    </span>
                                    <p>{stat.label}</p>
                                    <small>Goal</small>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </header>

            <main>
                <HomeImpactStats />
                <HomeCommunitySignup />

                {/* Spaces section moved below hero with text left and image right */}
                <section id="spaces" className="section split">
                    <div>
                        <h2>Spaces built for velocity</h2>
                        <ul className="feature-list">
                            <li>9 Premium Offices</li>
                            <li>12 Private Offices</li>
                            <li>11 Dedicated Desks</li>
                            <li>Hot Desking Capabilities</li>
                            <li>Boardroom + Training Room + Meeting Rooms</li>
                            <li>Event & Function Rooms</li>
                            <li>Membership cap of 25 founders</li>
                        </ul>
                    </div>
                    <div className="media-right">
                        <HomeSpacesGallery />
                    </div>
                </section>
                <section id="why" className="section manifesto">
                    <div className="section-tag">Why we exist</div>
                    <h2>Whanganui deserves a launchpad where ideas do not idle.</h2>
                    <p>
                        HIVE Whanganui aligns founders, mentors, investors, and civic partners to accelerate a bold goal: 1,000 new companies that each generate
                        $1M+ in revenue. Our model keeps membership intentionally tight so every founder receives bespoke support, accountability, and direct access
                        to capital and customers.
                    </p>
                    <div className="grid grid-3">
                        <article>
                            <h3>Mission</h3>
                            <p>Fuel a resilient innovation economy with inclusive programs spanning youth to seasoned operators.</p>
                        </article>
                        <article>
                            <h3>Vision</h3>
                            <p>Empower a diverse community to launch and scale ventures that lift household income and regional GDP.</p>
                        </article>
                        <article>
                            <h3>Values</h3>
                            <p>Momentum over noise, radical curiosity, data-backed decisions, and design-driven experiences.</p>
                        </article>
                    </div>
                </section>

                <section id="who" className="section split">
                    <div>
                        <div className="section-tag">Who we serve</div>
                        <h2>Builders at every stage of the pipeline.</h2>
                        <ul className="pill-list">
                            {whoWeServe.map(item => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                        <p>
                            We operate with Whanganui & Partners, Whanganui Tech Network, iwi, and national investors to keep the pipeline inclusive and future-fit.
                        </p>
                    </div>
                    <div className="who-media">
                        <Image
                            src="/Hive 5.JPG"
                            alt="Builders collaborating at HIVE"
                            fill
                            sizes="(max-width: 960px) 0px, 50vw"
                            quality={60}
                            style={{ objectFit: 'cover' }}
                        />
                    </div>
                </section>

                <section id="where" className="section location">
                    <div className="section-tag">Where we are</div>
                    <h2>Anchored in downtown Whanganui.</h2>
                    <p>
                        Our HIVE combines a formal boardroom, lounge-style collaboration areas, seven private studios, six dedicated desks, and flexible membership desks.
                        
                    </p>
                    <div className="location-card">
                        <div>
                            <h3>Visit us</h3>
                            <p>120 Victoria Avenue, Level 2, Whanganui | Monday - Friday 9am - 5pm</p>
                            <p>Minutes from the riverfront, surrounded by cafes, galleries, and ammenities.</p>
                        </div>
                        <div className="map-embed">
                            <DeferredIframe
                                title="HIVE Whanganui on Google Maps"
                                src="https://www.google.com/maps?q=120%20Victoria%20Avenue%2C%20Whanganui%2C%20New%20Zealand&t=k&z=18&output=embed"
                                allowFullScreen
                            />
                        </div>
                    </div>
                </section>

                <section id="problems" className="section problems">
                    <div className="section-tag">What problems we look to solve</div>
                    <div className="grid grid-4">
                        {problems.map(problem => (
                            <article key={problem.title}>
                                <h3>{problem.title}</h3>
                                <p>{problem.copy}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section id="solution" className="section solution">
                    <div className="section-tag">How we solve them</div>
                    <h2>Layered programs + curated space + data-backed coaching.</h2>
                    <div className="solution-grid">
                        {solutionPillars.map(pillar => (
                            <article key={pillar.title}>
                                <h3>{pillar.title}</h3>
                                <p>{pillar.copy}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="section industries horizontal-scroll" id="industries">
                    <div className="section-tag">Future industries</div>
                    <h2>Building across high-leverage technology stacks.</h2>
                    <div className="pin" aria-label="Future industry focus carousel">
                        <div className="track">
                            {futureIndustryTiles.map(tile => (
                                <figure
                                    className="hex hex-industry"
                                    key={tile.label}
                                >
                                    <div className="hex-media" aria-hidden="true">
                                        <Image
                                            src={tile.src}
                                            alt=""
                                            fill
                                            sizes="(max-width: 900px) 75vw, 50vh"
                                            quality={55}
                                            style={{ objectFit: 'cover' }}
                                        />
                                    </div>
                                    <figcaption>{tile.label}</figcaption>
                                </figure>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="section objectives">
                    <div className="section-tag">Objectives</div>
                    <div className="grid grid-3">
                        {objectives.map(item => (
                            <article key={item.title}>
                                <h3>{item.title}</h3>
                                <p>{item.copy}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="section data">
                    <div className="section-tag">The goal</div>
                    <h2>1,000 startups, 3,000 high-income jobs, and $1B in additional GDP.</h2>
                    <div className="data-wrap">
                        <svg className="impact-chart" viewBox="0 0 320 160" role="img" aria-label="Projected impact chart">
                            <defs>
                                <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                                    <stop offset="0%" stopColor="#6fffb6" />
                                    <stop offset="100%" stopColor="#2a2a2a" />
                                </linearGradient>
                            </defs>
                            <polyline className="chart-grid" points="20,140 300,140" />
                            <polyline className="chart-grid" points="20,100 300,100" />
                            <polyline className="chart-grid" points="20,60 300,60" />
                            <polyline className="chart-grid" points="20,20 300,20" />
                            <path className="chart-path" d="M20 130 L80 110 L140 90 L200 60 L260 40 L300 25" />
                            <path className="chart-fill" d="M20 130 L80 110 L140 90 L200 60 L260 40 L300 25 L300 140 L20 140 Z" />
                        </svg>
                        <ul className="metrics">
                            <li>
                                <span>1,000</span>
                                <p>Startups goal</p>
                            </li>
                            <li>
                                <span>3,000</span>
                                <p>High-income jobs goal</p>
                            </li>
                            <li>
                                <span>$1B</span>
                                <p>Additional GDP goal</p>
                            </li>
                        </ul>
                    </div>
                </section>

                <section id="programs" className="section programs">
                    <div className="section-tag">Delivery events</div>
                    <h2>A clear journey from first idea to investment-ready company.</h2>
                    <EventWeekStrip />
                    <div className="program-journey" aria-label="HIVE founder journey">
                        {programJourney.map((step, index) => (
                            <div className="journey-step" key={step.title}>
                                <span>{String(index + 1).padStart(2, '0')}</span>
                                <h3>{step.title}</h3>
                                <p>{step.programs}</p>
                                <strong>{step.result}</strong>
                            </div>
                        ))}
                    </div>
                    <div className="programs-list">
                        {programs.map((program, i) => (
                            <Link
                                className={`program-item ${i % 2 === 0 ? 'left' : 'right'}`}
                                href={`/events/${program.slug}`}
                                key={program.slug}
                                aria-label={`${program.title} details`}
                            >
                                <figure
                                    className="hex hex-program"
                                >
                                    <div className="hex-media" aria-hidden="true">
                                        <Image
                                            src={program.image}
                                            alt=""
                                            fill
                                            sizes="(max-width: 900px) 92vw, (max-width: 1200px) 420px, 520px"
                                            quality={55}
                                            style={{ objectFit: 'cover' }}
                                        />
                                    </div>
                                    <figcaption>{program.title}</figcaption>
                                </figure>
                                <div className="program-copy">
                                    <span className="program-stage">{program.stage}</span>
                                    <h3>{program.title}</h3>
                                    <p>{program.copy}</p>
                                    <div className="program-meta">
                                        <span>{program.format}</span>
                                        <span>Price: {program.price}</span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>

                <section className="section strategy">
                    <div className="section-tag">Strategy for implementation</div>
                    <div className="grid grid-3">
                        {strategy.map(item => (
                            <article key={item.title}>
                                <h3>{item.title}</h3>
                                <p>{item.copy}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <HiveAvailabilitySection />

                <HomeMembershipGrid />

                {/* <section className="section gallery">
                    <div className="section-tag">Texture & tone</div>
                    <h2>Materials inspired by Whanganui.</h2>
                    <div className="gallery-grid">
                        {gallery.map(tile => (
                            <figure className="hex" style={{ backgroundImage: `url(${tile.src})` }} key={tile.label}>
                                <figcaption>{tile.label}</figcaption>
                            </figure>
                        ))}
                    </div>
                </section> */}

                <section id="contact" className="section contact">
                    <div className="section-tag">Connect</div>
                    <div className="contact-shell">
                        <div className="contact-primary">
                            <h2>Ready to land at HIVE?</h2>
                            <p>Book a tour, host an event, or pitch a partnership. Let us know how you would like to engage.</p>
                            <ContactForm />
                            <div className="contact-meta">
                                <p>
                                    <strong>General:</strong> info@hivehq.nz
                                </p>
                                <p>
                                    <strong>Phone:</strong> +64 4 390 0117
                                </p>
                                {/* <p>
                                    <strong>Partners:</strong> partners@hivewhanganui.nz
                                </p> */}
                            </div>
                        </div>
                        <HomeCommunitySignup sectioned={false} variant="compact" />
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
