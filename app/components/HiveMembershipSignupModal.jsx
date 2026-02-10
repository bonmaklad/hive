'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import {
    HIVE_MEMBER_WEEKLY_EX_GST_CENTS,
    computeMonthlyFromWeeklyExGstCents,
    computeWeeklyInclGstCents
} from '@/lib/membershipPricing';

const PLAN_META = {
    member: {
        plan: 'member',
        label: 'Hive membership',
        title: 'Become a HIVE member',
        subtitle: 'We will create your tenant, add 10 starter room tokens, and start automatic Stripe billing.',
        requiresWorkspace: false,
        allowedUnitTypes: [],
        defaultWeeklyExGstCents: HIVE_MEMBER_WEEKLY_EX_GST_CENTS,
        workspaceLabel: 'Membership'
    },
    desk: {
        plan: 'desk',
        label: 'Assigned desk',
        title: 'Reserve an assigned desk',
        subtitle: 'Step 1: choose your desk. Step 2: enter business details and continue to payment.',
        requiresWorkspace: true,
        allowedUnitTypes: ['desk', 'desk_pod'],
        defaultWeeklyExGstCents: 5000,
        workspaceLabel: 'Desk'
    },
    office: {
        plan: 'office',
        label: 'Private office',
        title: 'Reserve a private office',
        subtitle: 'Step 1: choose your office. Step 2: enter business details and continue to payment.',
        requiresWorkspace: true,
        allowedUnitTypes: ['private_office', 'small_office', 'premium_office'],
        defaultWeeklyExGstCents: 12500,
        workspaceLabel: 'Office'
    }
};

function formatNZD(cents) {
    const value = Number(cents || 0) / 100;
    try {
        return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(value);
    } catch {
        return `$${value.toFixed(2)}`;
    }
}

function parseEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return '';
    return email;
}

function parseAdditionalMemberEmails(rows, ownerEmail) {
    const lines = (Array.isArray(rows) ? rows : [])
        .map(line => parseEmail(line))
        .filter(Boolean);
    const seen = new Set([parseEmail(ownerEmail)]);
    const out = [];
    for (const email of lines) {
        if (seen.has(email)) continue;
        seen.add(email);
        out.push(email);
    }
    return out;
}

function toUnitTypeLabel(value) {
    const v = typeof value === 'string' ? value.trim() : '';
    const map = {
        premium_office: 'Premium office',
        private_office: 'Private office',
        small_office: 'Small office',
        desk: 'Desk',
        desk_pod: 'Desk pod'
    };
    return map[v] || v || 'Workspace';
}

function toUnitCode(unit) {
    const building = typeof unit?.building === 'string' ? unit.building.trim() : '';
    const number = unit?.unit_number ?? '';
    if (!building || number === null || number === undefined || number === '') return 'Uncoded workspace';
    return `${building}.${number}`;
}

function sortByBuildingAndUnit(a, b) {
    const ab = String(a?.building || '').localeCompare(String(b?.building || ''));
    if (ab !== 0) return ab;
    const an = Number(a?.unit_number);
    const bn = Number(b?.unit_number);
    const aIsNum = Number.isFinite(an);
    const bIsNum = Number.isFinite(bn);
    if (aIsNum && bIsNum) return an - bn;
    return String(a?.unit_number || '').localeCompare(String(b?.unit_number || ''));
}

function WorkspaceImageModal({ unit, onClose }) {
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!unit) return;
        const onKeyDown = event => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose, unit]);

    useEffect(() => {
        setFailed(false);
    }, [unit?.id]);

    if (!unit) return null;

    const title = toUnitCode(unit);
    const imageUrl = typeof unit?.signed_image_url === 'string' && unit.signed_image_url
        ? unit.signed_image_url
        : (typeof unit?.image_url === 'string' ? unit.image_url : '');
    const showImage = Boolean(imageUrl) && !failed;

    return (
        <div
            className="platform-modal-overlay hive-member-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={`Workspace image: ${title}`}
            onMouseDown={event => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div className="platform-modal">
                <div className="platform-modal-header">
                    <div>
                        <h3 style={{ marginTop: 0, marginBottom: '0.35rem' }}>{title}</h3>
                        <p className="platform-subtitle" style={{ marginTop: 0 }}>
                            {toUnitTypeLabel(unit?.unit_type)}
                        </p>
                    </div>
                    <button className="btn ghost" type="button" onClick={onClose}>
                        Close
                    </button>
                </div>

                {showImage ? (
                    <div className="availability-image" aria-label={`Image for ${title}`}>
                        <Image
                            src={imageUrl}
                            alt={`${title} workspace`}
                            fill
                            sizes="(max-width: 900px) 92vw, 860px"
                            quality={70}
                            style={{ objectFit: 'cover' }}
                            onError={() => setFailed(true)}
                        />
                    </div>
                ) : (
                    <div className="availability-image-placeholder" aria-hidden="true">
                        <Image className="availability-placeholder-logo" src="/logo-square.png" alt="" width={120} height={120} />
                        <div className="availability-image-placeholder-inner">Image coming soon</div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function HiveMembershipSignupModal({ triggerLabel = 'Become a member', plan = 'member' }) {
    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState('details');

    const [tenantName, setTenantName] = useState('');
    const [email, setEmail] = useState('');
    const [contactName, setContactName] = useState('');
    const [phone, setPhone] = useState('');

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    const [units, setUnits] = useState([]);
    const [unitsLoading, setUnitsLoading] = useState(false);
    const [unitsError, setUnitsError] = useState('');
    const [selectedUnitId, setSelectedUnitId] = useState('');
    const [previewUnit, setPreviewUnit] = useState(null);

    const [additionalMemberRows, setAdditionalMemberRows] = useState([]);

    const meta = useMemo(() => PLAN_META[plan] || PLAN_META.member, [plan]);

    const selectedUnit = useMemo(() => {
        if (!meta.requiresWorkspace) return null;
        return units.find(unit => unit?.id === selectedUnitId) || null;
    }, [meta.requiresWorkspace, selectedUnitId, units]);

    const additionalMembersCount = useMemo(
        () => (meta.plan === 'office' ? additionalMemberRows.length : 0),
        [additionalMemberRows.length, meta.plan]
    );

    const additionalMemberEmails = useMemo(
        () => (meta.plan === 'office' ? parseAdditionalMemberEmails(additionalMemberRows, email) : []),
        [additionalMemberRows, email, meta.plan]
    );

    const additionalMembersWeeklyExGstCents = useMemo(
        () => (meta.plan === 'office' ? additionalMembersCount * HIVE_MEMBER_WEEKLY_EX_GST_CENTS : 0),
        [additionalMembersCount, meta.plan]
    );

    const weeklyExGstCents = useMemo(() => {
        let baseWeekly = 0;
        if (!meta.requiresWorkspace) {
            baseWeekly = meta.defaultWeeklyExGstCents;
        } else {
            const n = Number(selectedUnit?.display_price_cents);
            baseWeekly = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
        }
        return baseWeekly + additionalMembersWeeklyExGstCents;
    }, [additionalMembersWeeklyExGstCents, meta.defaultWeeklyExGstCents, meta.requiresWorkspace, selectedUnit?.display_price_cents]);

    const weeklyInclGstCents = useMemo(() => computeWeeklyInclGstCents(weeklyExGstCents), [weeklyExGstCents]);
    const monthlyAmountCents = useMemo(() => computeMonthlyFromWeeklyExGstCents(weeklyExGstCents), [weeklyExGstCents]);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    useEffect(() => {
        if (!open) {
            setPreviewUnit(null);
            return;
        }
        setError('');
        setInfo('');
        setStep(meta.requiresWorkspace ? 'workspace' : 'details');
    }, [meta.requiresWorkspace, open]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = event => {
            if (event.key === 'Escape' && !busy && !previewUnit) setOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [busy, open, previewUnit]);

    useEffect(() => {
        if (!open || !meta.requiresWorkspace) return;

        let cancelled = false;
        const loadUnits = async () => {
            setUnitsLoading(true);
            setUnitsError('');
            try {
                const res = await fetch('/api/availability', { cache: 'no-store' });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json?.error || 'Could not load workspace availability.');

                const allowed = new Set(meta.allowedUnitTypes);
                const filtered = (Array.isArray(json?.units) ? json.units : [])
                    .filter(unit => allowed.has(unit?.unit_type))
                    .sort(sortByBuildingAndUnit);

                if (cancelled) return;

                setUnits(filtered);
                setSelectedUnitId(current => {
                    if (current && filtered.some(unit => unit?.id === current)) return current;
                    return filtered[0]?.id || '';
                });
                if (!filtered.length) {
                    setUnitsError(`No available ${meta.workspaceLabel.toLowerCase()} options right now.`);
                }
            } catch (err) {
                if (cancelled) return;
                setUnits([]);
                setSelectedUnitId('');
                setUnitsError(err?.message || 'Could not load workspace availability.');
            } finally {
                if (!cancelled) setUnitsLoading(false);
            }
        };

        loadUnits();
        return () => {
            cancelled = true;
        };
    }, [meta.allowedUnitTypes, meta.requiresWorkspace, meta.workspaceLabel, open]);

    const goToDetails = () => {
        if (meta.requiresWorkspace && !selectedUnit?.id) {
            setError(`Please choose an available ${meta.workspaceLabel.toLowerCase()} first.`);
            return;
        }
        setError('');
        setStep('details');
    };

    const addAdditionalMemberRow = () => {
        setAdditionalMemberRows(current => [...current, '']);
    };

    const updateAdditionalMemberRow = (index, value) => {
        setAdditionalMemberRows(current => current.map((row, i) => (i === index ? value : row)));
    };

    const removeAdditionalMemberRow = index => {
        setAdditionalMemberRows(current => current.filter((_, i) => i !== index));
    };

    const onSubmit = async event => {
        event.preventDefault();
        if (busy) return;

        setBusy(true);
        setError('');
        setInfo('');

        try {
            const parsedEmail = parseEmail(email);
            if (!tenantName.trim()) throw new Error('Business name is required.');
            if (!parsedEmail) throw new Error('Please enter a valid email address.');
            if (meta.requiresWorkspace && !selectedUnit?.id) {
                throw new Error(`Please choose an available ${meta.workspaceLabel.toLowerCase()} first.`);
            }
            if (!weeklyExGstCents || !monthlyAmountCents) {
                throw new Error('Pricing could not be calculated for the selected option.');
            }
            if (meta.plan === 'office' && additionalMembersCount > 25) {
                throw new Error('Maximum 25 additional members per office signup.');
            }
            if (meta.plan === 'office' && additionalMemberEmails.length !== additionalMembersCount) {
                throw new Error('Enter a valid email address for each additional member.');
            }

            const res = await fetch('/api/membership/public-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenant_name: tenantName,
                    email: parsedEmail,
                    contact_name: contactName,
                    phone,
                    plan: meta.plan,
                    work_unit_id: selectedUnit?.id || null,
                    additional_members: meta.plan === 'office' ? additionalMemberEmails : []
                })
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Could not start membership setup.');

            const checkoutUrl = typeof json?.checkout_url === 'string' ? json.checkout_url : '';
            if (!checkoutUrl) throw new Error('Stripe checkout URL is missing.');

            setInfo('Account set up. Magic link sent. Redirecting to secure payment...');
            window.location.assign(checkoutUrl);
        } catch (err) {
            setError(err?.message || 'Could not start membership setup.');
        } finally {
            setBusy(false);
        }
    };

    const workspaceStep = (
        <>
            <p className="platform-subtitle">{meta.subtitle}</p>
            <div className="hive-member-workspace-picker">
                <p className="hive-member-workspace-heading">Choose your {meta.workspaceLabel.toLowerCase()}</p>
                {unitsLoading ? <p className="platform-subtitle">Loading available {meta.workspaceLabel.toLowerCase()} options...</p> : null}
                {unitsError ? <p className="platform-message error">{unitsError}</p> : null}
                {!unitsLoading && !unitsError && units.length ? (
                    <div className="hive-member-workspace-grid" role="radiogroup" aria-label={`Available ${meta.workspaceLabel.toLowerCase()} options`}>
                        {units.map(unit => {
                            const selected = unit?.id === selectedUnitId;
                            return (
                                <div key={unit?.id || `${unit?.building}.${unit?.unit_number}`} className={`hive-member-workspace-option ${selected ? 'is-selected' : ''}`}>
                                    <span className="hive-member-workspace-code">{toUnitCode(unit)}</span>
                                    <span className="hive-member-workspace-type">{toUnitTypeLabel(unit?.unit_type)}</span>
                                    <span className="hive-member-workspace-price">{formatNZD(unit?.display_price_cents)}/week + GST</span>
                                    <div className="hive-member-workspace-actions">
                                        <button
                                            type="button"
                                            className={`btn ${selected ? 'primary' : 'secondary'}`}
                                            onClick={() => setSelectedUnitId(unit.id)}
                                            aria-pressed={selected}
                                        >
                                            {selected ? 'Selected' : 'Choose'}
                                        </button>
                                        <button type="button" className="btn ghost" onClick={() => setPreviewUnit(unit)}>
                                            Show image
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : null}
            </div>

            {meta.plan === 'office' ? (
                <div className="hive-member-members">
                    <p className="hive-member-workspace-heading">Members</p>
                    <div className="hive-member-member-row is-primary">
                        <div>
                            <p className="hive-member-member-title">Primary membership</p>
                            <p className="hive-member-member-subtitle">Included in office base price</p>
                        </div>
                        <span className="badge success">Included</span>
                    </div>
                    {additionalMemberRows.map((memberEmail, index) => (
                        <div className="hive-member-member-row" key={`additional-member-${index}`}>
                            <label className="hive-member-member-input">
                                <span>Additional member {index + 1}</span>
                                <input
                                    type="email"
                                    value={memberEmail}
                                    onChange={event => updateAdditionalMemberRow(index, event.target.value)}
                                    placeholder="person@company.com"
                                    disabled={busy}
                                />
                            </label>
                            <button
                                type="button"
                                className="btn ghost"
                                onClick={() => removeAdditionalMemberRow(index)}
                                disabled={busy}
                                aria-label={`Remove additional member ${index + 1}`}
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                    <button
                        type="button"
                        className="btn ghost hive-member-add-member-btn"
                        onClick={addAdditionalMemberRow}
                        disabled={busy}
                    >
                        <span className="hive-member-add-icon" aria-hidden="true">
                            +
                        </span>
                        <span>Add member</span>
                    </button>
                </div>
            ) : null}

            <div className="hive-member-pricing-summary" aria-live="polite">
                <p>
                    Weekly rate: <strong>{formatNZD(weeklyExGstCents)}</strong> + GST ({formatNZD(weeklyInclGstCents)} incl GST)
                </p>
                {meta.plan === 'office' ? (
                    <p>
                        Additional members: <strong>{additionalMembersCount}</strong>{' '}
                        {additionalMembersCount
                            ? `(${formatNZD(additionalMembersWeeklyExGstCents)} + GST per week total)`
                            : ''}
                    </p>
                ) : null}
                <p>
                    Monthly charge: <strong>{formatNZD(monthlyAmountCents)}</strong> including GST
                </p>
            </div>

            {error ? <p className="platform-message error">{error}</p> : null}

            <div className="platform-card-actions">
                <button
                    className="btn primary"
                    type="button"
                    onClick={goToDetails}
                    disabled={!selectedUnitId || unitsLoading || Boolean(unitsError) || busy}
                >
                    Continue
                </button>
            </div>
        </>
    );

    const detailsStep = (
        <form className="contact-form hive-member-modal-form" onSubmit={onSubmit}>
            <label>
                Business name
                <input
                    type="text"
                    value={tenantName}
                    onChange={event => setTenantName(event.target.value)}
                    placeholder="Your business / tenant name"
                    required
                    disabled={busy}
                />
            </label>

            <label>
                Business email
                <input
                    type="email"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    placeholder="you@business.com"
                    required
                    disabled={busy}
                />
            </label>

            <label>
                Contact person (optional)
                <input
                    type="text"
                    value={contactName}
                    onChange={event => setContactName(event.target.value)}
                    placeholder="Name"
                    disabled={busy}
                />
            </label>

            <label>
                Phone (optional)
                <input
                    type="tel"
                    value={phone}
                    onChange={event => setPhone(event.target.value)}
                    placeholder="+64 ..."
                    disabled={busy}
                />
            </label>

            {error ? <p className="platform-message error">{error}</p> : null}
            {info ? <p className="platform-message info">{info}</p> : null}

            <div className="platform-card-actions">
                {meta.requiresWorkspace ? (
                    <button className="btn secondary" type="button" onClick={() => setStep('workspace')} disabled={busy}>
                        Back
                    </button>
                ) : null}
                <button className="btn primary" type="submit" disabled={busy || (meta.requiresWorkspace && !selectedUnitId)}>
                    {busy ? 'Starting checkout...' : 'Continue to secure payment'}
                </button>
            </div>
        </form>
    );

    const modal = open ? (
        <div className="platform-modal-overlay hive-member-modal-overlay" role="presentation" onMouseDown={() => (!busy ? setOpen(false) : null)}>
            <div
                className="platform-modal hive-member-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`${meta.label} signup`}
                onMouseDown={event => event.stopPropagation()}
            >
                <div className="platform-modal-header">
                    <h2 style={{ margin: 0 }}>{meta.title}</h2>
                    <button className="btn ghost" type="button" onClick={() => setOpen(false)} disabled={busy}>
                        Close
                    </button>
                </div>

                {meta.requiresWorkspace ? (
                    <p className="hive-member-step-indicator">Step {step === 'workspace' ? '1' : '2'} of 2</p>
                ) : null}

                {step === 'workspace' ? workspaceStep : detailsStep}
            </div>
        </div>
    ) : null;

    return (
        <>
            <button className="btn secondary" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog">
                {triggerLabel}
            </button>
            {mounted && modal ? createPortal(modal, document.body) : null}
            {mounted && previewUnit ? createPortal(<WorkspaceImageModal unit={previewUnit} onClose={() => setPreviewUnit(null)} />, document.body) : null}
        </>
    );
}
