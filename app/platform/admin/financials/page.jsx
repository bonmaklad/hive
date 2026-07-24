'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { usePlatformSession } from '../../PlatformContext';

function getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatNZD(cents) {
    const value = Number(cents || 0) / 100;
    try {
        return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(value);
    } catch {
        return `$${value.toFixed(0)}`;
    }
}

function normalizeRows(rows) {
    return Array.isArray(rows) ? rows : [];
}

function findRow(rows, id) {
    return normalizeRows(rows).find(row => row?.id === id) || null;
}

function readMoney(node) {
    return {
        gross_cents: Number(node?.gross_cents || 0),
        net_cents: Number(node?.net_cents || 0),
        gst_cents: Number(node?.gst_cents || 0),
        count: Number(node?.count || 0)
    };
}

function formatMonthLabel(monthKey) {
    const [year, month] = String(monthKey || '').split('-').map(Number);
    if (!year || !month) return 'Selected month';

    try {
        return new Intl.DateTimeFormat('en-NZ', {
            month: 'long',
            year: 'numeric'
        }).format(new Date(year, month - 1, 1));
    } catch {
        return monthKey;
    }
}

async function readJsonResponse(response) {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return { _raw: text };
    }
}

function IncomeOverviewCard({ money }) {
    const value = readMoney(money);

    return (
        <section className="platform-card financial-income-card">
            <div className="financial-card-heading">
                <p className="financial-label">Monthly recurring income</p>
                <span className="financial-status-badge">Current billing</span>
            </div>
            <div>
                <p className="financial-income-value">{formatNZD(value.gross_cents)}</p>
                <p className="financial-income-caption">Gross income being billed now</p>
            </div>
            <div className="financial-income-split">
                <span>
                    <em>Net of GST</em>
                    <strong>{formatNZD(value.net_cents)}</strong>
                </span>
                <span>
                    <em>GST included</em>
                    <strong>{formatNZD(value.gst_cents)}</strong>
                </span>
            </div>
        </section>
    );
}

function MetricCard({ title, value, detailLabel, detailValue, tone = 'neutral' }) {
    return (
        <section className={`platform-card financial-metric-card tone-${tone}`}>
            <p className="financial-label">{title}</p>
            <p className="financial-metric-value">{value}</p>
            <div className="financial-metric-detail">
                <span>{detailLabel}</span>
                <strong>{detailValue}</strong>
            </div>
        </section>
    );
}

function OccupancyCard({ occupiedUnits, activeUnits, occupiedSlots, slotCapacity }) {
    const safeCapacity = Math.max(0, Number(slotCapacity || 0));
    const occupied = Math.max(0, Number(occupiedSlots || 0));
    const percentage = safeCapacity > 0 ? Math.min(100, (occupied / safeCapacity) * 100) : 0;

    return (
        <section className="platform-card financial-metric-card financial-occupancy-card tone-risk">
            <div>
                <p className="financial-label">Office units occupied</p>
                <p className="financial-metric-value">
                    {Number(occupiedUnits || 0)}
                    <span> / {Number(activeUnits || 0)}</span>
                </p>
            </div>
            <div className="financial-occupancy-detail">
                <div className="financial-occupancy-copy">
                    <span>Office slots used</span>
                    <strong>{occupied} / {safeCapacity}</strong>
                </div>
                <div
                    className="financial-progress"
                    role="progressbar"
                    aria-label="Office slots occupied"
                    aria-valuemin={0}
                    aria-valuemax={safeCapacity}
                    aria-valuenow={occupied}
                >
                    <span style={{ width: `${percentage}%` }} />
                </div>
            </div>
        </section>
    );
}

function SplitCard({ title, money, detail }) {
    const value = readMoney(money);
    return (
        <section className="platform-card financial-breakdown-card">
            <div>
                <p className="financial-label">{title}</p>
                {detail ? <p className="financial-card-description">{detail}</p> : null}
            </div>
            <p className="financial-metric-value">{formatNZD(value.gross_cents)}</p>
            <div className="financial-mini-grid">
                <span>
                    <strong>{formatNZD(value.net_cents)}</strong>
                    <em>net of GST</em>
                </span>
                <span>
                    <strong>{formatNZD(value.gst_cents)}</strong>
                    <em>GST</em>
                </span>
            </div>
        </section>
    );
}

function trendPoint(rows, index, field, maxValue) {
    const width = 920;
    const height = 260;
    const left = 76;
    const right = 22;
    const top = 20;
    const bottom = 42;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const x = left + (rows.length <= 1 ? 0 : (index / (rows.length - 1)) * plotWidth);
    const value = Number(rows[index]?.[field] || 0);
    const y = top + plotHeight - (maxValue > 0 ? (value / maxValue) * plotHeight : 0);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
}

function LineChart({ rows }) {
    const series = [
        { field: 'total_gross_cents', label: 'Total', className: 'total' },
        { field: 'members_gross_cents', label: 'Members', className: 'members' },
        { field: 'office_gross_cents', label: 'Office', className: 'office' }
    ];
    const data = normalizeRows(rows);
    const maxValue = Math.max(0, ...data.flatMap(row => series.map(s => Number(row?.[s.field] || 0))));
    const yLabel = maxValue > 0 ? formatNZD(maxValue) : '$0';

    return (
        <section className="platform-card financial-chart-card financial-line-card">
            <div className="financial-card-heading financial-chart-heading">
                <div>
                    <p className="financial-label">Income trend</p>
                    <h2>Monthly recurring income</h2>
                    <p className="financial-card-description">Gross billing split between members and offices.</p>
                </div>
                <div className="financial-legend">
                    {series.map(item => (
                        <span key={item.field}>
                            <i className={item.className} /> {item.label}
                        </span>
                    ))}
                </div>
            </div>
            <svg className="financial-line-chart" viewBox="0 0 920 260" role="img" aria-label="Monthly income line chart">
                <line x1="76" y1="20" x2="76" y2="218" />
                <line x1="76" y1="218" x2="898" y2="218" />
                <text x="12" y="27">{yLabel}</text>
                <text x="32" y="224">$0</text>
                {series.map(item => {
                    const points = data.map((_, index) => trendPoint(data, index, item.field, maxValue)).join(' ');
                    return <polyline key={item.field} className={item.className} points={points} />;
                })}
                {data.map((row, index) => {
                    const point = trendPoint(data, index, 'total_gross_cents', maxValue).split(',');
                    return (
                        <g key={row.month}>
                            <circle cx={point[0]} cy={point[1]} r="4" />
                            {(index === 0 || index === data.length - 1 || index % 3 === 0) ? (
                                <text className="x-label" x={point[0]} y="242">
                                    {row.label}
                                </text>
                            ) : null}
                        </g>
                    );
                })}
            </svg>
        </section>
    );
}

function BarList({ title, rows, totalGross }) {
    const total = Math.max(0, Number(totalGross || 0));
    return (
        <section className="platform-card financial-chart-card">
            <div className="financial-card-heading">
                <h2>{title}</h2>
            </div>
            <div className="financial-bar-list">
                {normalizeRows(rows).length ? normalizeRows(rows).map(row => {
                    const gross = Number(row?.gross_cents || 0);
                    const pct = total > 0 ? (gross / total) * 100 : 0;
                    return (
                        <div className="financial-bar-row" key={row?.id || row?.label}>
                            <div className="financial-bar-meta">
                                <span>{row?.label || row?.id}</span>
                                <strong>{formatNZD(gross)}</strong>
                            </div>
                            <div className="financial-bar-track">
                                <span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                            </div>
                        </div>
                    );
                }) : (
                    <p className="platform-subtitle">No income in this group for the selected month.</p>
                )}
            </div>
        </section>
    );
}

function RecurringTable({ rows }) {
    const visibleRows = normalizeRows(rows).slice(0, 40);

    return (
        <section className="platform-card financial-table-card">
            <div className="financial-table-heading">
                <div>
                    <p className="financial-label">Billing ledger</p>
                    <h2>Income being billed now</h2>
                    <p className="financial-card-description">Active recurring charges, before payment status.</p>
                </div>
                <span className="financial-row-count">
                    {visibleRows.length} {visibleRows.length === 1 ? 'account' : 'accounts'}
                </span>
            </div>
            <div className="platform-table-wrap financial-table-wrap">
                <table className="platform-table financial-table">
                    <thead>
                        <tr>
                            <th scope="col">Tenant / member</th>
                            <th scope="col">Type</th>
                            <th scope="col">Plan</th>
                            <th scope="col">Work units</th>
                            <th scope="col">Gross</th>
                            <th scope="col">Net</th>
                            <th scope="col">GST</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visibleRows.length ? (
                            visibleRows.map(row => (
                                <tr key={row.id}>
                                    <td>{row.tenant_name || '—'}</td>
                                    <td className="platform-mono">{row.type || '—'}</td>
                                    <td className="platform-mono">{row.plan || '—'}</td>
                                    <td className="platform-mono">{Array.isArray(row.work_units) && row.work_units.length ? row.work_units.join(', ') : '—'}</td>
                                    <td className="platform-mono">{formatNZD(row.gross_cents)}</td>
                                    <td className="platform-mono">{formatNZD(row.net_cents)}</td>
                                    <td className="platform-mono">{formatNZD(row.gst_cents)}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={7} className="platform-subtitle">
                                    No active paid memberships found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export default function AdminFinancialsPage() {
    const { supabase } = usePlatformSession();
    const [month, setMonth] = useState(() => getCurrentMonthKey());
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const authHeader = useCallback(async () => {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) throw new Error('No session token. Please sign in again.');
        return { Authorization: `Bearer ${token}` };
    }, [supabase]);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const query = new URLSearchParams({
                month,
                refreshed_at: String(Date.now())
            });
            const res = await fetch(`/api/admin/financials?${query.toString()}`, {
                headers: await authHeader(),
                cache: 'no-store'
            });
            const json = await readJsonResponse(res);
            if (!res.ok) throw new Error(json?.error || 'Failed to load income.');
            setData(json);
        } catch (err) {
            setData(null);
            setError(err?.message || 'Failed to load income.');
        } finally {
            setLoading(false);
        }
    }, [authHeader, month]);

    useEffect(() => {
        load();
    }, [load]);

    const currentBilling = data?.summary?.current_billing || null;
    const total = currentBilling?.total || null;
    const members = findRow(currentBilling?.split, 'members');
    const office = findRow(currentBilling?.split, 'office');
    const office116 = findRow(currentBilling?.groups, 'office_116');
    const office122 = findRow(currentBilling?.groups, 'office_122');
    const officeUnallocated = findRow(currentBilling?.groups, 'office_unallocated');
    const counts = data?.summary?.counts || {};
    const selectedMonthLabel = formatMonthLabel(month);

    return (
        <main className="platform-main financials-page">
            <header className="financials-header">
                <Link className="financial-breadcrumb" href="/platform/admin">
                    Admin overview
                </Link>
                <div className="financials-title-row">
                    <div className="financials-title">
                        <p className="financial-label">Financials</p>
                        <h1>Income</h1>
                        <p className="platform-subtitle">
                            Membership and office income, with a clear view of 116, 122, and current occupancy.
                        </p>
                    </div>
                    <div className="financial-toolbar">
                        <label className="financial-month-field">
                            <span>Reporting month</span>
                            <input
                                className="financial-month-input"
                                type="month"
                                value={month}
                                onChange={event => setMonth(event.target.value || getCurrentMonthKey())}
                            />
                        </label>
                        <button className="btn primary" type="button" onClick={load} disabled={loading}>
                            {loading ? 'Refreshing…' : 'Refresh'}
                        </button>
                    </div>
                </div>
            </header>

            {error && <p className="platform-message error financial-page-message">{error}</p>}
            {loading ? (
                <section className="platform-card financial-loading-card" aria-live="polite">
                    <p className="financial-label">Income</p>
                    <h2>Loading {selectedMonthLabel.toLowerCase()}…</h2>
                    <p className="platform-subtitle">Gathering current billing, occupancy, and income splits.</p>
                </section>
            ) : data ? (
                <>
                    <section className="financial-section" aria-labelledby="financial-overview-heading">
                        <div className="financial-section-heading">
                            <div>
                                <p className="financial-label">Overview</p>
                                <h2 id="financial-overview-heading">{selectedMonthLabel}</h2>
                            </div>
                            {/* <p>What is being billed now, and how much office capacity is in use.</p> */}
                        </div>
                        <div className="financial-overview-grid">
                            <IncomeOverviewCard money={total} />
                            <div className="financial-supporting-metrics">
                                <MetricCard
                                    title="Paying members"
                                    value={String(counts.paying_members || 0)}
                                    detailLabel="Membership income"
                                    detailValue={formatNZD(members?.gross_cents || 0)}
                                    tone="members"
                                />
                                <MetricCard
                                    title="Office tenants"
                                    value={String(counts.office_tenants || 0)}
                                    detailLabel="Office income"
                                    detailValue={formatNZD(office?.gross_cents || 0)}
                                    tone="gst"
                                />
                                <OccupancyCard
                                    occupiedUnits={counts.occupied_office_units}
                                    activeUnits={counts.active_office_units}
                                    occupiedSlots={counts.occupied_office_slots}
                                    slotCapacity={counts.office_unit_capacity}
                                />
                            </div>
                        </div>
                    </section>

                    <section className="financial-section" aria-labelledby="financial-trend-heading">
                        <div className="sr-only">
                            <h2 id="financial-trend-heading">Income trend</h2>
                        </div>
                        <LineChart rows={data?.summary?.trend || []} />
                    </section>

                    <section className="financial-section" aria-labelledby="financial-source-heading">
                        <div className="financial-section-heading">
                            <div>
                                <p className="financial-label">Income sources</p>
                                <h2 id="financial-source-heading">Where current billing comes from</h2>
                            </div>
                            <p>Gross, net, and GST totals for members and each office building.</p>
                        </div>
                        <div className="financial-breakdown-grid">
                            <SplitCard title="Members" money={members} detail={`${counts.paying_members || 0} paying member accounts`} />
                            <SplitCard title="Office 116" money={office116} detail="Income allocated to 116 offices" />
                            <SplitCard title="Office 122" money={office122} detail="Income allocated to 122 offices" />
                            <SplitCard title="Office not mapped" money={officeUnallocated} detail="Income without a floor allocation" />
                        </div>
                    </section>

                    <section className="financial-section" aria-labelledby="financial-mix-heading">
                        <div className="financial-section-heading">
                            <div>
                                <p className="financial-label">Income mix</p>
                                <h2 id="financial-mix-heading">Compare the current split</h2>
                            </div>
                            <p>Relative contribution of members, offices, and each building.</p>
                        </div>
                        <div className="financial-comparison-grid">
                            <BarList title="Members vs office" rows={currentBilling?.split || []} totalGross={total?.gross_cents || 0} />
                            <BarList title="Office income by building" rows={currentBilling?.floors || []} totalGross={office?.gross_cents || 0} />
                        </div>
                    </section>

                    <section className="financial-section" aria-labelledby="financial-ledger-heading">
                        <div className="sr-only">
                            <h2 id="financial-ledger-heading">Recurring billing ledger</h2>
                        </div>
                        <RecurringTable rows={data?.ledgers?.recurring || []} />
                    </section>

                    {(data?.warnings?.length || data?.notes?.length) ? (
                        <section className="platform-card financial-notes-card">
                            <p className="financial-label">Data notes</p>
                            <h2>What to know about these figures</h2>
                            <div className="financial-note-list">
                                {normalizeRows(data.notes).map(note => (
                                    <p key={note} className="platform-subtitle">
                                        {note}
                                    </p>
                                ))}
                                {normalizeRows(data.warnings).map(warning => (
                                    <p key={warning} className="platform-message error">
                                        {warning}
                                    </p>
                                ))}
                            </div>
                        </section>
                    ) : null}
                </>
            ) : null}
        </main>
    );
}
