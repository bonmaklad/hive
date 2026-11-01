import Image from 'next/image';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function AgentIcon() {
    return (
        <svg
            className="benefit-icon"
            viewBox="0 0 24 24"
            width="36"
            height="36"
            role="img"
            aria-label="Agent"
        >
            <path
                d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
                fill="currentColor"
                opacity="0.16"
            />
            <path
                d="M8 9h8M8 13h5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}

function ParkingIcon() {
    return (
        <svg
            className="benefit-icon"
            viewBox="0 0 24 24"
            width="36"
            height="36"
            role="img"
            aria-label="Parking"
        >
            <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.16" />
            <path
                d="M10 6h3.4a3.3 3.3 0 0 1 0 6.6H10V18H8V6h2Zm0 4.6h3.2a1.3 1.3 0 0 0 0-2.6H10v2.6Z"
                fill="currentColor"
            />
        </svg>
    );
}

export default function PlatformBenefitsPage() {
    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Membership benefits</h1>
                    <p className="platform-subtitle">Active member perks and partner services.</p>
                </div>
                <Link className="btn ghost" href="/platform">
                    Back to dashboard
                </Link>
            </div>

            <section className="platform-grid benefits-grid">
                <article className="platform-card benefit-card">
                    <div className="benefit-icon-badge" aria-hidden="true">
                        <AgentIcon />
                    </div>
                    <div className="benefit-meta">
                        <h2 style={{ marginTop: 0 }}>HIVE Agent</h2>
                        <p className="benefit-price">One free agent for your website</p>
                        <p className="platform-subtitle">
                            Go to{' '}
                            <a className="platform-link" href="https://agent.hivehq.nz" target="_blank" rel="noreferrer">
                                agent.hivehq.nz
                            </a>{' '}
                            and sign in with your HIVE login to get your free website agent.
                        </p>
                        <ul className="platform-subtitle">
                            <li><strong>Automatic setup:</strong> Gets your agent ready to add to your website with one small script.</li>
                            <li><strong>Website scanning:</strong> Scans your site to learn about your business, products and services.</li>
                            <li><strong>Nightly learning:</strong> Learns from customer interactions each night to improve its answers.</li>
                        </ul>
                        <div className="platform-card-actions">
                            <a className="btn primary" href="https://agent.hivehq.nz" target="_blank" rel="noreferrer">
                                Get your free agent
                            </a>
                        </div>
                    </div>
                </article>

                <article className="platform-card benefit-card span-6">
                    <div className="benefit-icon-badge" aria-hidden="true">
                        <ParkingIcon />
                    </div>
                    <div className="benefit-meta">
                        <h2 style={{ marginTop: 0 }}>Weekly parking</h2>
                        <p className="benefit-price">$20 / week</p>
                        <p className="platform-subtitle">Location: behind Haywards Auction.</p>
                        <p className="platform-subtitle">Parking behind the museum with the council is $30 per week.</p>
                        <p className="platform-subtitle">
                            Email <a className="platform-link" href="mailto:info@hivehq.nz">info@hivehq.nz</a> for more info.
                        </p>
                    </div>
                </article>

                <article className="platform-card benefit-card span-6">
                    <div className="benefit-media" aria-hidden="true">
                        <Image
                            src="/benefits/wphoto-logo.png"
                            alt=""
                            fill
                            sizes="(max-width: 859px) 100vw, 40vw"
                            className="benefit-media-image"
                        />
                    </div>
                    <div className="benefit-meta">
                        <h2 style={{ marginTop: 0 }}>Printing needs</h2>
                        <p className="platform-subtitle">
                            Send files to <a className="platform-link" href="mailto:info@wphoto.nz">info@wphoto.nz</a>.
                        </p>
                        <p className="platform-subtitle">
                            Tel: <a className="platform-link" href="tel:+6463456144">06 345 6144</a>.
                        </p>
                        <p className="platform-subtitle">
                            Partner: <a className="platform-link" href="https://wphoto.nz/" target="_blank" rel="noreferrer">wphoto.nz</a>
                        </p>
                    </div>
                </article>
            </section>
        </main>
    );
}
