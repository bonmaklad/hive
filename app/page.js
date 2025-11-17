'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

const heroStats = [
    { label: 'Startups', value: 1000 },
    { label: 'High-income jobs', value: 3000 },
    { label: 'Additional GDP', value: 1000000000 }
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
    { title: 'Support & nurture', copy: 'Tri-annual incubators, 13-week accelerators, and venture studio squads keep founders shipping.' },
    { title: 'Community & collaboration', copy: 'Monthly events, design camps, and startup weekends connect founders with domain experts.' }
];

const futureIndustries = ['Gaming', 'AI & Applied ML', 'Software Automation', 'Robotics', 'Big Data', 'Future Industries Lab'];
const futureIndustryTiles = [
    { label: 'Gaming', src: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80' },
    { label: 'AI & Applied ML', src: 'https://images.unsplash.com/photo-1555255707-5f3b3f5f8f93?auto=format&fit=crop&w=800&q=80' },
    { label: 'Software Automation', src: 'https://images.unsplash.com/photo-1518779578993-ec3579fee39f?auto=format&fit=crop&w=800&q=80' },
    { label: 'Robotics', src: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80' },
    { label: 'Big Data', src: 'https://images.unsplash.com/photo-1517433456452-f9633a875f6f?auto=format&fit=crop&w=800&q=80' },
    { label: 'Future Industries Lab', src: 'https://images.unsplash.com/photo-1581093588401-16f6a2982ab1?auto=format&fit=crop&w=800&q=80' }
];

const objectives = [
    { title: 'Educate & train', copy: 'Programs and internships that graduate confident builders from high school to high growth.' },
    { title: 'Support & nurture', copy: 'Dedicated mentors, shared labs, prototype grants, and investor readiness sprints.' },
    { title: 'Community & collaboration', copy: 'Peer guilds and partner showcases to keep wins visible and lessons shared.' }
];

const metrics = [
    { label: 'Job growth', progress: 92 },
    { label: 'Household income', progress: 88 },
    { label: 'GDP', progress: 95 },
    { label: 'New companies', progress: 100 }
];

const programs = [
    { title: 'Hackathons & design camps', copy: 'Quarterly build sprints for all ages that end with investor table reads.' },
    { title: 'Tri-annual incubators', copy: 'Ideation weekends, six-week mentorship blocks, and pitch deck workshops.' },
    { title: 'Youth coding camps', copy: 'Seasonal curriculum from first line of code to product launch by 18.' },
    { title: '13-week accelerator', copy: 'Intensive roadmap, revenue architecture, and Demo Day with investors.' },
    { title: 'Startup Weekend', copy: '72 hours of ideation, prototyping, and launch to celebrate local culture.' },
    { title: 'Community showcases', copy: 'Monthly events, workshops, and salons with Whanganui & Partners.' }
];

const programImages = [
    'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1515187029135-18ee286d815b?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1496307042754-b4aa456c4a2d?auto=format&fit=crop&w=1200&q=80'
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
        perks: ['24/7 secure access', 'Lockable Privacy', 'Priority Space Booking', 'Additional Members'],
        cta: 'Join the waitlist'
    },
    {
        title: 'Assigned desk',
        price: 50,
        perks: ['Dedicated desk', 'Allocated Secure Storeroom', 'Event + workshop invites', 'Guest pass access'],
        cta: 'Reserve a private desk'
    },
    {
        title: 'Hive membership',
        price: 25,
        perks: ['Drop-in lounge access', 'HIVE Event Access', 'Hot desk access', 'Coffee!'],
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

    // Pin-and-scroll horizontally for the industries section
    useEffect(() => {
        const section = document.querySelector('#industries.horizontal-scroll');
        if (!section) return undefined;
        const pin = section.querySelector('.pin');
        const track = section.querySelector('.track');
        if (!pin || !track) return undefined;

        const vh = () => window.innerHeight;
        const vw = () => window.innerWidth;

        const setup = () => {
            // Total horizontal distance needed
            const total = track.scrollWidth;
            // Small buffer so the last tile fully enters view
            const buffer = 32; // px
            const range = Math.max(total - vw() + buffer, 0);
            // Expand the section height so you can scroll enough
            section.style.height = `${range + vh()}px`;
        };

        const onScroll = () => {
            const rect = section.getBoundingClientRect();
            const start = rect.top; // distance from viewport top
            const max = section.offsetHeight - vh();
            const y = Math.min(Math.max(-start, 0), max);
            const total = track.scrollWidth;
            const buffer = 32; // match setup()
            const range = Math.max(total - vw() + buffer, 0);
            const progress = max > 0 ? y / max : 0;
            const x = -progress * range;
            track.style.transform = `translate3d(${x}px, 0, 0)`;
        };

        const onResize = () => {
            setup();
            onScroll();
        };

        setup();
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onResize);
        };
    }, []);

    // Reveal programs as they enter viewport (alternating left/right)
    useEffect(() => {
        const items = document.querySelectorAll('.program-item');
        if (!items.length) return undefined;
        const obs = new IntersectionObserver(
            entries => {
                entries.forEach(e => {
                    if (e.isIntersecting) {
                        e.target.classList.add('in-view');
                        obs.unobserve(e.target);
                    }
                });
            },
            { threshold: 0.3 }
        );
        items.forEach(el => obs.observe(el));
        return () => obs.disconnect();
    }, []);

    const handleSubmit = async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        formData.append('access_key', 'ef9d79f8-ed58-4a40-bb56-35269e76f05b');
        formData.append('subject', 'New contact from hivehq.nz');
        formData.append('from_name', 'HIVE Website');
        formData.append('botcheck', '');
        try {
            const res = await fetch('https://api.web3forms.com/submit', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'Failed to send');
            form.reset();
            setToastVisible(true);
        } catch (err) {
            console.error(err);
            alert('Sending failed. Please email info@hivehq.nz');
        }
    };

    return (
        <>
            <div className="hex-overlay" aria-hidden="true" />
            <header className="hero" id="top">
                <nav className="nav">
                    <div className="logo-wrap">
                        <Image className="site-logo" src="/logo.png" alt="HIVE Whanganui logo" width={72} height={72} priority />
                        {/* <span>HIVE Whanganui</span> */}
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
                        <li><a href="#where">Location</a></li>
                        <li><a href="#problems">Pains</a></li>
                        <li><a href="#solution">Events</a></li>
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
                            We are the tech-focused innovation hub with a goal to power 1,000 new Whanganui businesses, $1B in regional GDP, and 3,000 high-income jobs.
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
                </div>
            </header>

            <main>
                {/* Spaces section moved below hero with text left and image right */}
                <section id="spaces" className="section split">
                    <div>
                        <h3>Spaces built for velocity</h3>
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
                        <Image
                            src="https://plus.unsplash.com/premium_photo-1661951926748-413f9a5b0f55?auto=format&fit=crop&w=1200&q=80"
                            alt="Modern workspace at HIVE"
                            width={900}
                            height={600}
                            priority
                            style={{ width: '100%', height: 'auto' }}
                        />
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
                            src="https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1600&q=80"
                            alt="Builders collaborating at HIVE"
                            fill
                            priority
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
                            <p>120 Victoria Avenue, Whanganui | Monday - Friday 9am - 5pm</p>
                            <p>Minutes from the riverfront, surrounded by cafes, galleries, and ammenities.</p>
                        </div>
                        <div className="map-embed">
                            <iframe
                                title="HIVE Whanganui on Google Maps"
                                src="https://www.google.com/maps?q=120%20Victoria%20Avenue%2C%20Whanganui%2C%20New%20Zealand&t=k&z=18&output=embed"
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
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
                                    style={{ backgroundImage: `url(${tile.src})` }}
                                    key={tile.label}
                                >
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
                                <p>New jobs by 2036</p>
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
                    <div className="programs-list">
                        {programs.map((program, i) => (
                            <div className={`program-item ${i % 2 === 0 ? 'left' : 'right'}`} key={program.title}>
                                <figure
                                    className="hex hex-program"
                                    style={{ backgroundImage: `url(${programImages[i % programImages.length]})` }}
                                >
                                    <figcaption>{program.title}</figcaption>
                                </figure>
                                <div className="program-copy">
                                    <h3>{program.title}</h3>
                                    <p>{program.copy}</p>
                                </div>
                            </div>
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
                            <strong>General:</strong> info@hivehq.nz
                        </p>
                        <p>
                            <strong>Phone:</strong> +64 9 390 0117
                        </p>
                        {/* <p>
                            <strong>Partners:</strong> partners@hivewhanganui.nz
                        </p> */}
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
