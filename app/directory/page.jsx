import Link from 'next/link';
import SiteNav from '../components/SiteNav';
import DirectoryClient from './DirectoryClient';
import { getTenantDirectory, getTenantDirectoryStats } from '@/lib/tenants';

export const metadata = {
    title: 'HIVE Directory | HIVE Whanganui',
    description: 'Explore the founders, studios, and teams building from HIVE HQ.'
};

export const dynamic = 'force-dynamic';

export default async function DirectoryPage() {
    let tenants = [];
    let error = '';

    try {
        tenants = await getTenantDirectory();
    } catch (err) {
        error = err?.message || 'Failed to load the HIVE directory.';
    }

    const stats = await getTenantDirectoryStats().catch(() => ({ totalTenants: tenants.length }));
    const totalTenants = Number.isFinite(stats?.totalTenants) ? stats.totalTenants : tenants.length;
    const contactCount = tenants.filter(tenant => tenant?.email || tenant?.phone).length;
    const visibleTenants = tenants;

    return (
        <>
            <div className="hex-overlay" aria-hidden="true" />
            <header className="hero directory-hero" id="top">
                <SiteNav hashPrefix="/" logoHref="/" ctaHref="/#contact" ctaLabel="Book a tour" />
                <div className="hero-content directory-hero-content">
                    <div className="hero-copy directory-hero-copy">
                        <p className="eyebrow">HIVE Directory</p>
                        <h1>Meet the builders shaping HIVE HQ.</h1>
                        <p>
                            This is the living index of teams inside the building. Search by name, filter by contact-ready teams, and
                            discover who you can collaborate with next.
                        </p>
                        <div className="hero-cta">
                            <a className="btn primary" href="#directory">
                                Explore directory
                            </a>
                            <Link className="btn secondary" href="/#availability">
                                Back to HIVE HQ
                            </Link>
                        </div>
                        <div className="hero-stats">
                            <div>
                                <span>{totalTenants}</span>
                                <p>Companies</p>
                            </div>
                            <div>
                                <span>{contactCount}</span>
                                <p>Contact ready</p>
                            </div>

                        </div>
                    </div>

                    {/* <div className="hero-media directory-hero-media">
                        <div className="hero-card directory-hero-card">
                            <h3>Inside HIVE right now</h3>
                            <ul>
                                {preview.length ? (
                                    preview.map(tenant => (
                                        <li key={tenant.id || tenant.name}>{tenant.name || 'Tenant'}</li>
                                    ))
                                ) : (
                                    <li>Directory loading soon.</li>
                                )}
                            </ul>
                        </div>
                        <div className="hero-card directory-hero-card">
                            <h3>Claim your listing</h3>
                            <Link className="btn ghost" href="/platform/settings">
                                Edit directory profile
                            </Link>
                        </div>
                    </div> */}
                </div>
            </header>

            <main>
                <section className="section directory-section" id="directory">
                    <div className="container">
                        <div className="directory-header">
                            <div>
                                <div className="section-tag">Directory</div>
                                <h2>Browse everyone.</h2>
                                <p>
                                    Each company controls their own profile. Reach out directly to start a partnership, learn more about their offering, or just say hello.
                                </p>
                            </div>
                            <div className="directory-count">
                                <span>{totalTenants}</span>
                                <p>HIVE Companies</p>
                            </div>
                        </div>

                        <DirectoryClient tenants={visibleTenants} error={error} totalCount={totalTenants} />
                    </div>
                </section>
            </main>
        </>
    );
}
