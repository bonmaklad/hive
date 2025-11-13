'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

const heroStats = [
    { label: 'Startups on deck', value: 1000 },
    { label: 'High-income jobs', value: 3000 },
    { label: 'GDP in pipeline (NZD)', value: 1000000000 }
];

const whoWeServe = [
    'Founders moving from prototype to revenue',
    'Remote teams needing a North Island base',
    'Youth talent leveling-up through coding camps',
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
    { title: 'Support & nurture', copy: 'Tri-annual incubators, 13-week accelerators, and venture studio squads keep founders shipping.' },
    { title: 'Community & collaboration', copy: 'Monthly salons, design camps, and startup weekends connect founders with domain experts.' }
];

const futureIndustries = ['Gaming', 'AI & Applied ML', 'Software Automation', 'Robotics', 'Big Data', 'Future Industries Lab'];

const objectives = [
    { title: 'Educate & train', copy: 'Programs and internships that graduate confident builders from high school to high growth.' },
    { title: 'Support & nurture', copy: 'Dedicated mentors, shared labs, prototype grants, and investor readiness sprints.' },
    { title: 'Community & collaboration', copy: 'Peer guilds and partner showcases to keep wins visible and lessons shared.' }
];

const metrics = [
    { label: 'Job growth', progress: 92 },
    { label: 'Household income', progress: 88 },
    { label: 'GDP', progress: 95 },
    { label: 'New tech companies', progress: 100 }
];

const programs = [
    { title: 'Hackathons & design camps', copy: 'Quarterly build sprints for all ages that end with investor table reads.' },
    { title: 'Tri-annual incubators', copy: 'Ideation weekends, six-week mentorship blocks, and pitch deck workshops.' },
    { title: 'Youth coding camps', copy: 'Seasonal curriculum from first line of code to product launch by 18.' },
    { title: '13-week accelerator', copy: 'Intensive roadmap, revenue architecture, and Demo Day with investors.' },
    { title: 'Startup Weekend', copy: '72 hours of ideation, prototyping, and launch to celebrate local culture.' },
    { title: 'Community showcases', copy: 'Monthly events, workshops, and salons with Whanganui & Partners.' }
];

const strategy = [
    { title: 'Program design', copy: 'Structured, scalable playbooks for every phase of the startup journey powered by volunteer experts.' },
    { title: 'Partnerships & funding', copy: 'Collaboration with local agencies, tech firms, and investors plus blended grants, sponsorships, and capital.' },
    { title: 'Evaluation & marketing', copy: 'Always-on measurement with pulse dashboards and campaigns that draw diverse founders into the pipeline.' }
];

const memberships = [
    {
        title: 'Private office',
        price: 125,
        perks: ['24/7 secure access', 'Sound-treated focus suites', 'Boardroom credits + locker', 'Access for up to 4 team members'],
        cta: 'Join the waitlist'
    },
    {
        title: 'Assigned desk',
        price: 50,
        perks: ['Dedicated sit-stand desk', 'Fiber + podcast-ready meeting pods', 'Event + workshop invites', '1 guest pass weekly'],
        cta: 'Reserve a desk'
    },
    {
        title: 'Hive membership',
        price: 25,
        perks: ['Drop-in lounge access', 'Monthly founder circles', 'Program scholarships + office hours', 'Priority into hackathons'],
        cta: 'Become a member'
    }
];

const gallery = [
    { label: 'Stone & sand', src: 'https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=600&q=80' },
    { label: 'Plant life', src: 'https://images.unsplash.com/photo-1470246973918-29a93221c455?auto=format&fit=crop&w=600&q=80' },
    { label: 'River energy', src: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80' },
    { label: 'Steel & timber', src: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=600&q=80' }
];

export default function HomePage() {
    const [navOpen, setNavOpen] = useState(false);
    const [toastVisible, setToastVisible] = useState(false);

    useEffect(() => {
        const counters = document.querySelectorAll('.stat-counter');
        const observer = new IntersectionObserver(
            entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    const target = Number(entry.target.dataset.target);
                    const duration = 2000;
                    const start = performance.now();

                    const step = now => {
                        const progress = Math.min((now - start) / duration, 1);
                        entry.target.textContent = Math.floor(progress * target).toLocaleString();
                        if (progress < 1) requestAnimationFrame(step);
                    };

                    requestAnimationFrame(step);
                    observer.unobserve(entry.target);
                });
            },
            { threshold: 0.4 }
        );

        counters.forEach(counter => observer.observe(counter));

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const bars = document.querySelectorAll('.metric-bar');
        const observer = new IntersectionObserver(
            entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    entry.target.style.width = `${entry.target.dataset.progress}%`;
                    observer.unobserve(entry.target);
                });
            },
            { threshold: 0.6 }
        );

        bars.forEach(bar => observer.observe(bar));

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!toastVisible) return undefined;
        const timeout = setTimeout(() => setToastVisible(false), 2600);
        return () => clearTimeout(timeout);
    }, [toastVisible]);

    const handleSubmit = event => {
        event.preventDefault();
        event.currentTarget.reset();
        setToastVisible(true);
    };

    return (
        <>
            <div className="hex-overlay" aria-hidden="true" />
            <header className="hero" id="top">
                <nav className="nav">
                    <div className="logo-wrap">
                        <Image src="/logo.png" alt="HIVE Whanganui logo" width={48} height={48} priority />
                        <span>HIVE Whanganui</span>
                    </div>
                    <button
                        className="menu-toggle"
                        aria-expanded={navOpen}
                        aria-controls="nav-links"
                        onClick={() => setNavOpen(open => !open)}
                    >
                        Menu
                    </button>
                    <ul id="nav-links" className={`nav-links ${navOpen ? 'open' : ''}`}>
                        <li><a href="#why">Why</a></li>
                        <li><a href="#who">Who</a></li>
                        <li><a href="#where">Where</a></li>
                        <li><a href="#problems">Challenges</a></li>
                        <li><a href="#solution">How</a></li>
                        <li><a href="#memberships">Memberships</a></li>
                    </ul>
                    <a className="btn ghost" href="#contact">
                        Book a tour
                    </a>
                </nav>

                <div className="hero-content">
                    <div className="hero-copy">
                        <p className="eyebrow">Technology Capital of Aotearoa</p>
                        <h1>Where collaboration meets momentum.</h1>
                        <p>
                            We are the tech-focused incubator powering 1,000 new Whanganui businesses, $1B in regional GDP, and 4,000 high-income jobs.
                            If you are building, scaling, or searching for a HQ where ideas turn into measurable outcomes, land at HIVE.
                        </p>
                        <div className="hero-cta">
                            <a className="btn primary" href="#memberships">
                                See memberships
                            </a>
                            <a className="btn secondary" href="#programs">
                                Explore programs
                            </a>
                        </div>
                        <div className="hero-stats">
                            {heroStats.map(stat => (
                                <div key={stat.label}>
                                    <span className="stat-counter" data-target={stat.value}>
                                        0
                                    </span>
                                    <p>{stat.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="hero-media">
                        <div className="hero-card">
                            <h3>Spaces built for velocity</h3>
                            <ul>
                                <li>7 private offices</li>
                                <li>6 assigned desks</li>
                                <li>Boardroom + lounge + training room</li>
                                <li>Membership cap of 10 founders</li>
                            </ul>
                        </div>
                        <div className="hero-graphic">
                            <Image
                                src="https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=800&q=80"
                                alt="Modern workspace"
                                width={640}
                                height={800}
                                priority
                            />
                            <div className="hex-tile">High trust</div>
                            <div className="hex-tile">High touch</div>
                        </div>
                    </div>
                </div>
            </header>

            <main>
                <section id="why" className="section manifesto">
                    <div className="section-tag">Why we exist</div>
                    <h2>Whanganui deserves a launchpad where ideas do not idle.</h2>
                    <p>
                        HIVE Whanganui aligns founders, mentors, investors, and civic partners to accelerate a bold goal: 1,000 tech companies that each generate
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
                            <p>Empower a diverse community to launch and scale tech ventures that lift household income and regional GDP.</p>
                        </article>
                        <article>
                            <h3>Values</h3>
                            <p>Momentum over noise, radical generosity, data-backed decisions, and design-forward experiences.</p>
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
                    <div className="image-stack">
                        <Image
                            src="https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=900&q=80"
                            alt="Team collaborating"
                            width={900}
                            height={1200}
                        />
                        <Image
                            src="https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=900&q=80"
                            alt="Workshop"
                            width={900}
                            height={1200}
                        />
                    </div>
                </section>

                <section id="where" className="section location">
                    <div className="section-tag">Where we are</div>
                    <h2>Anchored in downtown Whanganui with satellite reach.</h2>
                    <p>
                        Our campus combines a formal boardroom, lounge-style collaboration areas, seven private studios, six dedicated desks, and flexible membership desks.
                        Remote-first teams extend into our hybrid meeting suite and broadcast studio for investor updates or demo day streaming.
                    </p>
                    <div className="location-card">
                        <div>
                            <h3>Visit us</h3>
                            <p>65 Taupo Quay, Whanganui | Monday - Friday 7am - 9pm</p>
                            <p>Minutes from the riverfront, surrounded by cafes, galleries, and high-speed fiber.</p>
                        </div>
                        <Image
                            src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80"
                            alt="Whanganui river"
                            width={900}
                            height={600}
                        />
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

                <section className="section industries">
                    <div className="section-tag">Future industries</div>
                    <h2>Building across high-leverage technology stacks.</h2>
                    <div className="h-scroll" aria-label="Future industry focus carousel">
                        {futureIndustries.map(item => (
                            <article className="tile" key={item}>
                                {item}
                            </article>
                        ))}
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
                    <div className="section-tag">Outcomes</div>
                    <h2>Incubation & acceleration that compounds.</h2>
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
                                <span>100</span>
                                <p>Startups graduating yearly</p>
                            </li>
                            <li>
                                <span>3,000</span>
                                <p>New tech jobs by 2034</p>
                            </li>
                            <li>
                                <span>$1B</span>
                                <p>Local GDP unlocked</p>
                            </li>
                        </ul>
                    </div>
                    <div className="metrics-bars">
                        {metrics.map(item => (
                            <div className="metric" key={item.label}>
                                <div className="metric-label">{item.label}</div>
                                <div className="metric-track">
                                    <div className="metric-bar" data-progress={item.progress} />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section id="programs" className="section programs">
                    <div className="section-tag">Delivery events</div>
                    <h2>Year-round programming that keeps founders shipping.</h2>
                    <div className="programs-scroll" aria-label="Program timeline">
                        {programs.map(program => (
                            <article key={program.title}>
                                <h3>{program.title}</h3>
                                <p>{program.copy}</p>
                            </article>
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

                <section id="memberships" className="section memberships">
                    <div className="section-tag">Membership</div>
                    <h2>Pick the landing pad that matches your build cycle.</h2>
                    <div className="membership-grid">
                        {memberships.map(tier => (
                            <article key={tier.title}>
                                <h3>{tier.title}</h3>
                                <p className="price">
                                    ${tier.price}
                                    <span>/week</span>
                                </p>
                                <ul>
                                    {tier.perks.map(perk => (
                                        <li key={perk}>{perk}</li>
                                    ))}
                                </ul>
                                <a className="btn secondary" href="#contact">
                                    {tier.cta}
                                </a>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="section gallery">
                    <div className="section-tag">Texture & tone</div>
                    <h2>Materials inspired by Whanganui.</h2>
                    <div className="gallery-grid">
                        {gallery.map(tile => (
                            <figure className="hex" style={{ backgroundImage: `url(${tile.src})` }} key={tile.label}>
                                <figcaption>{tile.label}</figcaption>
                            </figure>
                        ))}
                    </div>
                </section>

                <section id="contact" className="section contact">
                    <div className="section-tag">Connect</div>
                    <h2>Ready to land at HIVE?</h2>
                    <p>Book a tour, host an event, or pitch a partnership. Let us know how you would like to engage.</p>
                    <form className="contact-form" onSubmit={handleSubmit}>
                        <label>
                            Name
                            <input type="text" name="name" required />
                        </label>
                        <label>
                            Email
                            <input type="email" name="email" required />
                        </label>
                        <label>
                            How can we help?
                            <textarea name="message" rows={4} required />
                        </label>
                        <button type="submit" className="btn primary">
                            Send
                        </button>
                    </form>
                    <div className="contact-meta">
                        <p>
                            <strong>General:</strong> kiaora@hivewhanganui.nz
                        </p>
                        <p>
                            <strong>Phone:</strong> +64 6 555 0101
                        </p>
                        <p>
                            <strong>Partners:</strong> partners@hivewhanganui.nz
                        </p>
                    </div>
                </section>
            </main>

            <footer className="footer">
                <p>© {new Date().getFullYear()} HIVE Whanganui. Built for founders who want to get things moving.</p>
                <a href="#top">Back to top ↑</a>
            </footer>

            {toastVisible && <div className="toast visible">Thanks! We will be in touch shortly.</div>}
        </>
    );
}
