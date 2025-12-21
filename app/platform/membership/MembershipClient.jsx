'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePlatformSession } from '../PlatformContext';

const PLANS = [
    { id: 'member', label: 'Member', monthlyCents: 9900 },
    { id: 'desk', label: 'Desk', monthlyCents: 24900 },
    { id: 'pod', label: 'Pod', monthlyCents: 34900 },
    { id: 'office', label: 'Office', monthlyCents: 69900 },
    { id: 'premium', label: 'Premium', monthlyCents: 49900 }
];

const OFFICES = [
    { id: 'office-a', label: 'Office A (2 desks)', monthlyCents: 69900 },
    { id: 'office-b', label: 'Office B (4 desks)', monthlyCents: 109900 },
    { id: 'office-c', label: 'Office C (6 desks)', monthlyCents: 149900 }
];

const FRIDGE_WEEKLY_CENTS = 2500;
const WEEKS_PER_MONTH = 4.333;

function formatNZD(cents) {
    const value = Number(cents || 0) / 100;
    try {
        return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(value);
    } catch {
        return `$${value}`;
    }
}

function toCentsOrZero(value) {
    const cleaned = String(value || '').replace(/[^0-9.]/g, '');
    const parsed = Number.parseFloat(cleaned);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.round(parsed * 100));
}

function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString();
}

function formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let idx = 0;
    let v = n;
    while (v >= 1024 && idx < units.length - 1) {
        v /= 1024;
        idx += 1;
    }
    return `${v.toFixed(v < 10 ? 1 : 0)} ${units[idx]}`;
}

export default function MembershipClient() {
    const { user, profile, tenantRole, supabase } = usePlatformSession();
    const canView = Boolean(profile?.is_admin) || tenantRole === 'owner';

    const [membership, setMembership] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);

    const [status, setStatus] = useState('live');
    const [planId, setPlanId] = useState('premium');
    const [officeId, setOfficeId] = useState('office-a');
    const [donationText, setDonationText] = useState('');
    const [fridge, setFridge] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    const [units, setUnits] = useState([]);
    const [unitsLoading, setUnitsLoading] = useState(false);
    const [unitsError, setUnitsError] = useState('');
    const [selectedUnitCode, setSelectedUnitCode] = useState('');

    const [docs, setDocs] = useState([]);
    const [docsLoading, setDocsLoading] = useState(false);
    const [docsError, setDocsError] = useState('');

    const plan = useMemo(() => PLANS.find(p => p.id === planId) || PLANS[0], [planId]);
    const office = useMemo(() => OFFICES.find(o => o.id === officeId) || OFFICES[0], [officeId]);

    // When the plan is "custom", base is supplied by backend via membership.monthly_amount_cents
    const baseMonthlyCents = planId === 'office'
        ? office.monthlyCents
        : planId === 'custom'
            ? (membership?.monthly_amount_cents ?? 0)
            : plan.monthlyCents;
    const donationCents = toCentsOrZero(donationText);
    const fridgeMonthlyCents = fridge ? Math.round(FRIDGE_WEEKLY_CENTS * WEEKS_PER_MONTH) : 0;
    const computedMonthlyCents = baseMonthlyCents + donationCents + fridgeMonthlyCents;
    // Always show the backend's current membership price when present, even if it's 0.
    // Fall back to computed estimate only when monthly_amount_cents is undefined/null.
    const hasMembershipAmount =
        membership && typeof membership.monthly_amount_cents === 'number' && Number.isFinite(membership.monthly_amount_cents);
    const displayMonthlyCents = hasMembershipAmount ? membership.monthly_amount_cents : computedMonthlyCents;

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            if (!canView) {
                setMembership(null);
                setInvoices([]);
                setLoading(false);
                return;
            }

            setLoading(true);
            setError('');

            const { data: membershipRow, error: membershipError } = await supabase
                .from('memberships')
                .select('*')
                .eq('owner_id', user.id)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (cancelled) return;

            if (membershipError) {
                setError(membershipError.message);
                setMembership(null);
                setStatus('expired');
            } else {
                setMembership(membershipRow ?? null);
                if (membershipRow) {
                    setStatus(membershipRow.status || 'live');
                    setPlanId(membershipRow.plan || 'premium');
                    setOfficeId(membershipRow.office_id || 'office-a');
                    setDonationText(membershipRow.donation_cents ? String(membershipRow.donation_cents / 100) : '');
                    setFridge(Boolean(membershipRow.fridge_enabled));
                } else {
                    setStatus('expired');
                }
            }

            const { data: invoiceRows, error: invoiceError } = await supabase
                .from('invoices')
                .select('id, invoice_number, amount_cents, currency, status, issued_on, due_on, paid_at, created_at')
                .eq('owner_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50);

            if (!cancelled) {
                setInvoices(invoiceError ? [] : invoiceRows || []);
                setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [canView, supabase, user.id]);

    useEffect(() => {
        let cancelled = false;
        if (!canView) return;
        const loadUnits = async () => {
            setUnitsLoading(true);
            setUnitsError('');
            try {
                const { data } = await supabase.auth.getSession();
                const token = data?.session?.access_token || '';
                const res = await fetch('/api/work-units?includeOccupant=1', {
                    headers: {
                        accept: 'application/json',
                        authorization: token ? `Bearer ${token}` : ''
                    }
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error || 'Failed to load workspaces');
                if (!cancelled) setUnits(Array.isArray(json?.units) ? json.units : []);
            } catch (e) {
                if (!cancelled) setUnitsError(e?.message || 'Failed to load workspaces');
            } finally {
                if (!cancelled) setUnitsLoading(false);
            }
        };
        loadUnits();
        return () => {
            cancelled = true;
        };
    }, [canView, supabase]);

    useEffect(() => {
        let cancelled = false;
        if (!canView) return;
        const loadDocs = async () => {
            setDocsLoading(true);
            setDocsError('');
            try {
                const { data } = await supabase.auth.getSession();
                const token = data?.session?.access_token || '';
                const res = await fetch('/api/tenant/docs', {
                    headers: {
                        accept: 'application/json',
                        authorization: token ? `Bearer ${token}` : ''
                    }
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error || 'Failed to load documents');
                if (!cancelled) setDocs(Array.isArray(json?.files) ? json.files : []);
            } catch (e) {
                if (!cancelled) setDocsError(e?.message || 'Failed to load documents');
            } finally {
                if (!cancelled) setDocsLoading(false);
            }
        };
        loadDocs();
        return () => {
            cancelled = true;
        };
    }, [canView, supabase, user.id]);

    const submit = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setInfo('');

        try {
            const { error: insertError } = await supabase.from('membership_change_requests').insert({
                owner_id: user.id,
                membership_id: membership?.id ?? null,
                requested_plan: planId,
                requested_office_id: ['desk', 'pod', 'office'].includes(planId) ? (selectedUnitCode || null) : null,
                requested_donation_cents: donationCents,
                requested_fridge_enabled: fridge,
                note: null
            });
            if (insertError) throw insertError;
            setInfo('Request submitted for approval. We’ll email you once it’s confirmed.');
        } catch (err) {
            setError(err?.message || 'Could not submit changes.');
        } finally {
            setBusy(false);
        }
    };

    const cancelMembership = async () => {
        setBusy(true);
        setError('');
        setInfo('');

        try {
            if (!canView) {
                throw new Error('You do not have permission to manage membership.');
            }
            const ok = window.confirm('Cancel your membership? This will stop future billing after approval.');
            if (!ok) return;

            const { error: insertError } = await supabase.from('membership_change_requests').insert({
                owner_id: user.id,
                membership_id: membership?.id ?? null,
                requested_plan: null,
                requested_office_id: null,
                requested_donation_cents: donationCents,
                requested_fridge_enabled: fridge,
                note: 'Cancel membership'
            });
            if (insertError) throw insertError;
            setInfo('Cancellation request submitted for approval.');
        } catch (err) {
            setError(err?.message || 'Could not cancel membership.');
        } finally {
            setBusy(false);
        }
    };

    if (!canView) {
        return (
            <section className="platform-card">
                <h2 style={{ marginTop: 0 }}>Membership</h2>
                <p className="platform-subtitle">
                    Membership billing and plan management is only available to tenant owners.
                </p>
                <p className="platform-subtitle">If you think you should have access, ask your tenant owner or HIVE admin.</p>
            </section>
        );
    }

    return (
        <>
            <section className="platform-card" aria-label="Membership summary">
                <div className="platform-kpi-row">
                    <div>
                        <h2 style={{ margin: 0 }}>Current membership</h2>
                        <p className="platform-subtitle">Status and billing summary.</p>
                    </div>
                    <span className={`badge ${status === 'live' ? 'success' : 'error'}`}>
                        {status === 'live' ? 'Live' : status === 'cancelled' ? 'Cancelled' : 'Expired'}
                    </span>
                </div>

                {loading ? (
                    <p className="platform-subtitle">Loading…</p>
                ) : (
                    <>
                        <p className="platform-kpi" style={{ marginBottom: 0 }}>
                            {formatNZD(displayMonthlyCents)} <span className="platform-subtitle">/ month</span>
                        </p>
                        <p className="platform-subtitle">Plan: {planId === 'office' ? `Office • ${office.label}` : plan.label}</p>
                        <p className="platform-subtitle">Next invoice: {formatDate(membership?.next_invoice_at)}</p>
                        {!membership && <p className="platform-message info">No membership record found yet.</p>}
                    </>
                )}
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
                            {(
                                // Only show a custom option if the current plan is custom
                                planId === 'custom' || (membership?.plan === 'custom')
                                    ? [...PLANS, { id: 'custom', label: 'Custom', monthlyCents: membership?.monthly_amount_cents ?? 0 }]
                                    : PLANS
                            ).map(p => (
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
                                        <span className="platform-subtitle">({formatNZD(p.monthlyCents)} / month)</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    <div style={{ marginTop: '1rem' }}>
                        <h3 style={{ margin: 0 }}>Workspace</h3>
                        <p className="platform-subtitle" style={{ marginTop: 0 }}>
                            Choose a {planId} workspace. For different types or multiple offices, raise a support ticket and we’ll create a custom plan for you.
                        </p>
                        {unitsLoading ? <p className="platform-subtitle">Loading workspaces…</p> : null}
                        {unitsError ? <p className="platform-message error">{unitsError}</p> : null}
                        {(() => {
                            const typeByPlan = {
                                member: null,
                                desk: 'desk',
                                pod: 'desk_pod',
                                office: 'private_office',
                                premium: 'premium_office',
                                custom: null
                            };
                            const targetType = typeByPlan[planId] ?? null;
                            // Always show your own; exclude taken (occupied by others)
                            const filtered = (units || []).filter(u => {
                                if (u.mine) return true;
                                if (!targetType) return false;
                                return u.unit_type === targetType && (!u.is_occupied);
                            });
                            if (!filtered.length) {
                                // For member/custom we intentionally show nothing
                                if (!targetType) return null;
                                return <p className="platform-subtitle">No available workspaces for this plan.</p>;
                            }
                            return (
                            <div className="platform-table-wrap" style={{ marginTop: '0.5rem' }}>
                                <table className="platform-table">
                                    <thead>
                                        <tr>
                                            <th>Select</th>
                                            <th>Building</th>
                                            <th>Unit</th>
                                            <th>Label</th>
                                         
                                            <th>Capacity</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered
                                            .sort((a, b) => {
                                                const ab = String(a?.building || '').localeCompare(String(b?.building || ''));
                                                if (ab !== 0) return ab;
                                                const an = Number(a?.unit_number);
                                                const bn = Number(b?.unit_number);
                                                const aIsNum = Number.isFinite(an);
                                                const bIsNum = Number.isFinite(bn);
                                                if (aIsNum && bIsNum) return an - bn;
                                                return String(a?.unit_number || '').localeCompare(String(b?.unit_number || ''));
                                            })
                                            .map(u => {
                                                const disabled = (u.is_occupied && !u.mine);
                                                const checked = selectedUnitCode === u.code;
                                                return (
                                                    <tr key={u.code} className={disabled ? 'row-disabled' : ''}>
                                                        <td>
                                                            <input
                                                                type="radio"
                                                                name="workspace"
                                                                disabled={busy || disabled}
                                                                checked={checked}
                                                                onChange={() => setSelectedUnitCode(u.code)}
                                                            />
                                                        </td>
                                                        <td className="platform-mono">{u.building || '—'}</td>
                                                        <td className="platform-mono">{u.unit_number ?? u.code}</td>
                                                        <td>{u.label || '—'}</td>
                                                        <td className="platform-mono">{Number.isFinite(Number(u.capacity)) ? Number(u.capacity) : '—'}</td>
                                                        <td>{u.mine ? <span className="badge success">yours</span> : u.is_occupied ? <span className="badge pending">taken</span> : <span className="badge neutral">available</span>}</td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        );
                        })()}
                    </div>

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
                        <input type="checkbox" checked={fridge} onChange={e => setFridge(e.target.checked)} disabled={busy} />
                        <span>
                            Mini <span className="platform-subtitle">({formatNZD(FRIDGE_WEEKLY_CENTS)} / week)</span>
                        </span>
                    </label>
                    <p className="platform-message info" style={{ marginTop: '1rem' }}>
                        Estimated total: <span className="platform-mono">{formatNZD(computedMonthlyCents)} / month</span>
                    </p>

                    {error && <p className="platform-message error">{error}</p>}
                    {info && <p className="platform-message info">{info}</p>}

                    <div className="platform-actions" style={{ marginTop: '1rem' }}>
                        <button className="btn primary" type="submit" disabled={busy}>
                            {busy ? 'Submitting…' : 'Request changes'}
                        </button>
                        <button className="btn secondary" type="button" onClick={cancelMembership} disabled={busy || status !== 'live'}>
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
                            {invoices.length ? (
                                invoices.map(inv => (
                                    <tr key={inv.id}>
                                        <td className="platform-mono">{inv.invoice_number || inv.id.slice(0, 8).toUpperCase()}</td>
                                        <td className="platform-mono">{formatDate(inv.issued_on || inv.created_at)}</td>
                                        <td className="platform-mono">{formatNZD(inv.amount_cents)}</td>
                                        <td>
                                            <span
                                                className={`badge ${
                                                    inv.status === 'paid' ? 'success' : inv.status === 'void' ? 'error' : 'pending'
                                                }`}
                                            >
                                                {inv.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} className="platform-subtitle">
                                        No invoices yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="platform-card" style={{ marginTop: '1.25rem' }} aria-label="Documentation">
                <h2 style={{ marginTop: 0 }}>Documentation</h2>
                <p className="platform-subtitle">Tenant documents</p>
                {docsLoading ? <p className="platform-subtitle">Loading documents…</p> : null}
                {docsError ? <p className="platform-message error">{docsError}</p> : null}
                {!docsLoading && !docsError && (
                    <div className="platform-table-wrap" style={{ marginTop: '1rem' }}>
                        <table className="platform-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Updated</th>
                                    <th>Size</th>
                                    <th>Open</th>
                                </tr>
                            </thead>
                            <tbody>
                                {docs.length ? (
                                    docs.map(doc => (
                                        <tr key={doc.name}>
                                            <td className="platform-mono">{doc.name}</td>
                                            <td className="platform-mono">{doc.updated_at ? new Date(doc.updated_at).toLocaleString() : '—'}</td>
                                            <td className="platform-mono">{formatBytes(doc.size)}</td>
                                            <td>
                                                {doc.url ? (
                                                    <a className="btn ghost" href={doc.url} target="_blank" rel="noopener noreferrer">
                                                        View
                                                    </a>
                                                ) : (
                                                    '—'
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={4} className="platform-subtitle">
                                            No documents yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </>
    );
}
