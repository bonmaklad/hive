'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePlatformSession } from '../../PlatformContext';

function getMonthStart() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-01`;
}

function formatNZD(cents) {
    const value = Number(cents || 0) / 100;
    try {
        return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(value);
    } catch {
        return `$${value}`;
    }
}

function formatNZDOptional(cents) {
    if (cents === null || cents === undefined) return '—';
    return formatNZD(cents);
}

const PLAN_MONTHLY_CENTS = {
    member: 9900,
    desk: 24900,
    pod: 34900,
    office: 69900,
    premium: 49900,
    custom: 0
};

const OFFICE_MONTHLY_CENTS = {
    'office-a': 69900,
    'office-b': 109900,
    'office-c': 149900
};

const FRIDGE_MONTHLY_CENTS = 2500;

function computeMonthlyCents({ plan, officeId, donationCents, fridgeEnabled, monthlyOverrideCents }) {
    const hasOverride = monthlyOverrideCents !== null && monthlyOverrideCents !== undefined && monthlyOverrideCents !== '';
    if (hasOverride) {
        const override = Number.isFinite(monthlyOverrideCents) ? monthlyOverrideCents : Number(monthlyOverrideCents);
        if (Number.isFinite(override) && override >= 0) return Math.floor(override);
    }

    const base =
        plan === 'office'
            ? OFFICE_MONTHLY_CENTS[officeId] || PLAN_MONTHLY_CENTS.office
            : PLAN_MONTHLY_CENTS[plan] ?? 0;
    const fridge = fridgeEnabled ? FRIDGE_MONTHLY_CENTS : 0;
    return Math.max(0, base + (donationCents || 0) + fridge);
}

function computeMonthlyBaseCents({ plan, officeId, donationCents, fridgeEnabled }) {
    return computeMonthlyCents({ plan, officeId, donationCents, fridgeEnabled, monthlyOverrideCents: null });
}

function parseEmail(value) {
    const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!email) return '';
    if (email.length > 254) return '';
    if (!email.includes('@')) return '';
    return email;
}

function toCentsOrZero(value) {
    const cleaned = String(value || '').replace(/[^0-9.]/g, '');
    const parsed = Number.parseFloat(cleaned);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.round(parsed * 100));
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

async function readJsonResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        return response.json();
    }

    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return { _raw: text };
    }
}

function errorFromNonJson(response, payload) {
    const snippet = typeof payload?._raw === 'string' ? payload._raw.slice(0, 200) : '';
    const hint =
        snippet.includes('Cannot find module') || snippet.includes('webpack-runtime')
            ? ' (Next dev server cache looks corrupted — stop dev server, delete `.next`, restart `npm run dev`.)'
            : '';
    return new Error(`Request failed (${response.status}). Server returned non-JSON.${hint}`);
}

function Modal({ open, title, subtitle, onClose, children, footer }) {
    useEffect(() => {
        if (!open) return;

        const onKeyDown = event => {
            if (event.key === 'Escape') onClose();
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="platform-modal-overlay" role="presentation" onMouseDown={onClose}>
            <div className="platform-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}>
                <div className="platform-modal-header">
                    <div>
                        <h2 style={{ margin: 0 }}>{title}</h2>
                        {subtitle && <p className="platform-subtitle">{subtitle}</p>}
                    </div>
                    <button className="btn ghost" type="button" onClick={onClose}>
                        Close
                    </button>
                </div>
                <div style={{ marginTop: '1rem' }}>{children}</div>
                {footer ? <div className="platform-card-actions">{footer}</div> : null}
            </div>
        </div>
    );
}

function TenantDocumentsSection({ tenantId, authHeader }) {
    const [docs, setDocs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [uploading, setUploading] = useState(false);
    const [pendingFiles, setPendingFiles] = useState([]);

    const loadDocs = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/admin/tenants/${tenantId}/docs`, { headers: await authHeader() });
            const json = await readJsonResponse(res);
            if (!res.ok) throw new Error(json?.error || 'Failed to load documents.');
            setDocs(Array.isArray(json?.files) ? json.files : []);
        } catch (e) {
            setError(e?.message || 'Failed to load documents.');
            setDocs([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!tenantId) return;
        loadDocs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId]);

    const onUpload = async () => {
        if (!pendingFiles?.length) return;
        setUploading(true);
        setError('');
        try {
            const form = new FormData();
            for (const f of pendingFiles) form.append('files', f);
            const res = await fetch(`/api/admin/tenants/${tenantId}/docs`, {
                method: 'POST',
                headers: await authHeader(),
                body: form
            });
            const json = await readJsonResponse(res);
            if (!res.ok) throw new Error(json?.error || 'Failed to upload document(s).');
            setPendingFiles([]);
            await loadDocs();
        } catch (e) {
            setError(e?.message || 'Failed to upload document(s).');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div style={{ marginTop: '1.25rem' }}>
            <h3 style={{ margin: 0 }}>Documents</h3>
            <p className="platform-subtitle" style={{ marginTop: 0 }}>
                Tenant documents in storage. Upload files to <span className="platform-mono">{tenantId}/</span>.
            </p>
            {error && <p className="platform-message error">{error}</p>}
            {loading ? <p className="platform-subtitle">Loading documents…</p> : null}
            {!loading && (
                <div className="platform-table-wrap" style={{ marginTop: '0.75rem' }}>
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

            <div className="platform-card-actions">
                <input
                    type="file"
                    multiple
                    onChange={e => setPendingFiles(Array.from(e.target.files || []))}
                    disabled={uploading}
                />
                <button className="btn primary" type="button" onClick={onUpload} disabled={uploading || !pendingFiles.length}>
                    {uploading ? 'Uploading…' : 'Upload'}
                </button>
                <button className="btn ghost" type="button" onClick={loadDocs} disabled={uploading}>
                    Refresh
                </button>
            </div>
        </div>
    );
}

function WizardSteps({ current, steps }) {
    return (
        <div className="platform-steps" aria-label="Setup steps">
            {steps.map((label, index) => (
                <span key={label} className={`platform-step ${index === current ? 'active' : index < current ? 'done' : ''}`}>
                    {index + 1}. {label}
                </span>
            ))}
        </div>
    );
}

function TenantWizardModal({ open, monthStart, authHeader, onClose, onCreated, setGlobalError }) {
    const steps = ['Tenant + primary user', 'Membership', 'Initial tokens', 'Additional users', 'Confirm'];
    const [step, setStep] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const [tenantName, setTenantName] = useState('');
    const [primaryEmail, setPrimaryEmail] = useState('');
    const [primaryRole, setPrimaryRole] = useState('owner');

    const [membershipPlan, setMembershipPlan] = useState('member');
    const [membershipOfficeId, setMembershipOfficeId] = useState('office-a');
    const [membershipStatus, setMembershipStatus] = useState('live');
    const [membershipDonationNZD, setMembershipDonationNZD] = useState('0');
    const [membershipFridgeEnabled, setMembershipFridgeEnabled] = useState(false);
    const [membershipMonthlyOverrideNZD, setMembershipMonthlyOverrideNZD] = useState('');
    const [membershipInvoiceDay, setMembershipInvoiceDay] = useState(String(new Date().getDate()));

    const [tokensTotal, setTokensTotal] = useState('10');
    const [additionalUsers, setAdditionalUsers] = useState([{ email: '', role: 'member' }]);
    const [sendMagicLinks, setSendMagicLinks] = useState(true);

    useEffect(() => {
        if (!open) return;
        setStep(0);
        setBusy(false);
        setError('');
        setTenantName('');
        setPrimaryEmail('');
        setPrimaryRole('owner');
        setMembershipPlan('member');
        setMembershipOfficeId('office-a');
        setMembershipStatus('live');
        setMembershipDonationNZD('0');
        setMembershipFridgeEnabled(false);
        setMembershipMonthlyOverrideNZD('');
        setMembershipInvoiceDay(String(new Date().getDate()));
        setTokensTotal('10');
        setAdditionalUsers([{ email: '', role: 'member' }]);
        setSendMagicLinks(true);
    }, [open]);

    const donationCents = Math.max(0, Math.round(Number(membershipDonationNZD || 0) * 100));
    const monthlyOverrideCents = membershipMonthlyOverrideNZD.trim()
        ? Math.max(0, Math.round(Number(membershipMonthlyOverrideNZD || 0) * 100))
        : null;
    const computedMonthlyCents = computeMonthlyCents({
        plan: membershipPlan,
        officeId: membershipPlan === 'office' ? membershipOfficeId : null,
        donationCents,
        fridgeEnabled: membershipFridgeEnabled,
        monthlyOverrideCents
    });
    const baseMonthlyCents = computeMonthlyBaseCents({
        plan: membershipPlan,
        officeId: membershipPlan === 'office' ? membershipOfficeId : null,
        donationCents,
        fridgeEnabled: membershipFridgeEnabled
    });

    const canNext = useMemo(() => {
        if (step === 0) return Boolean(tenantName.trim()) && Boolean(parseEmail(primaryEmail));
        if (step === 1) return Boolean(membershipPlan) && (membershipPlan !== 'office' || Boolean(membershipOfficeId));
        if (step === 2) return Number.isFinite(Number(tokensTotal)) && Number(tokensTotal) >= 0;
        return true;
    }, [membershipOfficeId, membershipPlan, primaryEmail, step, tenantName, tokensTotal]);

    const create = async () => {
        setBusy(true);
        setError('');
        setGlobalError('');
        try {
            const payload = {
                tenant_name: tenantName,
                primary_email: parseEmail(primaryEmail),
                primary_role: primaryRole,
                membership: {
                    plan: membershipPlan,
                    office_id: membershipPlan === 'office' ? membershipOfficeId : null,
                    status: membershipStatus,
                    donation_cents: donationCents,
                    fridge_enabled: membershipFridgeEnabled,
                    monthly_amount_cents: monthlyOverrideCents,
                    next_invoice_day: Math.min(31, Math.max(1, Math.floor(Number(membershipInvoiceDay || new Date().getDate()))))
                },
                period_start: monthStart,
                tokens_total: Math.max(0, Math.floor(Number(tokensTotal || 0))),
                additional_users: additionalUsers
                    .map(u => ({ email: parseEmail(u.email), role: u.role }))
                    .filter(u => u.email && ['member'].includes(u.role)),
                send_magic_links: sendMagicLinks
            };

            const res = await fetch('/api/admin/tenants/setup', {
                method: 'POST',
                headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const json = await readJsonResponse(res);
            if (!res.ok) throw new Error(json?.error || 'Failed to create tenant.');

            onCreated?.(json?.tenant?.id || null);
            onClose();
        } catch (err) {
            setError(err?.message || 'Failed to create tenant.');
        } finally {
            setBusy(false);
        }
    };

    const footer = (
        <>
            <button className="btn secondary" type="button" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={busy || step === 0}>
                Back
            </button>
            {step < steps.length - 1 ? (
                <button className="btn primary" type="button" onClick={() => setStep(s => Math.min(steps.length - 1, s + 1))} disabled={busy || !canNext}>
                    Next
                </button>
            ) : (
                <button className="btn primary" type="button" onClick={create} disabled={busy || !canNext}>
                    {busy ? 'Creating…' : 'Create tenant'}
                </button>
            )}
        </>
    );

    return (
        <Modal
            open={open}
            title="Add tenant"
            subtitle={`Month start: ${monthStart}`}
            onClose={() => (busy ? null : onClose())}
            footer={footer}
        >
            <WizardSteps current={step} steps={steps} />
            {error && <p className="platform-message error">{error}</p>}

            {step === 0 ? (
                <div className="platform-grid" style={{ marginTop: '1rem' }}>
                    <div className="platform-card span-6">
                        <h3 style={{ marginTop: 0 }}>Tenant</h3>
                        <label className="platform-subtitle">Tenant name</label>
                        <input value={tenantName} onChange={e => setTenantName(e.target.value)} disabled={busy} />
                    </div>

                    <div className="platform-card span-6">
                        <h3 style={{ marginTop: 0 }}>Primary user</h3>
                        <p className="platform-subtitle">This user is the primary contact for the tenant.</p>
                        <label className="platform-subtitle">Email</label>
                        <input value={primaryEmail} onChange={e => setPrimaryEmail(e.target.value)} disabled={busy} />
                        <label className="platform-subtitle" style={{ marginTop: '0.75rem', display: 'block' }}>
                            Role
                        </label>
                        <select value={primaryRole} onChange={e => setPrimaryRole(e.target.value)} disabled={busy}>
                            <option value="owner">owner</option>
                        </select>
                    </div>
                </div>
            ) : null}

            {step === 1 ? (
                <div className="platform-grid" style={{ marginTop: '1rem' }}>
                    <div className="platform-card span-6">
                        <h3 style={{ marginTop: 0 }}>Membership</h3>
                        <label className="platform-subtitle">Plan</label>
                        <select value={membershipPlan} onChange={e => setMembershipPlan(e.target.value)} disabled={busy}>
                            <option value="member">member</option>
                            <option value="desk">desk</option>
                            <option value="pod">pod</option>
                            <option value="office">office</option>
                            <option value="premium">premium</option>
                            <option value="custom">custom</option>
                        </select>

                        {membershipPlan === 'office' ? (
                            <>
                                <label className="platform-subtitle" style={{ marginTop: '0.75rem', display: 'block' }}>
                                    Office
                                </label>
                                <select value={membershipOfficeId} onChange={e => setMembershipOfficeId(e.target.value)} disabled={busy}>
                                    <option value="office-a">office-a</option>
                                    <option value="office-b">office-b</option>
                                    <option value="office-c">office-c</option>
                                </select>
                            </>
                        ) : null}

                        <label className="platform-subtitle" style={{ marginTop: '0.75rem', display: 'block' }}>
                            Status
                        </label>
                        <select value={membershipStatus} onChange={e => setMembershipStatus(e.target.value)} disabled={busy}>
                            <option value="live">live</option>
                            <option value="expired">expired</option>
                            <option value="cancelled">cancelled</option>
                        </select>
                    </div>

                    <div className="platform-card span-6">
                        <h3 style={{ marginTop: 0 }}>Extras</h3>
                        <label className="platform-subtitle">Donation (NZD / month)</label>
                        <input
                            value={membershipDonationNZD}
                            onChange={e => setMembershipDonationNZD(e.target.value)}
                            disabled={busy}
                            inputMode="decimal"
                        />
                        <p className="platform-subtitle" style={{ marginTop: '0.75rem' }}>
                            Calculated amount (plan + donation + fridge): <span className="platform-mono">{formatNZD(baseMonthlyCents)}</span>
                        </p>
                        <label className="platform-subtitle" style={{ marginTop: '0.5rem', display: 'block' }}>
                            Monthly price override (NZD, optional)
                        </label>
                        <input
                            value={membershipMonthlyOverrideNZD}
                            onChange={e => setMembershipMonthlyOverrideNZD(e.target.value)}
                            disabled={busy}
                            inputMode="decimal"
                            placeholder="Leave blank to auto-calc"
                        />
                        <label className="platform-subtitle" style={{ marginTop: '0.75rem', display: 'block' }}>
                            Billing day (1–31)
                        </label>
                        <input
                            value={membershipInvoiceDay}
                            onChange={e => setMembershipInvoiceDay(e.target.value)}
                            disabled={busy}
                            inputMode="numeric"
                            placeholder="e.g. 15"
                        />
                        <label className="platform-subtitle" style={{ marginTop: '0.75rem', display: 'block' }}>
                            <input
                                type="checkbox"
                                checked={membershipFridgeEnabled}
                                onChange={e => setMembershipFridgeEnabled(e.target.checked)}
                                disabled={busy}
                                style={{ marginRight: '0.5rem' }}
                            />
                            Fridge access
                        </label>
                        <p className="platform-subtitle" style={{ marginTop: '0.5rem' }}>
                            Final monthly amount: <span className="platform-mono">{formatNZD(computedMonthlyCents)}</span>
                        </p>
                    </div>
                </div>
            ) : null}

            {step === 2 ? (
                <div className="platform-card" style={{ marginTop: '1rem' }}>
                    <h3 style={{ marginTop: 0 }}>Initial token pool</h3>
                    <p className="platform-subtitle">
                    Tokens are a tenant-level pool. The token holder must be the owner; all tenant users share the same bookings pool.
                    </p>
                    <label className="platform-subtitle">Tokens total (month starting {monthStart})</label>
                    <input value={tokensTotal} onChange={e => setTokensTotal(e.target.value)} disabled={busy} inputMode="numeric" />
                </div>
            ) : null}

            {step === 3 ? (
                <div className="platform-card" style={{ marginTop: '1rem' }}>
                    <h3 style={{ marginTop: 0 }}>Additional users</h3>
                    <p className="platform-subtitle">Add tenant users (non-owners).</p>
                    <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
                        {additionalUsers.map((u, index) => (
                            <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 160px auto', gap: '0.75rem' }}>
                                <input
                                    value={u.email}
                                    onChange={e =>
                                        setAdditionalUsers(list => {
                                            const next = [...list];
                                            next[index] = { ...next[index], email: e.target.value };
                                            return next;
                                        })
                                    }
                                    disabled={busy}
                                    placeholder="email@company.com"
                                />
                                <select
                                    value={u.role}
                                    onChange={e =>
                                        setAdditionalUsers(list => {
                                            const next = [...list];
                                            next[index] = { ...next[index], role: e.target.value };
                                            return next;
                                        })
                                    }
                                    disabled={busy}
                                >
                                    <option value="member">member</option>
                                </select>
                                <button
                                    className="btn secondary"
                                    type="button"
                                    onClick={() =>
                                        setAdditionalUsers(list => {
                                            const next = list.filter((_, idx) => idx !== index);
                                            return next.length ? next : [{ email: '', role: 'member' }];
                                        })
                                    }
                                    disabled={busy || additionalUsers.length <= 1}
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="platform-card-actions">
                        <button
                            className="btn ghost"
                            type="button"
                            onClick={() => setAdditionalUsers(list => [...list, { email: '', role: 'member' }])}
                            disabled={busy}
                        >
                            Add another user
                        </button>
                    </div>
                </div>
            ) : null}

            {step === 4 ? (
                <div className="platform-card" style={{ marginTop: '1rem' }}>
                    <h3 style={{ marginTop: 0 }}>Confirm</h3>
                    <p className="platform-subtitle">
                        Tenant: <span className="platform-mono">{tenantName || '—'}</span>
                        <br />
                        Primary: <span className="platform-mono">{parseEmail(primaryEmail) || '—'}</span> ({primaryRole})
                        <br />
                        Membership: <span className="platform-mono">{membershipPlan}</span> •{' '}
                        <span className="platform-mono">{formatNZD(computedMonthlyCents)} / month</span>
                        <br />
                        Tokens: <span className="platform-mono">{Math.max(0, Math.floor(Number(tokensTotal || 0)))}</span> (from {monthStart})
                    </p>
                    <label className="platform-subtitle" style={{ marginTop: '0.75rem', display: 'block' }}>
                        <input
                            type="checkbox"
                            checked={sendMagicLinks}
                            onChange={e => setSendMagicLinks(e.target.checked)}
                            disabled={busy}
                            style={{ marginRight: '0.5rem' }}
                        />
                        Send magic links to all users
                    </label>
                </div>
            ) : null}
        </Modal>
    );
}

function TenantEditModal({ open, tenant, monthStart, authHeader, onClose, onSaved, setGlobalError }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const primary = tenant?.primary_user || null;
    const primaryId = primary?.user_id || null;

    const [name, setName] = useState('');
    const [plan, setPlan] = useState('member');
    const [officeId, setOfficeId] = useState('office-a');
    const [status, setStatus] = useState('live');
    const [donationNZD, setDonationNZD] = useState('0');
    const [fridgeEnabled, setFridgeEnabled] = useState(false);
    const [monthlyOverrideNZD, setMonthlyOverrideNZD] = useState('');
    const [tokensTotal, setTokensTotal] = useState('0');
    const [invoiceDay, setInvoiceDay] = useState(String(new Date().getDate()));
    const [paymentTerms, setPaymentTerms] = useState('invoice');
    const [paidTill, setPaidTill] = useState('');
    const [workUnits, setWorkUnits] = useState([]);
    const [workUnitCodes, setWorkUnitCodes] = useState([]);
    const [workUnitsLoading, setWorkUnitsLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        setBusy(false);
        setError('');
        setName(tenant?.name || '');
        setPlan(tenant?.membership?.plan || 'member');
        setOfficeId(tenant?.membership?.office_id || 'office-a');
        setStatus(tenant?.membership?.status || 'live');
        setDonationNZD(String(Number(tenant?.membership?.donation_cents || 0) / 100));
        setFridgeEnabled(Boolean(tenant?.membership?.fridge_enabled));
        {
            const cents = tenant?.membership?.monthly_amount_cents;
            if (Number.isFinite(cents)) {
                setMonthlyOverrideNZD(String((Number(cents) || 0) / 100));
            } else {
                setMonthlyOverrideNZD('');
            }
        }
        {
            const terms = tenant?.membership?.payment_terms || 'invoice';
            setPaymentTerms(terms);
            const rawPaidTill = tenant?.membership?.paid_till;
            const dateString = typeof rawPaidTill === 'string' ? rawPaidTill.slice(0, 10) : '';
            setPaidTill(dateString);
        }
        setTokensTotal(String(primary?.room_credits?.tokens_total ?? 0));
        {
            const day = tenant?.membership?.next_invoice_at;
            if (Number.isFinite(Number(day))) {
                setInvoiceDay(String(Math.min(31, Math.max(1, Math.floor(Number(day))))));
            } else {
                const fallback = tenant?.membership?.created_at ? new Date(tenant.membership.created_at).getDate() : new Date().getDate();
                setInvoiceDay(String(fallback));
            }
        }
        setWorkUnitCodes(Array.isArray(tenant?.work_unit_codes) ? tenant.work_unit_codes.filter(v => typeof v === 'string') : []);
        setWorkUnits([]);
        setWorkUnitsLoading(false);
    }, [open, tenant, primary]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;

        const load = async () => {
            setWorkUnitsLoading(true);
            try {
                const res = await fetch('/api/admin/work-units?includeOccupant=1', {
                    headers: await authHeader()
                });
                const json = await readJsonResponse(res);
                if (!res.ok) {
                    if (json?._raw) throw errorFromNonJson(res, json);
                    throw new Error(json?.error || 'Failed to load workspaces.');
                }
                if (cancelled) return;
                setWorkUnits(Array.isArray(json?.units) ? json.units : []);
            } catch (err) {
                if (!cancelled) setError(err?.message || 'Failed to load workspaces.');
            } finally {
                if (!cancelled) setWorkUnitsLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [authHeader, open]);

    const donationCents = Math.max(0, Math.round(Number(donationNZD || 0) * 100));
    const monthlyOverrideCents = monthlyOverrideNZD.trim() ? Math.max(0, Math.round(Number(monthlyOverrideNZD || 0) * 100)) : null;
    const computedMonthlyCents = computeMonthlyCents({
        plan,
        officeId: plan === 'office' ? officeId : null,
        donationCents,
        fridgeEnabled,
        monthlyOverrideCents
    });
    const baseMonthlyCents = computeMonthlyBaseCents({
        plan,
        officeId: plan === 'office' ? officeId : null,
        donationCents,
        fridgeEnabled
    });

    const save = async () => {
        setBusy(true);
        setError('');
        setGlobalError('');
        try {
            if (!tenant?.id) throw new Error('Missing tenant id.');
            if (!primaryId) throw new Error('Tenant is missing an owner user.');
            if (paymentTerms === 'advanced' && !paidTill) throw new Error('Paid until date is required for advanced terms.');
            const headers = { ...(await authHeader()), 'Content-Type': 'application/json' };

            if (name.trim() && name.trim() !== tenant.name) {
                const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ name })
                });
                const json = await readJsonResponse(res);
                if (!res.ok) throw new Error(json?.error || 'Failed to update tenant name.');
            }

            const resMembership = await fetch(`/api/admin/tenants/${tenant.id}/membership`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    owner_id: primaryId,
                    plan,
                    office_id: plan === 'office' ? officeId : null,
                    status,
                    donation_cents: donationCents,
                    fridge_enabled: fridgeEnabled,
                    monthly_amount_cents: monthlyOverrideCents,
                    next_invoice_day: Math.min(31, Math.max(1, Math.floor(Number(invoiceDay || new Date().getDate())))),
                    payment_terms: paymentTerms,
                    paid_till: paymentTerms === 'advanced' ? paidTill : null
                })
            });
            const jsonMembership = await readJsonResponse(resMembership);
            if (!resMembership.ok) throw new Error(jsonMembership?.error || 'Failed to update membership.');

            const tokens = Math.max(0, Math.floor(Number(tokensTotal || 0)));
            const resCredits = await fetch(`/api/admin/tenants/${tenant.id}/credits`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    owner_id: primaryId,
                    period_start: monthStart,
                    tokens_total: tokens
                })
            });
            const jsonCredits = await readJsonResponse(resCredits);
            if (!resCredits.ok) throw new Error(jsonCredits?.error || 'Failed to update token pool.');

            const resWorkUnits = await fetch(`/api/admin/tenants/${tenant.id}/work-units`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ codes: workUnitCodes })
            });
            const jsonWorkUnits = await readJsonResponse(resWorkUnits);
            if (!resWorkUnits.ok) throw new Error(jsonWorkUnits?.error || 'Failed to update workspaces.');

            onSaved?.();
            onClose();
        } catch (err) {
            setError(err?.message || 'Failed to save changes.');
        } finally {
            setBusy(false);
        }
    };

    const footer = (
        <>
            <button className="btn secondary" type="button" onClick={onClose} disabled={busy}>
                Cancel
            </button>
            <button className="btn primary" type="button" onClick={save} disabled={busy || !name.trim()}>
                {busy ? 'Saving…' : 'Save changes'}
            </button>
        </>
    );

    return (
        <Modal
            open={open}
            title={`Edit ${tenant?.name || 'tenant'}`}
            subtitle={primary?.profile?.email ? `Primary: ${primary.profile.email}` : null}
            onClose={() => (busy ? null : onClose())}
            footer={footer}
        >
            {error && <p className="platform-message error">{error}</p>}
            <div className="platform-grid">
                <div className="platform-card span-6">
                    <h3 style={{ marginTop: 0 }}>Tenant</h3>
                    <label className="platform-subtitle">Tenant name</label>
                    <input value={name} onChange={e => setName(e.target.value)} disabled={busy} />
                </div>

                <div className="platform-card span-6">
                    <h3 style={{ marginTop: 0 }}>Token pool</h3>
                    <p className="platform-subtitle">
                        Period start: <span className="platform-mono">{monthStart}</span>
                    </p>
                    <label className="platform-subtitle">Tokens total</label>
                    <input value={tokensTotal} onChange={e => setTokensTotal(e.target.value)} disabled={busy} inputMode="numeric" />
                </div>

                <div className="platform-card span-6">
                    <h3 style={{ marginTop: 0 }}>Membership</h3>
                    <label className="platform-subtitle">Plan</label>
                    <select value={plan} onChange={e => setPlan(e.target.value)} disabled={busy}>
                        <option value="member">member</option>
                        <option value="desk">desk</option>
                        <option value="pod">pod</option>
                        <option value="office">office</option>
                        <option value="premium">premium</option>
                        <option value="custom">custom</option>
                    </select>
                    <p className="platform-subtitle" style={{ marginTop: '0.5rem' }}>
                        Current price: <span className="platform-mono">{formatNZDOptional(tenant?.membership?.monthly_amount_cents)}</span> / month
                    </p>
                    <label className="platform-subtitle" style={{ marginTop: '0.5rem', display: 'block' }}>
                        Set price override (NZD)
                    </label>
                    <input
                        value={monthlyOverrideNZD}
                        onChange={e => setMonthlyOverrideNZD(e.target.value)}
                        disabled={busy}
                        inputMode="decimal"
                        placeholder="Leave blank to auto-calc"
                    />
                    <label className="platform-subtitle" style={{ marginTop: '0.75rem', display: 'block' }}>
                        Billing day (1–31)
                    </label>
                    <input value={invoiceDay} onChange={e => setInvoiceDay(e.target.value)} disabled={busy} inputMode="numeric" />
                    <label className="platform-subtitle" style={{ marginTop: '0.75rem', display: 'block' }}>
                        Payment terms
                    </label>
                    <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} disabled={busy}>
                        <option value="invoice">invoice</option>
                        <option value="auto_card">auto_card</option>
                        <option value="advanced">advanced (paid in advance)</option>
                    </select>
                    {paymentTerms === 'advanced' ? (
                        <>
                            <label className="platform-subtitle" style={{ marginTop: '0.75rem', display: 'block' }}>
                                Paid until
                            </label>
                            <input type="date" value={paidTill} onChange={e => setPaidTill(e.target.value)} disabled={busy} />
                        </>
                    ) : null}
                    {plan === 'office' ? (
                        <>
                            <label className="platform-subtitle" style={{ marginTop: '0.75rem', display: 'block' }}>
                                Office
                            </label>
                            <select value={officeId} onChange={e => setOfficeId(e.target.value)} disabled={busy}>
                                <option value="office-a">office-a</option>
                                <option value="office-b">office-b</option>
                                <option value="office-c">office-c</option>
                            </select>
                        </>
                    ) : null}
                    <label className="platform-subtitle" style={{ marginTop: '0.75rem', display: 'block' }}>
                        Status
                    </label>
                    <select value={status} onChange={e => setStatus(e.target.value)} disabled={busy}>
                        <option value="live">live</option>
                        <option value="expired">expired</option>
                        <option value="cancelled">cancelled</option>
                    </select>
                </div>

                <div className="platform-card span-6">
                    <h3 style={{ marginTop: 0 }}>Extras</h3>
                    <label className="platform-subtitle">Donation (NZD / month)</label>
                    <input value={donationNZD} onChange={e => setDonationNZD(e.target.value)} disabled={busy} inputMode="decimal" />
                    <p className="platform-subtitle" style={{ marginTop: '0.75rem' }}>
                        Calculated amount (plan + donation + fridge): <span className="platform-mono">{formatNZD(baseMonthlyCents)}</span>
                    </p>
                    <label className="platform-subtitle" style={{ marginTop: '0.5rem', display: 'block' }}>
                        Monthly price override (NZD, optional)
                    </label>
                    <input
                        value={monthlyOverrideNZD}
                        onChange={e => setMonthlyOverrideNZD(e.target.value)}
                        disabled={busy}
                        inputMode="decimal"
                        placeholder="Leave blank to auto-calc"
                    />
                    <label className="platform-subtitle" style={{ marginTop: '0.75rem', display: 'block' }}>
                        <input
                            type="checkbox"
                            checked={fridgeEnabled}
                            onChange={e => setFridgeEnabled(e.target.checked)}
                            disabled={busy}
                            style={{ marginRight: '0.5rem' }}
                        />
                        Fridge access
                    </label>
                    <p className="platform-subtitle" style={{ marginTop: '0.5rem' }}>
                        Final monthly amount: <span className="platform-mono">{formatNZD(computedMonthlyCents)}</span>
                    </p>
                </div>

                <div className="platform-card span-12">
                    <h3 style={{ marginTop: 0 }}>Workspaces</h3>
                    <p className="platform-subtitle" style={{ marginTop: 0 }}>
                        Assign one or more workspaces to this tenant. Taken workspaces are disabled.
                    </p>
                    {workUnitsLoading ? <p className="platform-subtitle">Loading workspaces…</p> : null}
                    <label className="platform-subtitle">Allocated workspaces</label>
                    <div className="platform-table-wrap" style={{ marginTop: '0.5rem' }}>
                        <table className="platform-table">
                            <thead>
                                <tr>
                                    <th>Select</th>
                                    <th>Building</th>
                                    <th>Unit</th>
                                    <th>Label</th>
                                    <th>Type</th>
                                    <th>Capacity</th>
                                    <th>Price</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {([...(workUnits || [])]
                                    .sort((a, b) => {
                                        const ab = String(a?.building || '').localeCompare(String(b?.building || ''));
                                        if (ab !== 0) return ab;
                                        const an = Number(a?.unit_number);
                                        const bn = Number(b?.unit_number);
                                        const aIsNum = Number.isFinite(an);
                                        const bIsNum = Number.isFinite(bn);
                                        if (aIsNum && bIsNum) return an - bn;
                                        return String(a?.unit_number || '').localeCompare(String(b?.unit_number || ''));
                                    }))
                                    .map(unit => {
                                        const code = unit?.code;
                                        if (!code) return null;
                                        const capacity = Number.isFinite(Number(unit?.capacity)) ? Math.max(1, Math.floor(Number(unit.capacity))) : 1;
                                        const occupiedCount = Number.isFinite(Number(unit?.occupied_count))
                                            ? Math.max(0, Math.floor(Number(unit.occupied_count)))
                                            : 0;
                                        const isFull = Boolean(unit?.is_full ?? (occupiedCount >= capacity));
                                        const checked = workUnitCodes.includes(code);
                                        const disabled = Boolean(!checked && isFull);
                                        const basePrice = unit?.price_cents ?? unit?.display_price_cents;
                                        return (
                                            <tr key={code} className={disabled ? 'row-disabled' : ''}>
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        disabled={busy || disabled}
                                                        checked={checked}
                                                        onChange={e => {
                                                            setWorkUnitCodes(list => {
                                                                const has = list.includes(code);
                                                                if (e.target.checked && !has) return [...list, code];
                                                                if (!e.target.checked && has) return list.filter(c => c !== code);
                                                                return list;
                                                            });
                                                        }}
                                                    />
                                                </td>
                                                <td className="platform-mono">{unit?.building || '—'}</td>
                                                <td className="platform-mono">{unit?.unit_number ?? unit?.code}</td>
                                                <td>{unit?.label || '—'}</td>
                                                <td className="platform-mono">{unit?.unit_type || unit?.type || '—'}</td>
                                                <td className="platform-mono">{capacity}</td>
                                                <td className="platform-mono">{formatNZDOptional(basePrice)}</td>
                                                <td>
                                                    {isFull
                                                        ? <span className="badge pending">full</span>
                                                        : occupiedCount > 0
                                                            ? <span className="badge neutral">{occupiedCount}/{capacity} used</span>
                                                            : <span className="badge success">available</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                    <p className="platform-subtitle" style={{ marginTop: '0.75rem' }}>
                        Selected: <span className="platform-mono">{workUnitCodes.length ? workUnitCodes.join(', ') : 'none'}</span>
                    </p>
                </div>
            </div>
        </Modal>
    );
}

function UserDetailsModal({ open, tenantId, userRow, authHeader, onClose, onSaved, setGlobalError, sendMagicLink }) {
    const userId = userRow?.user_id || null;
    const email = userRow?.profile?.email || '';
    const name = userRow?.profile?.name || '';

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [role, setRole] = useState('member');

    useEffect(() => {
        if (!open) return;
        setBusy(false);
        setError('');
        setInfo('');
        setRole(userRow?.role || 'member');
    }, [open, userRow?.role]);

    const saveUser = async () => {
        if (!tenantId || !userId) return;

        setBusy(true);
        setError('');
        setInfo('');
        setGlobalError('');
        try {
            if (!email) throw new Error('User has no email on file.');
            if (!['owner', 'member'].includes(role)) throw new Error('Invalid role.');
            if (userRow?.role === 'owner' && role !== 'owner') throw new Error('Owner role cannot be changed here.');

            const res = await fetch(`/api/admin/tenants/${tenantId}/users`, {
                method: 'POST',
                headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    role,
                    send_magic_link: false
                })
            });

            const json = await readJsonResponse(res);
            if (!res.ok) {
                if (json?._raw) throw errorFromNonJson(res, json);
                throw new Error(json?.error || 'Failed to update tenant user.');
            }

            setInfo('Saved.');
            await onSaved?.();
        } catch (err) {
            setError(err?.message || 'Failed to update tenant user.');
        } finally {
            setBusy(false);
        }
    };

    const footer = (
        <>
            <button className="btn secondary" type="button" onClick={onClose} disabled={busy}>
                Close
            </button>
            <button className="btn primary" type="button" onClick={saveUser} disabled={busy || !userId}>
                {busy ? 'Saving…' : 'Save user'}
            </button>
        </>
    );

    return (
        <Modal
            open={open}
            title={name ? name : email ? email : 'User'}
            subtitle={email ? `Tenant role: ${userRow?.role || '—'} • ${email}` : `Tenant role: ${userRow?.role || '—'}`}
            onClose={() => (busy ? null : onClose())}
            footer={footer}
        >
            {error && <p className="platform-message error">{error}</p>}
            {info && <p className="platform-message info">{info}</p>}

            <div className="platform-card" style={{ marginTop: '0.75rem' }}>
                <h3 style={{ marginTop: 0 }}>Tenant user</h3>
                <p className="platform-subtitle">
                    Membership and tokens are configured on the tenant (use the tenant “Edit” button).
                </p>

                <label className="platform-subtitle">Role</label>
                <select value={role} onChange={e => setRole(e.target.value)} disabled={busy || userRow?.role === 'owner'}>
                    <option value="member">member</option>
                    <option value="owner">owner</option>
                </select>
                {userRow?.role === 'owner' ? (
                    <p className="platform-subtitle" style={{ marginTop: '0.75rem' }}>
                        Owner role is locked here.
                    </p>
                ) : null}

                <div className="platform-card-actions">
                    <button
                        className="btn ghost"
                        type="button"
                        onClick={async () => {
                            try {
                                await sendMagicLink({ email, userId });
                                setInfo('Magic link sent.');
                            } catch (err) {
                                setError(err?.message || 'Failed to send magic link.');
                            }
                        }}
                        disabled={!email || busy}
                    >
                        Send magic link
                    </button>
                </div>
            </div>
        </Modal>
    );
}

function TenantInlineActions({ tenant, monthStart, authHeader, onReload, setGlobalError, sendMagicLink }) {
    const [busy, setBusy] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('member');
    const [tokensTotal, setTokensTotal] = useState('10');

    const primary = tenant?.primary_user || tenant?.owner || (Array.isArray(tenant?.users) ? tenant.users[0] : null) || null;
    const tokenHolders = useMemo(() => {
        const users = Array.isArray(tenant?.users) ? tenant.users : [];
        const candidates = users.filter(u => u.role === 'owner');
        return candidates.length ? candidates : users;
    }, [tenant]);
    const [tokenHolderId, setTokenHolderId] = useState(primary?.user_id || '');

    useEffect(() => {
        setTokenHolderId(primary?.user_id || '');
        setTokensTotal(String(primary?.room_credits?.tokens_total ?? 10));
    }, [primary]);

    const addUser = async () => {
        setBusy(true);
        setGlobalError('');
        try {
            const email = parseEmail(inviteEmail);
            if (!email) throw new Error('Enter a valid email.');

            const res = await fetch(`/api/admin/tenants/${tenant.id}/users`, {
                method: 'POST',
                headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, role: inviteRole, send_magic_link: true })
            });
            const json = await readJsonResponse(res);
            if (!res.ok) {
                if (json?._raw) throw errorFromNonJson(res, json);
                throw new Error(json?.error || 'Failed to add user.');
            }

            setInviteEmail('');
            await onReload?.();
        } catch (err) {
            setGlobalError(err?.message || 'Failed to add user.');
        } finally {
            setBusy(false);
        }
    };

    const saveTokenPool = async () => {
        setBusy(true);
        setGlobalError('');
        try {
            if (!tokenHolderId) throw new Error('Select a token holder (owner).');
            const tokens = Math.max(0, Math.floor(Number(tokensTotal || 0)));
            const res = await fetch(`/api/admin/tenants/${tenant.id}/credits`, {
                method: 'POST',
                headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                body: JSON.stringify({ owner_id: tokenHolderId, period_start: monthStart, tokens_total: tokens })
            });
            const json = await readJsonResponse(res);
            if (!res.ok) {
                if (json?._raw) throw errorFromNonJson(res, json);
                throw new Error(json?.error || 'Failed to save token pool.');
            }
            await onReload?.();
        } catch (err) {
            setGlobalError(err?.message || 'Failed to save token pool.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="platform-grid" style={{ marginTop: '1.25rem' }}>
            <div className="platform-card span-6">
                <h3 style={{ marginTop: 0 }}>Add user</h3>
                <label className="platform-subtitle">Email</label>
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} disabled={busy} />
                <label className="platform-subtitle" style={{ marginTop: '0.75rem', display: 'block' }}>
                    Role
                </label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} disabled={busy}>
                    <option value="member">member</option>
                    <option value="owner">owner</option>
                </select>
                <div className="platform-card-actions">
                    <button className="btn primary" type="button" onClick={addUser} disabled={busy || !inviteEmail.trim()}>
                        {busy ? 'Working…' : 'Add + magic link'}
                    </button>
                </div>
            </div>

            <div className="platform-card span-6">
                <h3 style={{ marginTop: 0 }}>Token pool</h3>
                <p className="platform-subtitle">
                    Period start: <span className="platform-mono">{monthStart}</span>
                </p>
                <label className="platform-subtitle">Token holder</label>
                <select value={tokenHolderId} onChange={e => setTokenHolderId(e.target.value)} disabled={busy}>
                    <option value="">Select user…</option>
                    {tokenHolders.map(u => (
                        <option key={u.user_id} value={u.user_id}>
                            {(u.profile?.email || u.user_id) + (u.role ? ` (${u.role})` : '')}
                        </option>
                    ))}
                </select>
                <label className="platform-subtitle" style={{ marginTop: '0.75rem', display: 'block' }}>
                    Tokens total (this month)
                </label>
                <input value={tokensTotal} onChange={e => setTokensTotal(e.target.value)} disabled={busy} inputMode="numeric" />
                <div className="platform-card-actions">
                    <button className="btn primary" type="button" onClick={saveTokenPool} disabled={busy || !tokenHolderId}>
                        {busy ? 'Working…' : 'Save tokens'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function AdminTenantsPage() {
    const { supabase } = usePlatformSession();
    const [tenants, setTenants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [monthStart, setMonthStart] = useState(() => getMonthStart());
    const [query, setQuery] = useState('');

    const [createOpen, setCreateOpen] = useState(false);
    const [editTenantId, setEditTenantId] = useState(null);
    const [openTenantId, setOpenTenantId] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);

    const authHeader = async () => {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) throw new Error('No session token. Please sign in again.');
        return { Authorization: `Bearer ${token}` };
    };

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/admin/tenants', { headers: await authHeader() });
            const json = await readJsonResponse(res);
            if (!res.ok) throw new Error(json?.error || 'Failed to load tenants.');
            setTenants(Array.isArray(json?.tenants) ? json.tenants : []);
            if (typeof json?.month_start === 'string') setMonthStart(json.month_start);
        } catch (err) {
            setError(err?.message || 'Failed to load tenants.');
            setTenants([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filteredTenants = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return tenants;

        return tenants.filter(t => {
            const users = Array.isArray(t.users) ? t.users : [];
            const primaryEmail = t.primary_user?.profile?.email || '';
            const primaryName = t.primary_user?.profile?.name || '';
            const haystack = [
                t.name || '',
                t.id || '',
                primaryEmail,
                primaryName,
                ...users.map(u => u.profile?.email || ''),
                ...users.map(u => u.profile?.name || '')
            ]
                .join(' ')
                .toLowerCase();
            return haystack.includes(q);
        });
    }, [query, tenants]);

    const selectedTenant = useMemo(() => tenants.find(t => t.id === editTenantId) || null, [editTenantId, tenants]);

    const sendMagicLink = async ({ email, userId, next = '/platform/settings' }) => {
        setError('');
        const res = await fetch('/api/admin/magic-link', {
            method: 'POST',
            headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, user_id: userId, next })
        });
        const json = await readJsonResponse(res);
        if (!res.ok) {
            if (json?._raw) throw errorFromNonJson(res, json);
            throw new Error(json?.error || 'Failed to send magic link.');
        }
        return true;
    };

    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Tenants</h1>
                    <p className="platform-subtitle">Month start: {monthStart}</p>
                </div>
                <div className="platform-actions">
                    <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}>
                        Add tenant
                    </button>
                    <Link className="btn ghost" href="/platform/admin">
                        Back to admin
                    </Link>
                </div>
            </div>

            {error && <p className="platform-message error">{error}</p>}

            <div className="platform-card" style={{ display: 'grid', gap: '0.75rem' }}>
                <label className="platform-subtitle">Search</label>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by tenant, user, or email…" />
            </div>

            {loading ? (
                <p className="platform-subtitle" style={{ marginTop: '1rem' }}>
                    Loading…
                </p>
            ) : filteredTenants.length ? (
                <div style={{ marginTop: '1.25rem', display: 'grid', gap: '1.25rem' }}>
                    {filteredTenants.map(t => {
                        const users = Array.isArray(t.users) ? t.users : [];
                        const primary = t.primary_user || t.owner || users[0] || null;
                        const primaryProfile = primary?.profile || null;
                        const membership = t.membership || null;
                        const invoices = Array.isArray(t.invoices) ? t.invoices : [];

                        const tokenHolder = users.find(u => u.room_credits) || primary;
                        const credits = tokenHolder?.room_credits || null;
                        const tokensTotal = credits?.tokens_total || 0;
                        const tokensUsed = credits?.tokens_used || 0;
                        const tokensLeft = Math.max(0, tokensTotal - tokensUsed);

                        const isOpen = openTenantId === t.id;

                        return (
                            <section key={t.id} className="platform-card">
                                <button
                                    className="platform-accordion-trigger"
                                    type="button"
                                    onClick={() => setOpenTenantId(prev => (prev === t.id ? null : t.id))}
                                    aria-expanded={isOpen}
                                >
                                    <div style={{ display: 'grid', gap: '0.35rem', textAlign: 'left' }}>
                                        <div className="platform-kpi-row">
                                            <h2 style={{ margin: 0 }}>{t.name}</h2>
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                <span className="badge neutral">{t.id?.slice(0, 8)}</span>
                                                {membership?.status ? (
                                                    <span className={`badge ${membership.status === 'live' ? 'success' : 'pending'}`}>{membership.status}</span>
                                                ) : null}
                                            </div>
                                        </div>
                                        <p className="platform-subtitle" style={{ margin: 0 }}>
                                            Primary user: {primaryProfile ? `${primaryProfile.name || '—'} (${primaryProfile.email || '—'})` : '—'} •{' '}
                                            <span className="platform-mono">{primary?.role || '—'}</span>
                                        </p>
                                        <p className="platform-subtitle" style={{ margin: 0 }}>
                                            Tenant membership:{' '}
                                            {membership ? (
                                                <span className="platform-mono">
                                                    {membership.plan} • {formatNZD(membership.monthly_amount_cents)} / month
                                                </span>
                                            ) : (
                                                '—'
                                            )}{' '}
                                            • Tokens: <span className="platform-mono">{tokensLeft}</span> left ({tokensTotal} total)
                                            {tokenHolder?.profile?.email ? (
                                                <>
                                                    {' '}
                                                    <span className="platform-subtitle">
                                                        • holder: <span className="platform-mono">{tokenHolder.profile.email}</span>
                                                    </span>
                                                </>
                                            ) : null}
                                        </p>
                                    </div>
                                    <span className="platform-mono">{isOpen ? '−' : '+'}</span>
                                </button>

                                {isOpen ? (
                                    <>
                                        <div className="platform-card-actions" style={{ marginTop: '1rem' }}>
                                            <button className="btn secondary" type="button" onClick={() => setEditTenantId(t.id)}>
                                                Edit
                                            </button>
                                        </div>

                                        <div style={{ marginTop: '1rem' }}>
                                            <h3 style={{ margin: 0 }}>Tenant users</h3>
                                            <div className="platform-table-wrap" style={{ marginTop: '0.75rem' }}>
                                                <table className="platform-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Name</th>
                                                            <th>Email</th>
                                                            <th>Role</th>
                                                            <th>User</th>
                                                            <th>Magic link</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {users.length ? (
                                                            users.map(u => (
                                                                <tr key={`${u.tenant_id}:${u.user_id}`}>
                                                                    <td>
                                                                        <button
                                                                            className="btn ghost"
                                                                            type="button"
                                                                            onClick={() => setSelectedUser({ tenantId: t.id, userRow: u })}
                                                                        >
                                                                            {u.profile?.name || '—'}
                                                                        </button>
                                                                    </td>
                                                                    <td className="platform-mono">{u.profile?.email || '—'}</td>
                                                                    <td className="platform-mono">{u.role}</td>
                                                                    <td>
                                                                        <button
                                                                            className="btn ghost"
                                                                            type="button"
                                                                            onClick={() => setSelectedUser({ tenantId: t.id, userRow: u })}
                                                                        >
                                                                            View
                                                                        </button>
                                                                    </td>
                                                                    <td>
                                                                        <button
                                                                            className="btn ghost"
                                                                            type="button"
                                                                            onClick={async () => {
                                                                                try {
                                                                                    await sendMagicLink({ email: u.profile?.email, userId: u.user_id });
                                                                                } catch (err) {
                                                                                    setError(err?.message || 'Failed to send magic link.');
                                                                                }
                                                                            }}
                                                                            disabled={!u.profile?.email}
                                                                        >
                                                                            Send
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            ))
                                                        ) : (
                                                            <tr>
                                                                <td colSpan={5} className="platform-subtitle">
                                                                    No users.
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        <div style={{ marginTop: '1.25rem' }}>
                                            <h3 style={{ margin: 0 }}>Invoices</h3>
                                            <div className="platform-table-wrap" style={{ marginTop: '0.75rem' }}>
                                                <table className="platform-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Number</th>
                                                            <th>Amount</th>
                                                            <th>Status</th>
                                                            <th>Issued</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {invoices.length ? (
                                                            invoices.slice(0, 12).map(inv => (
                                                                <tr key={inv.id}>
                                                                    <td className="platform-mono">{inv.invoice_number || inv.id?.slice(0, 8)}</td>
                                                                    <td className="platform-mono">{formatNZD(inv.amount_cents)}</td>
                                                                    <td>
                                                                        <span className={`badge ${inv.status === 'paid' ? 'success' : 'pending'}`}>
                                                                            {inv.status || '—'}
                                                                        </span>
                                                                    </td>
                                                                    <td className="platform-mono">
                                                                        {inv.issued_on ? String(inv.issued_on) : new Date(inv.created_at).toLocaleDateString()}
                                                                    </td>
                                                                </tr>
                                                            ))
                                                        ) : (
                                                            <tr>
                                                                <td colSpan={4} className="platform-subtitle">
                                                                    No invoices.
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        <TenantDocumentsSection tenantId={t.id} authHeader={authHeader} />

                                        <TenantInlineActions
                                            tenant={t}
                                            monthStart={monthStart}
                                            authHeader={authHeader}
                                            onReload={load}
                                            setGlobalError={setError}
                                            sendMagicLink={sendMagicLink}
                                        />
                                    </>
                                ) : null}
                            </section>
                        );
                    })}
                </div>
            ) : (
                <div className="platform-empty">
                    <p className="platform-subtitle">No tenants match this search.</p>
                </div>
            )}

            <TenantWizardModal
                open={createOpen}
                monthStart={monthStart}
                authHeader={authHeader}
                onClose={() => setCreateOpen(false)}
                onCreated={async createdTenantId => {
                    await load();
                    if (createdTenantId) setOpenTenantId(createdTenantId);
                }}
                setGlobalError={setError}
            />

            <TenantEditModal
                open={Boolean(editTenantId)}
                tenant={selectedTenant}
                monthStart={monthStart}
                authHeader={authHeader}
                onClose={() => setEditTenantId(null)}
                onSaved={load}
                setGlobalError={setError}
            />

            <UserDetailsModal
                open={Boolean(selectedUser?.userRow)}
                tenantId={selectedUser?.tenantId || null}
                userRow={selectedUser?.userRow || null}
                authHeader={authHeader}
                onClose={() => setSelectedUser(null)}
                onSaved={load}
                setGlobalError={setError}
                sendMagicLink={sendMagicLink}
            />
        </main>
    );
}
