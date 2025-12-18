'use client';

import { useEffect, useMemo, useState } from 'react';

const PLANS = [
    { id: 'member', label: 'Member', monthly: 99 },
    { id: 'desk', label: 'Desk', monthly: 249 },
    { id: 'pod', label: 'Pod', monthly: 349 },
    { id: 'office', label: 'Office', monthly: 699 },
    { id: 'premium', label: 'Premium', monthly: 499 }
];

const OFFICES = [
    { id: 'office-a', label: 'Office A (2 desks)', monthly: 699 },
    { id: 'office-b', label: 'Office B (4 desks)', monthly: 1099 },
    { id: 'office-c', label: 'Office C (6 desks)', monthly: 1499 }
];

const FRIDGE_MONTHLY = 25;

function formatNZD(value) {
    try {
        return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(value);
    } catch {
        return `$${value}`;
    }
}

function toNumberOrZero(value) {
    const cleaned = String(value || '').replace(/[^0-9.]/g, '');
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
}

export default function MembershipClient() {
    const [status, setStatus] = useState('live'); // live | expired
    const [planId, setPlanId] = useState('premium');
    const [officeId, setOfficeId] = useState('office-a');
    const [donationText, setDonationText] = useState('');
    const [fridge, setFridge] = useState(false);
    // Custom pricing (fetched from backend; stubbed for now)
    const [customMonthly, setCustomMonthly] = useState(null);
    const [customLoading, setCustomLoading] = useState(false);
    const [customError, setCustomError] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    const plan = useMemo(() => PLANS.find(p => p.id === planId) || PLANS[0], [planId]);
    const office = useMemo(() => OFFICES.find(o => o.id === officeId) || OFFICES[0], [officeId]);
    const baseMonthly = (() => {
        if (planId === 'office') return office.monthly;
        if (planId === 'custom') return Number.isFinite(customMonthly) ? customMonthly : 0;
        return plan.monthly;
    })();
    const donationMonthly = toNumberOrZero(donationText);
    const fridgeMonthlyEstimate = fridge ? FRIDGE_MONTHLY : 0;
    const totalMonthly = baseMonthly + donationMonthly + fridgeMonthlyEstimate;

    const submit = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setInfo('');

        try {
            await new Promise(resolve => setTimeout(resolve, 500));
            setInfo('Request submitted for approval. We’ll email you once it’s confirmed.');
        } catch (err) {
            setError(err?.message || 'Could not submit changes.');
        } finally {
            setBusy(false);
        }
    };

    useEffect(() => {
        let cancelled = false;

        const fetchCustomPrice = async () => {
            try {
                setCustomLoading(true);
                setCustomError('');
                await new Promise(resolve => setTimeout(resolve, 400));
                if (cancelled) return;
                setCustomMonthly(379);
            } catch {
                if (cancelled) return;
                setCustomError('Could not load custom pricing.');
                setCustomMonthly(null);
            } finally {
                if (!cancelled) setCustomLoading(false);
            }
        };

        if (planId !== 'custom') return () => { cancelled = true; };
        if (customMonthly != null || customLoading || customError) return () => { cancelled = true; };

        fetchCustomPrice();
        return () => {
            cancelled = true;
        };
    }, [customError, customLoading, customMonthly, planId]);

    const cancelMembership = async () => {
        setBusy(true);
        setError('');
        setInfo('');

        try {
            const ok = window.confirm('Cancel your membership? This will stop future billing after approval.');
            if (!ok) return;
            await new Promise(resolve => setTimeout(resolve, 500));
            setStatus('expired');
            setInfo('Cancellation request submitted for approval.');
        } catch (err) {
            setError(err?.message || 'Could not cancel membership.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <section className="platform-card" aria-label="Membership summary">
                <div className="platform-kpi-row">
                    <div>
                        <h2 style={{ margin: 0 }}>Current membership</h2>
                        <p className="platform-subtitle">Status and billing summary.</p>
                    </div>
                    <span className={`badge ${status === 'live' ? 'success' : 'error'}`}>
                        {status === 'live' ? 'Live' : 'Expired'}
                    </span>
                </div>

                <p className="platform-kpi" style={{ marginBottom: 0 }}>
                    {formatNZD(totalMonthly)} <span className="platform-subtitle">/ month</span>
                </p>
                <p className="platform-subtitle">
                    Plan: {planId === 'office' ? `Office • ${office.label}` : planId === 'custom' ? 'Custom' : plan.label}
                </p>
                <p className="platform-subtitle">Next invoice: 05 Jan 2026</p>
            </section>

            <section className="platform-card" style={{ marginTop: '1.25rem' }} aria-label="Manage membership">
                <h2 style={{ marginTop: 0 }}>Manage membership</h2>
                <p className="platform-subtitle">Update your plan and extras. Changes require approval.</p>

                <form className="contact-form" onSubmit={submit}>
                    <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                        <legend className="platform-subtitle" style={{ marginBottom: '0.75rem' }}>
                            Membership type
                        </legend>

                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                            {PLANS.map(p => (
                                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <input
                                        type="radio"
                                        name="plan"
                                        value={p.id}
                                        checked={planId === p.id}
                                        onChange={() => setPlanId(p.id)}
                                        disabled={busy}
                                    />
                                    <span>
                                        {p.label}{' '}
                                        <span className="platform-subtitle">({formatNZD(p.monthly)} / month)</span>
                                    </span>
                                </label>
                            ))}
                            {/* Custom pricing option (dynamic, fetched from backend) */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <input
                                    type="radio"
                                    name="plan"
                                    value="custom"
                                    checked={planId === 'custom'}
                                    onChange={() => setPlanId('custom')}
                                    disabled={busy}
                                />
                                <span>
                                    Custom{' '}
                                    <span className="platform-subtitle">
                                        {customLoading && '(fetching…)'}
                                        {!customLoading && customError && '(unavailable)'}
                                        {!customLoading && !customError && customMonthly != null && `(${formatNZD(customMonthly)} / month)`}
                                        {!customLoading && !customError && customMonthly == null && '(select to load)'}
                                    </span>
                                </span>
                            </label>
                        </div>
                    </fieldset>

                    {planId === 'office' && (
                        <label style={{ marginTop: '1rem', display: 'block' }}>
                            Choose an available office
                            <select value={officeId} onChange={e => setOfficeId(e.target.value)} disabled={busy}>
                                {OFFICES.map(o => (
                                    <option key={o.id} value={o.id}>
                                        {o.label} — {formatNZD(o.monthly)} / month
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}

                    <div style={{ marginTop: '1rem' }}>
                        <h3 style={{ margin: 0 }}>Extras</h3>
                        <p className="platform-subtitle">Add-ons that adjust your monthly total.</p>
                    </div>

                    <label>
                        Donation (NZD / month)
                        <input
                            type="text"
                            name="donation"
                            placeholder="e.g. 50"
                            value={donationText}
                            onChange={e => setDonationText(e.target.value)}
                            disabled={busy}
                        />
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <input
                            type="checkbox"
                            checked={fridge}
                            onChange={e => setFridge(e.target.checked)}
                            disabled={busy}
                        />
                        <span>
                            Fridge access <span className="platform-subtitle">({formatNZD(FRIDGE_MONTHLY)} / month)</span>
                        </span>
                    </label>

                    <p className="platform-message info" style={{ marginTop: '1rem' }}>
                        Estimated total: <span className="platform-mono">{formatNZD(totalMonthly)} / month</span>
                    </p>

                    {error && <p className="platform-message error">{error}</p>}
                    {info && <p className="platform-message info">{info}</p>}

                    <div className="platform-actions" style={{ marginTop: '1rem' }}>
                        <button
                            className="btn primary"
                            type="submit"
                            disabled={
                                busy ||
                                status !== 'live' ||
                                (planId === 'custom' && (customLoading || !Number.isFinite(customMonthly)))
                            }
                        >
                            {busy ? 'Submitting…' : 'Request changes'}
                        </button>
                        <button className="btn secondary" type="button" onClick={cancelMembership} disabled={busy}>
                            {busy ? 'Working…' : 'Cancel membership'}
                        </button>
                    </div>
                </form>
            </section>

            <section className="platform-card" style={{ marginTop: '1.25rem' }} aria-label="Invoices">
                <h2 style={{ marginTop: 0 }}>Invoices</h2>
                <p className="platform-subtitle">Your billing history</p>

                <div className="platform-table-wrap" style={{ marginTop: '1rem' }}>
                    <table className="platform-table">
                        <thead>
                            <tr>
                                <th>Invoice</th>
                                <th>Date</th>
                                <th>Amount</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="platform-mono">INV-1024</td>
                                <td className="platform-mono">05 Dec 2025</td>
                                <td className="platform-mono">{formatNZD(499)}</td>
                                <td>
                                    <span className="badge success">Paid</span>
                                </td>
                            </tr>
                            <tr>
                                <td className="platform-mono">INV-1018</td>
                                <td className="platform-mono">05 Nov 2025</td>
                                <td className="platform-mono">{formatNZD(499)}</td>
                                <td>
                                    <span className="badge success">Paid</span>
                                </td>
                            </tr>
                            <tr>
                                <td className="platform-mono">INV-1012</td>
                                <td className="platform-mono">05 Oct 2025</td>
                                <td className="platform-mono">{formatNZD(499)}</td>
                                <td>
                                    <span className="badge success">Paid</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>
        </>
    );
}
