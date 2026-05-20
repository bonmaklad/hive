import Link from 'next/link';
import { notFound } from 'next/navigation';
import SiteNav from '../../components/SiteNav';
import InsightJumpNav from '../components/InsightJumpNav';
import { getMonthlySnapshot, monthlySnapshots } from '@/lib/insights/monthlySnapshots';

export function generateStaticParams() {
    return monthlySnapshots.map(snapshot => ({ slug: snapshot.slug }));
}

export async function generateMetadata({ params }) {
    const { slug } = await params;
    const snapshot = getMonthlySnapshot(slug);

    if (!snapshot) {
        return {
            title: 'Insight not found | HIVE Whanganui'
        };
    }

    return {
        title: `${snapshot.reportLabel} Business Trends Report | HIVE Whanganui`,
        description: snapshot.subtitle
    };
}

function changeClass(change) {
    if (typeof change === 'number') {
        if (change > 0) return 'is-positive';
        if (change < 0) return 'is-negative';
        return 'is-flat';
    }

    if (String(change).startsWith('+')) return 'is-positive';
    if (String(change).startsWith('-')) return 'is-negative';
    return 'is-flat';
}

function formatSignedNumber(value) {
    if (value > 0) return `+${value}`;
    return String(value);
}

function formatMoneyPerEmployee(gdpMillions, filledJobs) {
    const value = (gdpMillions * 1000000) / filledJobs;

    if (!Number.isFinite(value)) return null;

    return `$${Math.round(value / 1000).toLocaleString()}k`;
}

function MiniTrend({ trend }) {
    const values = trend.points.map(point => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const minimumBarSize = 14;

    const getBarSize = value => {
        if (!range) return 100;
        const localPosition = (value - min) / range;
        return minimumBarSize + localPosition * (100 - minimumBarSize);
    };

    return (
        <article className="insights-trend-card">
            <div className="insights-trend-head">
                <div>
                    <span>{trend.unit}</span>
                    <h3>{trend.title}</h3>
                    <p>{trend.subtitle}</p>
                </div>
            </div>
            <div className="insights-trend-bars">
                {trend.points.map(point => (
                    <div className="insights-trend-bar" key={`${trend.title}-${point.label}`}>
                        <span>{point.display}</span>
                        <div aria-hidden="true">
                            <i style={{ '--bar-size': `${getBarSize(point.value)}%` }} />
                        </div>
                        <em>{point.label}</em>
                    </div>
                ))}
            </div>
        </article>
    );
}

function MetricCard({ metric }) {
    return (
        <article className="insights-metric-card">
            <div className="insights-metric-topline">
                <span>{metric.label}</span>
                <em>{metric.theme || metric.cadence}</em>
            </div>
            <strong>{metric.value}</strong>
            <div className={`insights-change ${changeClass(metric.change)}`}>{metric.change}</div>
            <p>{metric.cadence}</p>
            <small>{metric.source || metric.note}</small>
        </article>
    );
}

function DataTable({ rows }) {
    return (
        <div className="insights-table-wrap">
            <table className="insights-data-table">
                <thead>
                    <tr>
                        <th>Metric</th>
                        <th>Whanganui</th>
                        <th>Region</th>
                        <th>New Zealand</th>
                        <th>Read</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => (
                        <tr key={row.metric}>
                            <th>{row.metric}</th>
                            <td>{row.whanganui}</td>
                            <td>{row.region}</td>
                            <td>{row.nz}</td>
                            <td>{row.note}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default async function InsightSnapshotPage({ params }) {
    const { slug } = await params;
    const snapshot = getMonthlySnapshot(slug);

    if (!snapshot) {
        notFound();
    }

    return (
        <>
            <div className="hex-overlay" aria-hidden="true" />
            <header className="insights-article-hero" id="top">
                <SiteNav hashPrefix="/" logoHref="/" ctaHref="/#contact" ctaLabel="Book a tour" />
                <div className="insights-article-head">
                    <div>
                        <p className="eyebrow">{snapshot.issueLabel}</p>
                        <h1>{snapshot.title}</h1>
                        <p>{snapshot.subtitle}</p>
                    </div>
                    <aside className="insights-date-card">
                        <span>{snapshot.reportLabel}</span>
                        <strong>Data available as of {snapshot.dataAsOf}</strong>
                        {snapshot.heroNote ? <p>{snapshot.heroNote}</p> : null}
                    </aside>
                </div>
            </header>

            <main className="insights-page insights-article">
                <InsightJumpNav items={snapshot.reportNav} />

                <section className="insights-section insights-takeaways" id="overview">
                    <div className="insights-section-heading">
                        <p className="section-tag">Overview</p>
                        <h2>{snapshot.keyTakeaways.length} fast reads</h2>
                    </div>
                    <ol className="insights-takeaway-list insights-takeaway-compact">
                        {snapshot.keyTakeaways.map(takeaway => (
                            <li key={takeaway}>{takeaway}</li>
                        ))}
                    </ol>
                </section>

                <section className="insights-section insights-section-soft">
                    <div className="insights-section-heading">
                        <p className="section-tag">At a glance</p>
                        <h2>The scoreboard</h2>
                    </div>
                    <div className="insights-metric-grid insights-metric-grid-wide">
                        {snapshot.headlineMetrics.map(metric => (
                            <MetricCard metric={metric} key={metric.label} />
                        ))}
                    </div>
                </section>

                <section className="insights-section" id="economy">
                    <div className="insights-section-heading">
                        <p className="section-tag">Economy</p>
                        <h2>GDP, population, spend, visitors</h2>
                    </div>
                    <div className="insights-chart-grid">
                        {snapshot.economyTrends.map(trend => (
                            <MiniTrend trend={trend} key={trend.title} />
                        ))}
                    </div>
                    <DataTable rows={snapshot.comparisonTable} />
                </section>

                <section className="insights-section insights-section-soft" id="people">
                    <div className="insights-section-heading">
                        <p className="section-tag">People</p>
                        <h2>Labour market and migration</h2>
                    </div>
                    <div className="insights-mini-metric-grid">
                        {snapshot.peopleMetrics.map(metric => (
                            <article className="insights-mini-metric" key={metric.label}>
                                <span>{metric.label}</span>
                                <strong>{metric.value}</strong>
                                <em className={changeClass(metric.change)}>{metric.change}</em>
                                <p>{metric.note}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="insights-section insights-split-section" id="business-base">
                    <div>
                        <div className="insights-section-heading">
                            <p className="section-tag">Business base</p>
                            <h2>Firm count by employee size</h2>
                            <p>Whanganui rose from 4,755 to 4,770 business units between February 2024 and February 2025.</p>
                        </div>
                        <div className="insights-band-list">
                            {snapshot.businessSizeBands.map(band => {
                                const maxValue = 3069;
                                const width = Math.max((band.current / maxValue) * 100, 8);

                                return (
                                    <article className="insights-band-row" key={band.label}>
                                        <div>
                                            <strong>{band.label}</strong>
                                            <span>{band.previous.toLocaleString()} to {band.current.toLocaleString()}</span>
                                        </div>
                                        <div className="insights-band-track" aria-hidden="true">
                                            <span style={{ '--bar-size': `${width}%` }} />
                                        </div>
                                        <em className={changeClass(band.change)}>{formatSignedNumber(band.change)}</em>
                                    </article>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <div className="insights-section-heading">
                            <p className="section-tag">Business read</p>
                            <h2>Microbusiness is the story</h2>
                        </div>
                        <div className="insights-mini-metric-grid one-column">
                            {snapshot.businessFacts.map(fact => (
                                <article className="insights-mini-metric" key={fact.label}>
                                    <span>{fact.label}</span>
                                    <strong>{fact.value}</strong>
                                    <p>{fact.detail}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="insights-section insights-section-soft" id="sectors">
                    <div className="insights-section-heading">
                        <p className="section-tag">Sectors</p>
                        <h2>GDP concentration</h2>
                        {snapshot.sectorNote ? <p>{snapshot.sectorNote}</p> : null}
                    </div>
                    <div className="insights-sector-board">
                        {snapshot.sectorMix.map(sector => {
                            const moneyPerEmployee = formatMoneyPerEmployee(sector.gdpMillions, sector.filledJobs);

                            return (
                                <article className="insights-sector-row" key={sector.label}>
                                    <div className="insights-sector-head">
                                        <strong>{sector.label}</strong>
                                        {moneyPerEmployee ? (
                                            <div className="insights-sector-output">
                                                <strong>{moneyPerEmployee}</strong>
                                                <span>per employee</span>
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className="insights-sector-stats">
                                        <span>{sector.value} / {sector.share}% GDP</span>
                                        {sector.filledJobs ? <span>{sector.filledJobs.toLocaleString()} filled jobs</span> : null}
                                    </div>
                                    <div className="insights-sector-track" aria-hidden="true">
                                        <span style={{ '--bar-size': `${sector.share * 6}%` }} />
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>

                <section className="insights-section" id="visitors">
                    <div className="insights-section-heading">
                        <p className="section-tag">Visitors and housing</p>
                        <h2>Demand, place, affordability</h2>
                    </div>
                    <div className="insights-mini-metric-grid">
                        {snapshot.visitorHousingMetrics.map(metric => (
                            <article className="insights-mini-metric" key={metric.label}>
                                <span>{metric.label}</span>
                                <strong>{metric.value}</strong>
                                <em className={changeClass(metric.change)}>{metric.change}</em>
                                <p>{metric.note}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="insights-section insights-section-soft" id="investment">
                    <div className="insights-section-heading">
                        <p className="section-tag">Investment</p>
                        <h2>Signals to watch</h2>
                    </div>
                    <div className="insights-mini-metric-grid">
                        {snapshot.investmentMetrics.map(metric => (
                            <article className="insights-mini-metric" key={metric.label}>
                                <span>{metric.label}</span>
                                <strong>{metric.value}</strong>
                                <em className={changeClass(metric.change)}>{metric.change}</em>
                                <p>{metric.note}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="insights-section">
                    <div className="insights-section-heading">
                        <p className="section-tag">Opportunity map</p>
                        <h2>Where HIVE can make the report actionable</h2>
                    </div>
                    <div className="insights-opportunity-grid">
                        {snapshot.opportunityCards.map(card => (
                            <article className="insights-opportunity-card" key={card.title}>
                                <span>{card.signal}</span>
                                <h3>{card.title}</h3>
                                <p>{card.copy}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="insights-section insights-section-soft">
                    <div className="insights-section-heading">
                        <p className="section-tag">Watchlist</p>
                        <h2>Events that changed the read</h2>
                    </div>
                    <div className="insights-watch-grid">
                        {snapshot.aprilWatchlist.map(item => (
                            <article className="insights-watch-card" key={item.title}>
                                <span>{item.tag}</span>
                                <h3>{item.title}</h3>
                                <p>{item.copy}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="insights-section" id="sources">
                    <div className="insights-section-heading">
                        <p className="section-tag">Source register</p>
                        <h2>Evidence trail</h2>
                    </div>
                    <div className="insights-source-list">
                        {snapshot.sourceRegister.map(source => (
                            <article className="insights-source-row" key={source.label}>
                                <div>
                                    <strong>{source.label}</strong>
                                    <span>{source.owner}</span>
                                    <p>{source.use}</p>
                                </div>
                                <a href={source.url} target="_blank" rel="noreferrer">
                                    Source
                                </a>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="insights-section insights-final-cta">
                    <div>
                        <p className="section-tag">Back to HIVE</p>
                        <h2>Use this as the annual baseline.</h2>
                        <p>
                            Future issues can update the same report modules when annual, quarterly, and monthly datasets refresh.
                        </p>
                    </div>
                    <Link className="btn primary" href="/insights">
                        View all insights
                    </Link>
                </section>
            </main>

            <footer className="footer">
                <p>&copy; {new Date().getFullYear()} HIVE Whanganui. Built for founders who want to get things moving.</p>
                <a href="#top">Back to top</a>
            </footer>
        </>
    );
}
