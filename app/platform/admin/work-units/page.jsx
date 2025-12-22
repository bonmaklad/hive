'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePlatformSession } from '../../PlatformContext';

const UNIT_TYPES = ['premium_office', 'private_office', 'desk', 'desk_pod', 'small_office'];

function toCode(building, unitNumber) {
    const b = typeof building === 'string' ? building.trim() : '';
    const n = typeof unitNumber === 'string' ? unitNumber.trim() : String(unitNumber ?? '').trim();
    if (!b || !n) return '';
    return `${b}.${n}`;
}

function toIntOrEmptyString(value) {
    const raw = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
    if (!raw) return '';
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? String(n) : '';
}

function toIntOrNull(value) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.floor(n);
}

function toDollars(cents) {
    const n = Number(cents);
    if (!Number.isFinite(n)) return '';
    return String((n / 100).toFixed(2));
}

function toCentsFromDollars(value) {
    const v = typeof value === 'string' ? value.trim() : '';
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
}

function formatNZDOptional(cents) {
    if (cents === null || cents === undefined) return '—';
    const value = Number(cents || 0) / 100;
    try {
        return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(value);
    } catch {
        return `$${value}`;
    }
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

function buildDraftFromUnit(unit) {
    const priceSource = unit?.price_cents ?? unit?.display_price_cents ?? null;
    return {
        building: unit?.building ? String(unit.building) : '',
        unit_number: toIntOrEmptyString(unit?.unit_number),
        unit_type: unit?.unit_type ? String(unit.unit_type) : UNIT_TYPES[0],
        capacity: toIntOrEmptyString(unit?.capacity ?? 1) || '1',
        is_active: Boolean(unit?.is_active ?? unit?.active ?? true),
        category: unit?.category ? String(unit.category) : '',
        price_dollars: priceSource === null ? '' : toDollars(priceSource)
    };
}

function buildPayloadFromDraft(draft) {
    return {
        building: draft.building.trim(),
        unit_number: toIntOrNull(draft.unit_number),
        unit_type: draft.unit_type,
        capacity: toIntOrNull(draft.capacity) ?? 1,
        is_active: Boolean(draft.is_active),
        category: draft.category.trim() || null,
        price_cents: toCentsFromDollars(draft.price_dollars)
    };
}

export default function AdminWorkUnitsPage() {
    const { supabase } = usePlatformSession();

    const [units, setUnits] = useState([]);
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    const [showInactive, setShowInactive] = useState(true);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [activeUnit, setActiveUnit] = useState(null);
    const [draft, setDraft] = useState(() =>
        buildDraftFromUnit({
            building: '',
            unit_number: '',
            unit_type: UNIT_TYPES[0],
            capacity: 1,
            is_active: true,
            category: '',
            price_cents: null
        })
    );

    const authHeader = async () => {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) throw new Error('No session token. Please sign in again.');
        return { Authorization: `Bearer ${token}` };
    };

    const loadUnits = async () => {
        setLoading(true);
        setError('');
        setInfo('');
        try {
            const res = await fetch(
                `/api/admin/work-units?includeInactive=${showInactive ? '1' : '0'}&includeOccupant=1&includeBilling=1`,
                { headers: await authHeader() }
            );
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to load work units.');
            setUnits(Array.isArray(json?.units) ? json.units : []);
            setMetrics(json?.metrics || null);
        } catch (err) {
            setUnits([]);
            setMetrics(null);
            setError(err?.message || 'Failed to load work units.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUnits();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showInactive]);

    const sortedUnits = useMemo(() => {
        return [...(units || [])].sort((a, b) => {
            const ab = String(a?.building || '').localeCompare(String(b?.building || ''));
            if (ab !== 0) return ab;
            const an = Number(a?.unit_number);
            const bn = Number(b?.unit_number);
            const aIsNum = Number.isFinite(an);
            const bIsNum = Number.isFinite(bn);
            if (aIsNum && bIsNum) return an - bn;
            return String(a?.unit_number || '').localeCompare(String(b?.unit_number || ''));
        });
    }, [units]);

    const closeModal = (opts = {}) => {
        const force = Boolean(opts.force);
        if (busy && !force) return;
        setModalOpen(false);
        setActiveUnit(null);
        setError('');
        setInfo('');
    };

    const openCreate = () => {
        setModalMode('create');
        setActiveUnit(null);
        setDraft(
            buildDraftFromUnit({
                building: '',
                unit_number: '',
                unit_type: UNIT_TYPES[0],
                capacity: 1,
                is_active: true,
                category: '',
                price_cents: null
            })
        );
        setModalOpen(true);
        setError('');
        setInfo('');
    };

    const submitCreate = async () => {
        setBusy(true);
        setError('');
        setInfo('');
        try {
            const payload = buildPayloadFromDraft(draft);
            const res = await fetch('/api/admin/work-units', {
                method: 'POST',
                headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to create work unit.');
            closeModal({ force: true });
            setInfo('Created.');
            await loadUnits();
        } catch (err) {
            setError(err?.message || 'Failed to create work unit.');
        } finally {
            setBusy(false);
        }
    };

    const openEdit = unit => {
        if (!unit?.id) return;
        setModalMode('edit');
        setActiveUnit(unit);
        setDraft(buildDraftFromUnit(unit));
        setModalOpen(true);
        setError('');
        setInfo('');
    };

    const submitEdit = async () => {
        if (!activeUnit?.id) return;
        setBusy(true);
        setError('');
        setInfo('');
        try {
            const payload = buildPayloadFromDraft(draft);
            const res = await fetch(`/api/admin/work-units/${encodeURIComponent(activeUnit.id)}`, {
                method: 'PATCH',
                headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to update work unit.');
            closeModal({ force: true });
            setInfo('Saved.');
            await loadUnits();
        } catch (err) {
            setError(err?.message || 'Failed to update work unit.');
        } finally {
            setBusy(false);
        }
    };

    const deleteUnit = async unitOrId => {
        const unit = typeof unitOrId === 'object' ? unitOrId : (activeUnit?.id === unitOrId ? activeUnit : null);
        const id = typeof unitOrId === 'string' ? unitOrId : unit?.id;
        if (!id) return;
        const code = unit?.code || toCode(unit?.building, unit?.unit_number) || id;
        const ok = window.confirm(`Delete work unit "${code}"? This cannot be undone.`);
        if (!ok) return;
        setBusy(true);
        setError('');
        setInfo('');
        try {
            const res = await fetch(`/api/admin/work-units/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: await authHeader()
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to delete work unit.');
            setInfo('Deleted.');
            closeModal({ force: true });
            await loadUnits();
        } catch (err) {
            setError(err?.message || 'Failed to delete work unit.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Work units</h1>
                    <p className="platform-subtitle">Add, edit, and delete inventory for desks, pods, and offices.</p>
                </div>
                <div className="platform-actions">
                    <button className="btn ghost" type="button" onClick={loadUnits} disabled={busy || loading}>
                        Refresh
                    </button>
                    <button className="btn primary" type="button" onClick={openCreate} disabled={busy}>
                        New work unit
                    </button>
                    <Link className="btn ghost" href="/platform/admin">
                        Back to admin
                    </Link>
                </div>
            </div>

            <label className="platform-subtitle" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} disabled={busy} />
                Show inactive
            </label>

            {metrics ? (
                <div className="platform-steps" style={{ marginTop: '0.75rem' }}>
                    <span className="platform-step active">
                        Occupancy:{' '}
                        {Number.isFinite(Number(metrics?.occupancy_rate))
                            ? `${Math.round(Number(metrics.occupancy_rate) * 100)}%`
                            : '—'}{' '}
                        <span className="platform-subtitle">
                            ({metrics?.occupied_slots ?? 0}/{metrics?.total_capacity ?? 0})
                        </span>
                    </span>
                    <span className="platform-step active">
                        Total recurring revenue:{' '}
                        <span className="platform-mono">{formatNZDOptional(metrics?.total_recurring_revenue_cents ?? null)}</span> / month
                    </span>
                </div>
            ) : null}

            {error && <p className="platform-message error">{error}</p>}
            {info && <p className="platform-message success">{info}</p>}

            <Modal
                open={modalOpen}
                title={modalMode === 'create' ? 'New work unit' : 'Edit work unit'}
                subtitle={modalMode === 'edit' ? (activeUnit?.is_vacant ? 'Vacant' : 'Occupied') : 'Create a new inventory unit.'}
                onClose={closeModal}
                footer={
                    <div className="platform-actions">
                        {modalMode === 'edit' ? (
                            <button className="btn ghost" type="button" onClick={() => deleteUnit(activeUnit?.id)} disabled={busy}>
                                Delete
                            </button>
                        ) : null}
                        <button
                            className="btn primary"
                            type="button"
                            onClick={modalMode === 'create' ? submitCreate : submitEdit}
                            disabled={busy}
                        >
                            {busy ? 'Saving…' : modalMode === 'create' ? 'Create' : 'Save'}
                        </button>
                    </div>
                }
            >
                <div className="platform-grid" style={{ gap: '0.75rem' }}>
                    <label className="span-6">
                        Building
                        <input value={draft.building} onChange={e => setDraft(d => ({ ...d, building: e.target.value }))} disabled={busy} />
                    </label>
                    <label className="span-6">
                        Unit number
                        <input value={draft.unit_number} onChange={e => setDraft(d => ({ ...d, unit_number: e.target.value }))} disabled={busy} />
                    </label>
                    <label className="span-6">
                        Code (auto)
                        <input value={toCode(draft.building, draft.unit_number)} disabled />
                    </label>
                    <label className="span-6">
                        Unit type
                        <select value={draft.unit_type} onChange={e => setDraft(d => ({ ...d, unit_type: e.target.value }))} disabled={busy}>
                            {UNIT_TYPES.map(t => (
                                <option key={t} value={t}>
                                    {t}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="span-6">
                        Capacity
                        <input value={draft.capacity} onChange={e => setDraft(d => ({ ...d, capacity: e.target.value }))} disabled={busy} />
                    </label>
                    <label className="span-6">
                        Price ($)
                        <input
                            value={draft.price_dollars}
                            onChange={e => setDraft(d => ({ ...d, price_dollars: e.target.value }))}
                            disabled={busy}
                            placeholder="e.g. 150"
                        />
                    </label>
                    <label className="span-6">
                        Category (optional)
                        <input value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))} disabled={busy} />
                    </label>
                    <label className="span-6" style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: '1.5rem' }}>
                        <input
                            type="checkbox"
                            checked={draft.is_active}
                            onChange={e => setDraft(d => ({ ...d, is_active: e.target.checked }))}
                            disabled={busy}
                        />
                        Active
                    </label>
                </div>
            </Modal>

            {loading ? (
                <p className="platform-subtitle">Loading…</p>
            ) : (
                <div className="platform-table-wrap" style={{ marginTop: '0.75rem' }}>
                    <table className="platform-table">
                        <thead>
                            <tr>
                                <th>Building</th>
                                <th>Unit</th>
                                <th>Vacant</th>
                                <th>Unit type</th>
                                <th>Capacity</th>
                                <th>Price</th>
                                <th>Billing</th>
                                <th>Active</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedUnits.length ? (
                                sortedUnits.map(unit => {
                                    const hasVacancy =
                                        unit?.is_full === false
                                        || (Number.isFinite(Number(unit?.slots_remaining)) && Number(unit.slots_remaining) > 0)
                                        || (unit?.is_full !== true && unit?.is_vacant === true);
                                    const displayPrice = unit?.display_price_cents ?? unit?.price_cents ?? null;
                                    const billingCents = Number.isFinite(Number(unit?.billing_cents)) && Number(unit.billing_cents) > 0
                                        ? Number(unit.billing_cents)
                                        : null;
                                    return (
                                        <tr key={unit?.id || unit?.code}>
                                            <td className="platform-mono">
                                                {unit?.building || '—'}
                                            </td>
                                            <td className="platform-mono">
                                                {unit?.unit_number ?? '—'}
                                            </td>
                                            <td>
                                                {hasVacancy === true ? <span className="badge success">yes</span> : <span className="badge pending">no</span>}
                                            </td>
                                            <td className="platform-mono">
                                                {unit?.unit_type || '—'}
                                            </td>
                                            <td className="platform-mono">
                                                {Number.isFinite(Number(unit?.capacity)) ? Number(unit.capacity) : '—'}
                                            </td>
                                            <td className="platform-mono">
                                                {formatNZDOptional(displayPrice)}
                                            </td>
                                            <td className="platform-mono">
                                                {formatNZDOptional(billingCents)}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <span className={unit?.is_active ? 'badge success' : 'badge pending'}>{unit?.is_active ? 'yes' : 'no'}</span>
                                            </td>
                                            <td>
                                                <div className="platform-actions">
                                                    <button className="btn secondary" type="button" onClick={() => openEdit(unit)} disabled={busy}>
                                                        Edit
                                                    </button>
                                                    <button className="btn ghost" type="button" onClick={() => deleteUnit(unit)} disabled={busy}>
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={9} className="platform-subtitle">
                                        No work units found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </main>
    );
}
