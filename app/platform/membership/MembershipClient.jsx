'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlatformSession } from '../PlatformContext';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';

const PLANS = [
    { id: 'member', label: 'Member', monthlyCents: 9900 },
    { id: 'desk', label: 'Desk', monthlyCents: 24900 },
    { id: 'pod', label: 'Pod', monthlyCents: 34900 },
    { id: 'office', label: 'Office', monthlyCents: 65000 },
    { id: 'premium', label: 'Premium', monthlyCents: 69900 }
];

const OFFICES = [
    { id: 'office-a', label: 'Office A (2 desks)', monthlyCents: 69900 },
    { id: 'office-b', label: 'Office B (4 desks)', monthlyCents: 109900 },
    { id: 'office-c', label: 'Office C (6 desks)', monthlyCents: 149900 }
];

const FRIDGE_MONTHLY_CENTS = 2500;

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

function parseDateOnly(value) {
    if (!value) return null;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    const raw = String(value);
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]) - 1;
        const day = Number(match[3]);
        const date = new Date(year, month, day);
        if (Number.isNaN(date.getTime())) return null;
        return date;
    }
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
}

function computeNextMonthlyDate(createdAt) {
    const anchor = new Date(createdAt);
    if (Number.isNaN(anchor.getTime())) return null;

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const anchorDay = anchor.getDate();

    const year = todayStart.getFullYear();
    const month = todayStart.getMonth();
    const dayThisMonth = Math.min(anchorDay, daysInMonth(year, month));
    let candidate = new Date(year, month, dayThisMonth);

    if (candidate < todayStart) {
        const nextMonth = new Date(year, month + 1, 1);
        const dayNextMonth = Math.min(anchorDay, daysInMonth(nextMonth.getFullYear(), nextMonth.getMonth()));
        candidate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), dayNextMonth);
    }

    return candidate;
}

function computeNextInvoiceDateFromDay(dayOfMonth, referenceDate, { strictAfter = false } = {}) {
    const raw = Number.isFinite(dayOfMonth) ? dayOfMonth : Number(dayOfMonth);
    if (!Number.isFinite(raw)) return null;
    const safeDay = Math.min(31, Math.max(1, Math.floor(raw)));

    const ref = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime()) ? referenceDate : new Date();
    const refStart = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    const year = refStart.getFullYear();
    const month = refStart.getMonth();

    const dimThisMonth = new Date(year, month + 1, 0).getDate();
    let candidate = new Date(year, month, Math.min(safeDay, dimThisMonth));

    if (candidate < refStart || (strictAfter && candidate <= refStart)) {
        const nextMonth = new Date(year, month + 1, 1);
        const dimNextMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
        candidate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(safeDay, dimNextMonth));
    }

    return candidate;
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

function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', busy, onClose, onConfirm }) {
    useEffect(() => {
        if (!open) return;
        const onKeyDown = event => {
            if (event.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose, open]);

    if (!open) return null;

    return (
        <div className="platform-modal-overlay" role="presentation" onMouseDown={onClose}>
            <div
                className="platform-modal"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onMouseDown={event => event.stopPropagation()}
            >
                <div className="platform-modal-header">
                    <h2 style={{ margin: 0 }}>{title}</h2>
                    <button className="btn ghost" type="button" onClick={onClose} disabled={busy}>
                        Close
                    </button>
                </div>
                <div style={{ marginTop: '1rem' }}>
                    <p className="platform-subtitle" style={{ marginTop: 0 }}>
                        {message}
                    </p>
                    <div className="platform-card-actions" style={{ marginTop: '1rem' }}>
                        <button className="btn secondary" type="button" onClick={onClose} disabled={busy}>
                            Cancel
                        </button>
                        <button className="btn primary" type="button" onClick={onConfirm} disabled={busy}>
                            {busy ? 'Working…' : confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
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
    const [paymentTerms, setPaymentTerms] = useState('invoice');
    const [paymentTermsDraft, setPaymentTermsDraft] = useState('invoice');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [setupBusy, setSetupBusy] = useState(false);
    const [checkoutClientSecret, setCheckoutClientSecret] = useState('');
    const [checkoutError, setCheckoutError] = useState('');
    const [checkoutSessionId, setCheckoutSessionId] = useState('');
    const [setupIntervalId, setSetupIntervalId] = useState(null);

    const [units, setUnits] = useState([]);
    const [unitsLoading, setUnitsLoading] = useState(false);
    const [unitsError, setUnitsError] = useState('');
    const [selectedUnitCode, setSelectedUnitCode] = useState('');

    const [docs, setDocs] = useState([]);
    const [docsLoading, setDocsLoading] = useState(false);
    const [docsError, setDocsError] = useState('');
    const [invoiceOpenError, setInvoiceOpenError] = useState('');
    const [portalBusy, setPortalBusy] = useState(false);
    const [portalError, setPortalError] = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmTitle, setConfirmTitle] = useState('');
    const [confirmMessage, setConfirmMessage] = useState('');
    const [confirmLabel, setConfirmLabel] = useState('Confirm');
    const confirmActionRef = useRef(null);

    const plan = useMemo(() => PLANS.find(p => p.id === planId) || PLANS[0], [planId]);
    const office = useMemo(() => OFFICES.find(o => o.id === officeId) || OFFICES[0], [officeId]);

    // When the plan is "custom", base is supplied by backend via membership.monthly_amount_cents
    const baseMonthlyCents = planId === 'office'
        ? office.monthlyCents
        : planId === 'custom'
            ? (membership?.monthly_amount_cents ?? 0)
            : plan.monthlyCents;
    const donationCents = toCentsOrZero(donationText);
    const fridgeMonthlyCents = fridge ? FRIDGE_MONTHLY_CENTS : 0;
    const computedMonthlyCents = baseMonthlyCents + donationCents + fridgeMonthlyCents;
    // Always show the backend's current membership price when present, even if it's 0.
    // Fall back to computed estimate only when monthly_amount_cents is undefined/null.
    const hasMembershipAmount =
        membership && typeof membership.monthly_amount_cents === 'number' && Number.isFinite(membership.monthly_amount_cents);
    const displayMonthlyCents = hasMembershipAmount ? membership.monthly_amount_cents : computedMonthlyCents;
    const hasStripeSubscription = Boolean(typeof membership?.stripe_subscription_id === 'string' && membership.stripe_subscription_id.trim());
    const autoPaymentsEnabled = paymentTerms === 'auto_card' && hasStripeSubscription;
    const paidTillDate = useMemo(() => parseDateOnly(membership?.paid_till), [membership?.paid_till]);

    const nextInvoiceDisplay = useMemo(() => {
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const paidTill = parseDateOnly(membership?.paid_till);
        const prepaidActive = paymentTerms === 'advanced' && paidTill && paidTill >= todayStart;
        const reference = prepaidActive ? paidTill : todayStart;

        const invoiceDay = Number(membership?.next_invoice_at);
        if (Number.isFinite(invoiceDay) && invoiceDay >= 1 && invoiceDay <= 31) {
            return computeNextInvoiceDateFromDay(invoiceDay, reference, { strictAfter: prepaidActive });
        }
        if (membership?.created_at) {
            return computeNextInvoiceDateFromDay(new Date(membership.created_at).getDate(), reference, { strictAfter: prepaidActive });
        }
        return null;
    }, [membership?.created_at, membership?.next_invoice_at, membership?.paid_till, paymentTerms]);

    const stripePromise = useMemo(() => {
        const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
        if (!key) return null;
        return loadStripe(key);
    }, []);

    const reloadMembership = async () => {
        const { data: membershipRow, error: membershipError } = await supabase
            .from('memberships')
            .select('*')
            .eq('owner_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (membershipError) throw new Error(membershipError.message);
        setMembership(membershipRow ?? null);
        if (membershipRow) {
            setStatus(membershipRow.status || 'live');
            setPlanId(membershipRow.plan || 'premium');
            setOfficeId(membershipRow.office_id || 'office-a');
            setDonationText(membershipRow.donation_cents ? String(membershipRow.donation_cents / 100) : '');
            setFridge(Boolean(membershipRow.fridge_enabled));
            const terms = membershipRow.payment_terms || 'invoice';
            setPaymentTerms(terms);
            setPaymentTermsDraft(terms === 'advanced' ? 'invoice' : terms);
        }
        return membershipRow ?? null;
    };

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
                    const terms = membershipRow.payment_terms || 'invoice';
                    setPaymentTerms(terms);
                    setPaymentTermsDraft(terms === 'advanced' ? 'invoice' : terms);
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

    const openInvoice = async inv => {
        setInvoiceOpenError('');
        try {
            const { data } = await supabase.auth.getSession();
            const token = data?.session?.access_token || '';
            if (!token) throw new Error('Please sign in again.');

            const res = await fetch(`/api/invoices/url?invoice_id=${encodeURIComponent(inv.id)}`, {
                headers: {
                    accept: 'application/json',
                    authorization: `Bearer ${token}`
                }
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.hint || json?.detail || json?.error || 'Failed to load invoice URL.');

            const url = typeof json?.url === 'string' ? json.url : '';
            if (!url) throw new Error('Invoice URL missing.');
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (e) {
            setInvoiceOpenError(e?.message || 'Failed to open invoice.');
        }
    };

    const openBillingPortal = async () => {
        setPortalBusy(true);
        setPortalError('');
        try {
            const { data } = await supabase.auth.getSession();
            const token = data?.session?.access_token || '';
            if (!token) throw new Error('Please sign in again.');

            const res = await fetch('/api/membership/portal', {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                    authorization: `Bearer ${token}`
                }
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.hint || json?.detail || json?.error || 'Failed to open billing portal.');

            const url = typeof json?.url === 'string' ? json.url : '';
            if (!url) throw new Error('Stripe portal URL missing.');
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (e) {
            setPortalError(e?.message || 'Failed to open billing portal.');
        } finally {
            setPortalBusy(false);
        }
    };

    const openConfirm = ({ title, message, label, onConfirm }) => {
        confirmActionRef.current = onConfirm;
        setConfirmTitle(title || 'Confirm');
        setConfirmMessage(message || '');
        setConfirmLabel(label || 'Confirm');
        setConfirmOpen(true);
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

    const savePaymentTerms = async nextTerms => {
        setBusy(true);
        setError('');
        setInfo('');
        try {
            const { data } = await supabase.auth.getSession();
            const token = data?.session?.access_token || '';
            if (!token) throw new Error('Please sign in again.');

            const res = await fetch('/api/membership/payment-terms', {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                    'content-type': 'application/json',
                    authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ payment_terms: nextTerms })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to update payment terms.');

            setMembership(json?.membership || membership);
            setPaymentTerms(json?.membership?.payment_terms || nextTerms);
            setPaymentTermsDraft(json?.membership?.payment_terms || nextTerms);
            setInfo(nextTerms === 'auto_card' ? 'Saved. Automatic payments require a card on file.' : 'Saved.');
        } catch (e) {
            setError(e?.message || 'Failed to update payment terms.');
        } finally {
            setBusy(false);
        }
    };

    const beginAutoCardSetup = async () => {
        setSetupBusy(true);
        setCheckoutError('');
        setCheckoutClientSecret('');
        setCheckoutSessionId('');
        setInfo('');
        try {
            const { data } = await supabase.auth.getSession();
            const token = data?.session?.access_token || '';
            if (!token) throw new Error('Please sign in again.');

            const res = await fetch('/api/membership/subscribe', {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                    authorization: `Bearer ${token}`
                }
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.detail || json?.error || 'Failed to start subscription setup.');

            const clientSecret = typeof json?.stripe_checkout_client_secret === 'string' ? json.stripe_checkout_client_secret : '';
            const sessionId = typeof json?.stripe_checkout_session_id === 'string' ? json.stripe_checkout_session_id : '';
            if (!clientSecret) throw new Error('Stripe client secret missing.');
            if (!stripePromise) throw new Error('Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.');

            setCheckoutClientSecret(clientSecret);
            setCheckoutSessionId(sessionId);
            setInfo('Enter your card to enable automatic monthly payments.');
        } catch (e) {
            setCheckoutError(e?.message || 'Failed to start subscription setup.');
        } finally {
            setSetupBusy(false);
        }
    };

    const confirmAutoCardSubscription = async sessionId => {
        const sid = typeof sessionId === 'string' ? sessionId : '';
        if (!sid) return null;

        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token || '';
        if (!token) throw new Error('Please sign in again.');

        const res = await fetch('/api/membership/subscribe/confirm', {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ stripe_checkout_session_id: sid })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || 'Failed to confirm subscription.');
        return json?.membership || null;
    };

    const savePaymentTermsSelection = async () => {
        if (busy || setupBusy) return;
        setError('');
        setInfo('');
        setCheckoutError('');

        if (paymentTermsDraft === paymentTerms) {
            // Allow re-running setup if auto_card is selected but we don't have a subscription id yet.
            if (!(paymentTermsDraft === 'auto_card' && !hasStripeSubscription)) {
                setInfo('No changes to save.');
                return;
            }
        }

        if (paymentTermsDraft === 'invoice') {
            if (paymentTerms === 'auto_card') {
                openConfirm({
                    title: 'Switch to invoice terms?',
                    message: 'This will cancel your current automatic subscription immediately and switch your payment terms to invoice.',
                    label: 'Switch & cancel subscription',
                    onConfirm: async () => {
                        setConfirmOpen(false);
                        setBusy(true);
                        setError('');
                        setInfo('');
                        try {
                            const { data } = await supabase.auth.getSession();
                            const token = data?.session?.access_token || '';
                            if (!token) throw new Error('Please sign in again.');

                            const res = await fetch('/api/membership/cancel-subscription', {
                                method: 'POST',
                                headers: {
                                    accept: 'application/json',
                                    authorization: `Bearer ${token}`
                                }
                            });
                            const json = await res.json().catch(() => ({}));
                            if (!res.ok) throw new Error(json?.error || 'Failed to cancel subscription.');
                            setMembership(json?.membership || membership);
                            setPaymentTerms('invoice');
                            setPaymentTermsDraft('invoice');
                            setInfo('Switched to invoice terms.');
                        } catch (e) {
                            setError(e?.message || 'Failed to cancel subscription.');
                            setPaymentTermsDraft('auto_card');
                        } finally {
                            setBusy(false);
                        }
                    }
                });
            } else {
                await savePaymentTerms('invoice');
            }
            setCheckoutClientSecret('');
            setCheckoutError('');
            return;
        }

        await beginAutoCardSetup();
    };

    const cancelAutoCardSubscription = async () => {
        if (portalBusy || busy || setupBusy) return;
        openConfirm({
            title: 'Cancel subscription?',
            message: 'This will cancel your automatic card subscription immediately. Your payment terms will switch back to invoice.',
            label: 'Cancel subscription',
            onConfirm: async () => {
                setConfirmOpen(false);
                setBusy(true);
                setError('');
                setInfo('');
                try {
                    const { data } = await supabase.auth.getSession();
                    const token = data?.session?.access_token || '';
                    if (!token) throw new Error('Please sign in again.');

                    const res = await fetch('/api/membership/cancel-subscription', {
                        method: 'POST',
                        headers: {
                            accept: 'application/json',
                            authorization: `Bearer ${token}`
                        }
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(json?.error || 'Failed to cancel subscription.');
                    setMembership(json?.membership || membership);
                    setPaymentTerms('invoice');
                    setPaymentTermsDraft('invoice');
                    setInfo('Subscription cancelled. Payment terms set to invoice.');
                } catch (e) {
                    setError(e?.message || 'Failed to cancel subscription.');
                } finally {
                    setBusy(false);
                }
            }
        });
    };

    useEffect(() => {
        return () => {
            if (setupIntervalId) clearInterval(setupIntervalId);
        };
    }, [setupIntervalId]);

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
            <ConfirmModal
                open={confirmOpen}
                title={confirmTitle}
                message={confirmMessage}
                confirmLabel={confirmLabel}
                busy={busy}
                onClose={() => (busy ? null : setConfirmOpen(false))}
                onConfirm={() => confirmActionRef.current?.()}
            />
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
                        {paymentTerms === 'advanced' && paidTillDate ? (
                            <p className="platform-subtitle">Paid until: {formatDate(paidTillDate)}</p>
                        ) : null}
                        <p className="platform-subtitle">
                            Next invoice{paymentTerms === 'advanced' && paidTillDate ? ' (after prepaid period)' : ''}: {formatDate(nextInvoiceDisplay)}
                        </p>
                        <div style={{ marginTop: '0.75rem' }}>
                            <label className="platform-subtitle">Payment terms</label>
                            <select
                                value={paymentTermsDraft}
                                disabled={busy || loading || setupBusy || paymentTerms === 'advanced'}
                                onChange={e => {
                                    setPaymentTermsDraft(e.target.value);
                                    setCheckoutClientSecret('');
                                    setCheckoutError('');
                                }}
                            >
                                <option value="invoice">Invoice</option>
                                <option value="auto_card">Automatic card payment</option>
                            </select>
                            {paymentTerms === 'advanced' ? (
                                <p className="platform-subtitle">
                                    You’re on a prepaid invoice schedule. Contact HIVE support to change payment terms.
                                </p>
                            ) : null}

                            <div className="platform-card-actions" style={{ marginTop: '0.75rem' }}>
                                <button
                                    className="btn primary"
                                    type="button"
                                    onClick={savePaymentTermsSelection}
                                    disabled={paymentTerms === 'advanced' || busy || loading || setupBusy || (paymentTermsDraft === 'auto_card' && autoPaymentsEnabled)}
                                >
                                    {setupBusy || busy
                                        ? 'Saving…'
                                        : paymentTermsDraft === 'auto_card'
                                          ? autoPaymentsEnabled
                                                ? 'Automatic payments enabled'
                                                : 'Set up automatic payments'
                                          : 'Save'}
                                </button>

                                {paymentTerms === 'auto_card' ? (
                                    <>
                                        <button className="btn ghost" type="button" onClick={openBillingPortal} disabled={portalBusy}>
                                            {portalBusy ? 'Opening…' : 'Manage billing'}
                                        </button>
                                        {/* <button
                                            className="btn secondary"
                                            type="button"
                                            onClick={cancelAutoCardSubscription}
                                            disabled={portalBusy || busy || setupBusy}
                                            title="Cancel your subscription"
                                        >
                                            Cancel subscription
                                        </button> */}
                                    </>
                                ) : null}
                            </div>

                            {paymentTermsDraft === 'auto_card' && checkoutClientSecret ? (
                                <div className="platform-card" style={{ marginTop: '0.75rem' }}>
                                    {checkoutError ? <p className="platform-message error">{checkoutError}</p> : null}
                                    {!stripePromise ? (
                                        <p className="platform-message error">Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.</p>
                                    ) : (
                                        <EmbeddedCheckoutProvider
                                            stripe={stripePromise}
                                            options={{
                                                clientSecret: checkoutClientSecret,
                                                onComplete: () => {
                                                    setInfo('Subscription created. Syncing membership…');
                                                    setCheckoutClientSecret('');
                                                    const sessionId = checkoutSessionId;
                                                    setCheckoutSessionId('');

                                                    (async () => {
                                                        try {
                                                            if (sessionId) {
                                                                const updated = await confirmAutoCardSubscription(sessionId);
                                                                if (updated) {
                                                                    setMembership(updated);
                                                                    setPaymentTerms(updated.payment_terms || 'auto_card');
                                                                    setPaymentTermsDraft(updated.payment_terms || 'auto_card');
                                                                    setInfo('Automatic payments enabled.');
                                                                    return;
                                                                }
                                                            }
                                                        } catch (e) {
                                                            setCheckoutError(e?.message || 'Failed to confirm subscription.');
                                                        }

                                                        // Fallback: poll DB for webhook updates.
                                                        let tries = 0;
                                                        if (setupIntervalId) clearInterval(setupIntervalId);
                                                        const interval = setInterval(async () => {
                                                            tries += 1;
                                                            try {
                                                                const row = await reloadMembership();
                                                                if (row?.payment_terms === 'auto_card' && row?.stripe_subscription_id) {
                                                                    clearInterval(interval);
                                                                    setSetupIntervalId(null);
                                                                    setInfo('Automatic payments enabled.');
                                                                    return;
                                                                }
                                                            } catch {
                                                                // ignore
                                                            }
                                                            if (tries >= 10) {
                                                                clearInterval(interval);
                                                                setSetupIntervalId(null);
                                                            }
                                                        }, 1500);
                                                        setSetupIntervalId(interval);
                                                    })();
                                                }
                                            }}
                                        >
                                            <div style={{ minHeight: '560px' }}>
                                                <EmbeddedCheckout />
                                            </div>
                                        </EmbeddedCheckoutProvider>
                                    )}
                                </div>
                            ) : null}

                            {paymentTermsDraft === 'auto_card' && checkoutError && !checkoutClientSecret ? (
                                <p className="platform-message error" style={{ marginTop: '0.75rem' }}>
                                    {checkoutError}
                                </p>
                            ) : null}

                            {portalError ? <p className="platform-message error">{portalError}</p> : null}
                        </div>
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

                     <div style={{ display: 'grid', gap: '0.75rem' }}>
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
                                const isFull = Boolean(u?.is_full ?? u?.is_occupied);
                                return u.unit_type === targetType && (!isFull);
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
                                                const isFull = Boolean(u?.is_full ?? u?.is_occupied);
                                                const disabled = (isFull && !u.mine);
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
                                                        <td>
                                                            {u.mine
                                                                ? <span className="badge success">yours</span>
                                                                : isFull
                                                                    ? <span className="badge pending">full</span>
                                                                    : <span className="badge neutral">available</span>}
                                                        </td>
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
                            Mini Fridge<span className="platform-subtitle">({formatNZD(FRIDGE_MONTHLY_CENTS)} / month)</span>
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
                {invoiceOpenError ? <p className="platform-message error">{invoiceOpenError}</p> : null}

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
                                        <td className="platform-mono">
                                            {inv.invoice_number?.startsWith?.('stripe:') || inv.invoice_number?.startsWith?.('stripe_session:') ? (
                                                <button className="btn ghost" type="button" onClick={() => openInvoice(inv)}>
                                                    {inv.invoice_number}
                                                </button>
                                            ) : (
                                                inv.invoice_number || inv.id.slice(0, 8).toUpperCase()
                                            )}
                                        </td>
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
