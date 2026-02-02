'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { usePlatformSession } from '../../PlatformContext';

function toInt(value, fallback = 0) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
}

export const dynamic = 'force-dynamic';

export default function AdminSwagPage() {
    const { supabase } = usePlatformSession();
    const [items, setItems] = useState([]);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [ordersLoading, setOrdersLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [tokensCost, setTokensCost] = useState('10');
    const [stockQty, setStockQty] = useState('0');
    const [stockUnlimited, setStockUnlimited] = useState(false);
    const [isActive, setIsActive] = useState(true);

    const [stockEdits, setStockEdits] = useState({});
    const [orderNotesEdits, setOrderNotesEdits] = useState({});

    const authHeader = useCallback(async () => {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) throw new Error('No session token. Please sign in again.');
        return { Authorization: `Bearer ${token}` };
    }, [supabase]);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/admin/swag/items', { headers: await authHeader() });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to load SWAG items.');
            setItems(Array.isArray(json?.items) ? json.items : []);
        } catch (err) {
            setError(err?.message || 'Failed to load SWAG items.');
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [authHeader]);

    const loadOrders = useCallback(async () => {
        setOrdersLoading(true);
        setError('');
        try {
            const res = await fetch('/api/admin/swag/orders', { headers: await authHeader() });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to load SWAG orders.');
            setOrders(Array.isArray(json?.orders) ? json.orders : []);
        } catch (err) {
            setError(err?.message || 'Failed to load SWAG orders.');
            setOrders([]);
        } finally {
            setOrdersLoading(false);
        }
    }, [authHeader]);

    useEffect(() => {
        load();
        loadOrders();
    }, [load, loadOrders]);

    const createItem = async event => {
        event.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/admin/swag/items', {
                method: 'POST',
                headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim(),
                    image_url: imageUrl.trim(),
                    tokens_cost: toInt(tokensCost, 0),
                    stock_qty: toInt(stockQty, 0),
                    stock_unlimited: stockUnlimited,
                    is_active: isActive
                })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to create SWAG item.');
            setTitle('');
            setDescription('');
            setImageUrl('');
            setTokensCost('10');
            setStockQty('0');
            setStockUnlimited(false);
            setIsActive(true);
            await load();
        } catch (err) {
            setError(err?.message || 'Failed to create SWAG item.');
        } finally {
            setBusy(false);
        }
    };

    const toggleActive = async item => {
        if (!item?.id) return;
        setBusy(true);
        setError('');
        try {
            const res = await fetch(`/api/admin/swag/items/${encodeURIComponent(item.id)}`, {
                method: 'PATCH',
                headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !item.is_active })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to update SWAG item.');
            await load();
        } catch (err) {
            setError(err?.message || 'Failed to update SWAG item.');
        } finally {
            setBusy(false);
        }
    };

    const updateStockDraft = (itemId, next) => {
        setStockEdits(current => ({ ...(current || {}), [itemId]: { ...(current?.[itemId] || {}), ...next } }));
    };

    const getStockDraft = item => {
        const draft = stockEdits?.[item.id];
        return {
            stock_qty: draft?.stock_qty ?? String(item.stock_qty ?? 0),
            stock_unlimited: draft?.stock_unlimited ?? Boolean(item.stock_unlimited)
        };
    };

    const saveStock = async item => {
        if (!item?.id) return;
        const draft = getStockDraft(item);
        setBusy(true);
        setError('');
        try {
            const res = await fetch(`/api/admin/swag/items/${encodeURIComponent(item.id)}`, {
                method: 'PATCH',
                headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stock_qty: toInt(draft.stock_qty, 0),
                    stock_unlimited: draft.stock_unlimited
                })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to update stock.');
            await load();
        } catch (err) {
            setError(err?.message || 'Failed to update stock.');
        } finally {
            setBusy(false);
        }
    };

    const deleteItem = async item => {
        if (!item?.id) return;
        const ok = window.confirm('Delete this SWAG item?');
        if (!ok) return;
        setBusy(true);
        setError('');
        try {
            const res = await fetch(`/api/admin/swag/items/${encodeURIComponent(item.id)}`, {
                method: 'DELETE',
                headers: await authHeader()
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to delete SWAG item.');
            await load();
        } catch (err) {
            setError(err?.message || 'Failed to delete SWAG item.');
        } finally {
            setBusy(false);
        }
    };

    const updateOrderStatus = async (orderId, status) => {
        if (!orderId) return;
        setBusy(true);
        setError('');
        try {
            const res = await fetch(`/api/admin/swag/orders/${encodeURIComponent(orderId)}`, {
                method: 'PATCH',
                headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to update order.');
            await loadOrders();
        } catch (err) {
            setError(err?.message || 'Failed to update order.');
        } finally {
            setBusy(false);
        }
    };

    const updateOrderNotes = (orderId, value) => {
        setOrderNotesEdits(current => ({ ...(current || {}), [orderId]: value }));
    };

    const saveOrderNotes = async order => {
        if (!order?.id) return;
        const notes = orderNotesEdits?.[order.id] ?? order.admin_notes ?? '';
        setBusy(true);
        setError('');
        try {
            const res = await fetch(`/api/admin/swag/orders/${encodeURIComponent(order.id)}`, {
                method: 'PATCH',
                headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                body: JSON.stringify({ admin_notes: notes })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to update notes.');
            await loadOrders();
        } catch (err) {
            setError(err?.message || 'Failed to update notes.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>SWAG</h1>
                    <p className="platform-subtitle">Create and manage SWAG items available for token redemption.</p>
                </div>
                <Link className="btn ghost" href="/platform/admin">
                    Back to admin
                </Link>
            </div>

            {error && <p className="platform-message error">{error}</p>}

            <div className="platform-grid">
                <section className="platform-card span-6">
                    <h2 style={{ marginTop: 0 }}>Add SWAG item</h2>
                    <form className="contact-form" onSubmit={createItem}>
                        <label>
                            Title
                            <input value={title} onChange={e => setTitle(e.target.value)} disabled={busy} />
                        </label>
                        <label>
                            Description
                            <textarea value={description} onChange={e => setDescription(e.target.value)} disabled={busy} rows={4} />
                        </label>
                        <label>
                            Image URL
                            <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} disabled={busy} />
                        </label>
                        <label>
                            Tokens cost
                            <input value={tokensCost} onChange={e => setTokensCost(e.target.value)} disabled={busy} inputMode="numeric" />
                        </label>
                        <label>
                            Stock qty
                            <input
                                value={stockQty}
                                onChange={e => setStockQty(e.target.value)}
                                disabled={busy || stockUnlimited}
                                inputMode="numeric"
                            />
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input type="checkbox" checked={stockUnlimited} onChange={e => setStockUnlimited(e.target.checked)} disabled={busy} />
                            Unlimited stock
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} disabled={busy} />
                            Active (visible to members)
                        </label>
                        <div className="platform-actions">
                            <button className="btn primary" type="submit" disabled={busy || !title.trim()}>
                                {busy ? 'Working…' : 'Add item'}
                            </button>
                        </div>
                    </form>
                </section>

                <section className="platform-card span-6">
                    <h2 style={{ marginTop: 0 }}>Items</h2>
                    {loading ? (
                        <p className="platform-subtitle">Loading…</p>
                    ) : items.length ? (
                        <div className="platform-table-wrap">
                            <table className="platform-table">
                                <thead>
                                    <tr>
                                        <th>Item</th>
                                        <th>Tokens</th>
                                        <th>Stock</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(item => {
                                        const draft = getStockDraft(item);
                                        return (
                                            <tr key={item.id}>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        {item.image_url ? (
                                                            <img
                                                                src={item.image_url}
                                                                alt={item.title}
                                                                style={{ width: '56px', height: '56px', borderRadius: '12px', objectFit: 'cover' }}
                                                            />
                                                        ) : (
                                                        <div
                                                            style={{
                                                                width: '56px',
                                                                height: '56px',
                                                                borderRadius: '12px',
                                                                background: 'rgba(255,255,255,0.06)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                color: 'var(--muted)',
                                                                fontSize: '0.75rem'
                                                            }}
                                                        >
                                                            —
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>{item.title}</div>
                                                        <div className="platform-subtitle" style={{ marginTop: '0.15rem' }}>
                                                            {item.description || 'No description'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="platform-mono">{item.tokens_cost}</td>
                                            <td>
                                                <div style={{ display: 'grid', gap: '0.35rem' }}>
                                                    <label className="platform-subtitle" style={{ margin: 0 }}>
                                                        Qty
                                                        <input
                                                            value={draft.stock_qty}
                                                            onChange={e => updateStockDraft(item.id, { stock_qty: e.target.value })}
                                                            disabled={busy || draft.stock_unlimited}
                                                            inputMode="numeric"
                                                        />
                                                    </label>
                                                    <label className="platform-subtitle" style={{ margin: 0, display: 'flex', gap: '0.35rem' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={draft.stock_unlimited}
                                                            onChange={e => updateStockDraft(item.id, { stock_unlimited: e.target.checked })}
                                                            disabled={busy}
                                                        />
                                                        Unlimited
                                                    </label>
                                                    <button className="btn ghost" type="button" onClick={() => saveStock(item)} disabled={busy}>
                                                        Save stock
                                                    </button>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`badge ${item.is_active ? 'success' : 'pending'}`}>
                                                    {item.is_active ? 'Active' : 'Hidden'}
                                                </span>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    <button
                                                        className="btn ghost"
                                                        type="button"
                                                        onClick={() => toggleActive(item)}
                                                        disabled={busy}
                                                    >
                                                        {item.is_active ? 'Hide' : 'Show'}
                                                    </button>
                                                    <button className="btn ghost" type="button" onClick={() => deleteItem(item)} disabled={busy}>
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="platform-subtitle">No SWAG items yet.</p>
                    )}
                </section>
            </div>

            <section className="platform-card" style={{ marginTop: '1.25rem' }}>
                <h2 style={{ marginTop: 0 }}>Recent sales</h2>
                {ordersLoading ? (
                    <p className="platform-subtitle">Loading…</p>
                ) : orders.length ? (
                    <div className="platform-table-wrap">
                        <table className="platform-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Item</th>
                                    <th>Qty</th>
                                    <th>Tokens</th>
                                    <th>Purchaser</th>
                                    <th>Status</th>
                                    <th>Notes</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map(order => (
                                    <tr key={order.id}>
                                        <td className="platform-mono">{order.created_at?.slice(0, 10) || '—'}</td>
                                        <td>{order.item_snapshot?.title || order.item_id}</td>
                                        <td className="platform-mono">{order.quantity}</td>
                                        <td className="platform-mono">{order.tokens_cost}</td>
                                        <td className="platform-mono">
                                            {order.purchaser?.email || order.purchaser?.name || order.purchaser_id}
                                        </td>
                                        <td>
                                            <span
                                                className={`badge ${
                                                    order.status === 'fulfilled'
                                                        ? 'success'
                                                        : order.status === 'cancelled'
                                                          ? 'error'
                                                          : 'pending'
                                                }`}
                                            >
                                                {order.status}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'grid', gap: '0.35rem' }}>
                                                <textarea
                                                    rows={2}
                                                    value={orderNotesEdits?.[order.id] ?? order.admin_notes ?? ''}
                                                    onChange={e => updateOrderNotes(order.id, e.target.value)}
                                                    disabled={busy}
                                                />
                                                <button className="btn ghost" type="button" onClick={() => saveOrderNotes(order)} disabled={busy}>
                                                    Save note
                                                </button>
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                <button
                                                    className="btn ghost"
                                                    type="button"
                                                    onClick={() => updateOrderStatus(order.id, 'fulfilled')}
                                                    disabled={busy || order.status === 'fulfilled' || order.status === 'cancelled'}
                                                >
                                                    Fulfill
                                                </button>
                                                <button
                                                    className="btn ghost"
                                                    type="button"
                                                    onClick={() => updateOrderStatus(order.id, 'cancelled')}
                                                    disabled={busy || order.status === 'cancelled'}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="platform-subtitle">No sales yet.</p>
                )}
            </section>
        </main>
    );
}
