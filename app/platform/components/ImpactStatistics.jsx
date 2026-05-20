'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlatformSession } from '../PlatformContext';

const todayISO = () => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
};

const initialSupportForm = { amount: '', occurred_on: todayISO(), support_type: 'hired_member' };

function cleanMoney(value) {
    return String(value || '').replace(/[$,\s]/g, '');
}

function formatNZDFromAmount(value) {
    const numeric = Number(cleanMoney(value));
    if (!Number.isFinite(numeric)) return '$0';
    try {
        return new Intl.NumberFormat('en-NZ', {
            style: 'currency',
            currency: 'NZD',
            maximumFractionDigits: 0
        }).format(numeric);
    } catch {
        return `$${numeric}`;
    }
}

function formatNZDFromCents(cents) {
    return formatNZDFromAmount(Number(cents || 0) / 100);
}

function centsToInput(cents) {
    const numeric = Number(cents || 0);
    if (!Number.isFinite(numeric) || numeric <= 0) return '';
    const dollars = numeric / 100;
    return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

function getAmountError(amount, { allowZero = false } = {}) {
    const numeric = Number(cleanMoney(amount));
    if (!Number.isFinite(numeric)) return 'Enter a valid amount.';
    if (allowZero ? numeric < 0 : numeric <= 0) return allowZero ? 'Enter zero or more.' : 'Enter an amount greater than zero.';
    return '';
}

function supportTypeLabel(value) {
    return value === 'helped_member' ? 'Helped a member' : 'Hired a member';
}

export default function ImpactStatistics() {
    const { profile, tenantRole, supabase } = usePlatformSession();
    const canSeeExternalByRole = Boolean(profile?.is_admin || tenantRole === 'owner' || tenantRole === 'admin');
    const canSeeSupportByRole = Boolean(profile?.is_admin || tenantRole === 'owner');
    const shouldLoad = canSeeExternalByRole || canSeeSupportByRole;

    const [loading, setLoading] = useState(true);
    const [canManageExternalRevenue, setCanManageExternalRevenue] = useState(canSeeExternalByRole);
    const [canManageSupportEvents, setCanManageSupportEvents] = useState(canSeeSupportByRole);
    const [externalAmount, setExternalAmount] = useState('');
    const [savedExternalCents, setSavedExternalCents] = useState(0);
    const [supportForm, setSupportForm] = useState(initialSupportForm);
    const [events, setEvents] = useState([]);
    const [busyKey, setBusyKey] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const externalPreview = useMemo(() => formatNZDFromAmount(externalAmount), [externalAmount]);
    const supportPreview = useMemo(() => formatNZDFromAmount(supportForm.amount), [supportForm.amount]);

    const authHeader = useCallback(async () => {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) throw new Error('No session token. Please sign in again.');
        return { Authorization: `Bearer ${token}` };
    }, [supabase]);

    const loadImpact = useCallback(async () => {
        if (!shouldLoad) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/impact-statistics', { headers: await authHeader() });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to load impact statistics.');

            const externalCents = Number(json?.external_revenue?.amount_cents || 0);
            setCanManageExternalRevenue(Boolean(json?.can_manage_external_revenue));
            setCanManageSupportEvents(Boolean(json?.can_manage_support_events));
            setSavedExternalCents(externalCents);
            setExternalAmount(centsToInput(externalCents));
            setEvents(Array.isArray(json?.support_events) ? json.support_events.map(eventToFormRow) : []);
        } catch (err) {
            setError(err?.message || 'Failed to load impact statistics.');
        } finally {
            setLoading(false);
        }
    }, [authHeader, shouldLoad]);

    useEffect(() => {
        loadImpact();
    }, [loadImpact]);

    const saveExternalRevenue = useCallback(
        async event => {
            event.preventDefault();
            const amountError = getAmountError(externalAmount || '0', { allowZero: true });
            setMessage('');
            setError('');
            if (amountError) {
                setError(amountError);
                return;
            }

            setBusyKey('external');
            try {
                const res = await fetch('/api/impact-statistics', {
                    method: 'PATCH',
                    headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ section: 'external_revenue', amount: externalAmount || '0' })
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json?.error || 'Failed to save external revenue.');

                const cents = Number(json?.external_revenue?.amount_cents || 0);
                setSavedExternalCents(cents);
                setExternalAmount(centsToInput(cents));
                setMessage('External revenue figure saved.');
            } catch (err) {
                setError(err?.message || 'Failed to save external revenue.');
            } finally {
                setBusyKey('');
            }
        },
        [authHeader, externalAmount]
    );

    const addSupportEvent = useCallback(
        async event => {
            event.preventDefault();
            const amountError = getAmountError(supportForm.amount);
            setMessage('');
            setError('');
            if (amountError) {
                setError(amountError);
                return;
            }

            setBusyKey('add-event');
            try {
                const res = await fetch('/api/impact-statistics', {
                    method: 'POST',
                    headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        support_type: supportForm.support_type,
                        amount: supportForm.amount,
                        occurred_on: supportForm.occurred_on
                    })
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json?.error || 'Failed to add support event.');

                setEvents(current => [eventToFormRow(json.event), ...current]);
                setSupportForm({ ...initialSupportForm, occurred_on: todayISO() });
                setMessage('Member support event added.');
            } catch (err) {
                setError(err?.message || 'Failed to add support event.');
            } finally {
                setBusyKey('');
            }
        },
        [authHeader, supportForm]
    );

    const updateEventField = useCallback((eventId, field, value) => {
        setEvents(current => current.map(item => (item.id === eventId ? { ...item, [field]: value } : item)));
    }, []);

    const saveSupportEvent = useCallback(
        async item => {
            const amountError = getAmountError(item.amount);
            setMessage('');
            setError('');
            if (amountError) {
                setError(amountError);
                return;
            }

            setBusyKey(`save-${item.id}`);
            try {
                const res = await fetch('/api/impact-statistics', {
                    method: 'PATCH',
                    headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        section: 'member_support',
                        id: item.id,
                        support_type: item.support_type,
                        amount: item.amount,
                        occurred_on: item.occurred_on
                    })
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json?.error || 'Failed to save support event.');

                const updated = eventToFormRow(json.event);
                setEvents(current => current.map(existing => (existing.id === updated.id ? updated : existing)));
                setMessage('Member support event saved.');
            } catch (err) {
                setError(err?.message || 'Failed to save support event.');
            } finally {
                setBusyKey('');
            }
        },
        [authHeader]
    );

    const deleteSupportEvent = useCallback(
        async item => {
            const confirmed = window.confirm('Delete this member support event?');
            if (!confirmed) return;

            setMessage('');
            setError('');
            setBusyKey(`delete-${item.id}`);
            try {
                const res = await fetch(`/api/impact-statistics?id=${encodeURIComponent(item.id)}`, {
                    method: 'DELETE',
                    headers: await authHeader()
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json?.error || 'Failed to delete support event.');

                setEvents(current => current.filter(existing => existing.id !== item.id));
                setMessage('Member support event deleted.');
            } catch (err) {
                setError(err?.message || 'Failed to delete support event.');
            } finally {
                setBusyKey('');
            }
        },
        [authHeader]
    );

    if (!shouldLoad) return null;

    return (
        <section className="platform-card span-12 impact-card" aria-label="Impact statistics">
            <div className="platform-kpi-row impact-card-header">
                <div>
                    <h2 style={{ margin: 0 }}>Impact statistics</h2>
                    <p className="platform-subtitle" style={{ marginTop: '0.25rem' }}>
                        Help show the power of HIVE as a collective.
                    </p>
                </div>
                <span className="badge success">Collective</span>
            </div>

            <p className="platform-message info impact-privacy-note">
                We will not record your information for public use. Public reporting uses anonymous aggregate totals only,
                and member support events do not collect member names.
            </p>

            {loading ? <p className="platform-subtitle">Loading impact statistics...</p> : null}
            {message ? <p className="platform-message info">{message}</p> : null}
            {error ? <p className="platform-message error">{error}</p> : null}

            <div className="impact-stat-grid">
                {canManageExternalRevenue ? (
                    <form className="impact-stat-form impact-money-form" onSubmit={saveExternalRevenue}>
                        <div>
                            <h3>Money from outside Whanganui</h3>
                            <p className="platform-subtitle">
                                One tenancy figure for dollars brought into Whanganui from clients, customers, grants, or projects outside the district.
                            </p>
                        </div>
                        <div className="impact-money-preview">
                            <span>Saved total</span>
                            <strong>{formatNZDFromCents(savedExternalCents)}</strong>
                        </div>
                        <label>
                            <span>Edit figure</span>
                            <div className="impact-money-input">
                                <span>NZD</span>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="5000"
                                    value={externalAmount}
                                    onChange={event => setExternalAmount(event.target.value)}
                                    disabled={busyKey === 'external' || loading}
                                />
                            </div>
                        </label>
                        <div className="impact-stat-submit-row">
                            <span className="platform-subtitle">Next value {externalPreview}</span>
                            <button className="btn primary" type="submit" disabled={busyKey === 'external' || loading}>
                                {busyKey === 'external' ? 'Saving...' : 'Save figure'}
                            </button>
                        </div>
                    </form>
                ) : null}

                {canManageSupportEvents ? (
                    <div className="impact-stat-panel">
                        <form className="impact-stat-form impact-add-event-form" onSubmit={addSupportEvent}>
                            <div>
                                <h3>Member hire or help event</h3>
                                <p className="platform-subtitle">
                                    Add the date and value of work where you hired or helped another HIVE member. Do not enter the member name.
                                </p>
                            </div>
                            <div className="impact-field-grid">
                                <label className="impact-field-wide">
                                    <span>Event</span>
                                    <select
                                        value={supportForm.support_type}
                                        onChange={event => setSupportForm(current => ({ ...current, support_type: event.target.value }))}
                                        disabled={busyKey === 'add-event' || loading}
                                    >
                                        <option value="hired_member">Hired a member</option>
                                        <option value="helped_member">Helped a member</option>
                                    </select>
                                </label>
                                <label>
                                    <span>Amount</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="$750"
                                        value={supportForm.amount}
                                        onChange={event => setSupportForm(current => ({ ...current, amount: event.target.value }))}
                                        disabled={busyKey === 'add-event' || loading}
                                    />
                                </label>
                                <label>
                                    <span>Date</span>
                                    <input
                                        className="platform-date-input"
                                        type="date"
                                        value={supportForm.occurred_on}
                                        onChange={event => setSupportForm(current => ({ ...current, occurred_on: event.target.value }))}
                                        disabled={busyKey === 'add-event' || loading}
                                    />
                                </label>
                            </div>
                            <div className="impact-stat-submit-row">
                                <span className="platform-subtitle">Will add {supportPreview}</span>
                                <button className="btn primary" type="submit" disabled={busyKey === 'add-event' || loading}>
                                    {busyKey === 'add-event' ? 'Saving...' : 'Add event'}
                                </button>
                            </div>
                        </form>

                        <div className="impact-event-list" aria-label="Member support events">
                            <div className="impact-event-list-head">
                                <h3>Recorded events</h3>
                                <span className="badge neutral">{events.length}</span>
                            </div>
                            {events.length ? (
                                events.map(item => (
                                    <div key={item.id} className="impact-event-row">
                                        <div className="impact-event-fields">
                                            <label className="impact-event-type">
                                                <span>Event</span>
                                                <select
                                                    value={item.support_type}
                                                    onChange={event => updateEventField(item.id, 'support_type', event.target.value)}
                                                    disabled={busyKey.endsWith(item.id)}
                                                >
                                                    <option value="hired_member">Hired a member</option>
                                                    <option value="helped_member">Helped a member</option>
                                                </select>
                                            </label>
                                            <label>
                                                <span>Amount</span>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={item.amount}
                                                    aria-label={`${supportTypeLabel(item.support_type)} amount`}
                                                    onChange={event => updateEventField(item.id, 'amount', event.target.value)}
                                                    disabled={busyKey.endsWith(item.id)}
                                                />
                                            </label>
                                            <label>
                                                <span>Date</span>
                                                <input
                                                    className="platform-date-input"
                                                    type="date"
                                                    value={item.occurred_on}
                                                    onChange={event => updateEventField(item.id, 'occurred_on', event.target.value)}
                                                    disabled={busyKey.endsWith(item.id)}
                                                />
                                            </label>
                                        </div>
                                        <div className="impact-event-actions">
                                            <button
                                                className="btn secondary"
                                                type="button"
                                                onClick={() => saveSupportEvent(item)}
                                                disabled={busyKey.endsWith(item.id)}
                                            >
                                                {busyKey === `save-${item.id}` ? 'Saving...' : 'Save'}
                                            </button>
                                            <button
                                                className="btn ghost impact-danger-btn"
                                                type="button"
                                                onClick={() => deleteSupportEvent(item)}
                                                disabled={busyKey.endsWith(item.id)}
                                            >
                                                {busyKey === `delete-${item.id}` ? 'Deleting...' : 'Delete'}
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="platform-subtitle">No member support events recorded yet.</p>
                            )}
                        </div>
                    </div>
                ) : null}
            </div>
        </section>
    );
}

function eventToFormRow(event) {
    return {
        id: event?.id || '',
        support_type: event?.support_type || 'hired_member',
        amount: centsToInput(event?.amount_cents || 0),
        occurred_on: event?.occurred_on || todayISO()
    };
}
