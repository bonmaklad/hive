'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { usePlatformSession } from '../PlatformContext';

function toInt(value, fallback = 0) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
}

export default function SwagStore() {
    const { profile, supabase } = usePlatformSession();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tokensLeft, setTokensLeft] = useState(0);
    const [tokensLoading, setTokensLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');
    const [actionInfo, setActionInfo] = useState('');
    const [busyItemId, setBusyItemId] = useState('');
    const [quantities, setQuantities] = useState({});
    const [orders, setOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(true);

    const authHeader = useCallback(async () => {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) throw new Error('No session token. Please sign in again.');
        return { Authorization: `Bearer ${token}` };
    }, [supabase]);

    const loadItems = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/swag/items', { headers: await authHeader() });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to load swag items.');
            setItems(Array.isArray(json?.items) ? json.items : []);
        } catch (err) {
            setError(err?.message || 'Failed to load swag items.');
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [authHeader]);

    const loadTokens = useCallback(async () => {
        setTokensLoading(true);
        try {
            const res = await fetch('/api/rooms/tokens', { headers: await authHeader() });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to load tokens.');
            setTokensLeft(Math.max(0, Number(json?.tokens_left || 0)));
        } catch (_) {
            setTokensLeft(0);
        } finally {
            setTokensLoading(false);
        }
    }, [authHeader]);

    const loadOrders = useCallback(async () => {
        setOrdersLoading(true);
        try {
            const res = await fetch('/api/swag/orders', { headers: await authHeader() });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to load orders.');
            setOrders(Array.isArray(json?.orders) ? json.orders : []);
        } catch (_) {
            setOrders([]);
        } finally {
            setOrdersLoading(false);
        }
    }, [authHeader]);

    useEffect(() => {
        loadItems();
        loadTokens();
        loadOrders();
    }, [loadItems, loadOrders, loadTokens]);

    const getQty = useCallback(
        itemId => {
            const raw = quantities?.[itemId];
            const qty = toInt(raw, 1);
            return Math.max(1, qty);
        },
        [quantities]
    );

    const updateQty = useCallback((itemId, value) => {
        setQuantities(current => ({ ...(current || {}), [itemId]: value }));
    }, []);

    const purchase = useCallback(
        async item => {
            if (!item?.id) return;
            const qty = getQty(item.id);
            const available = item.stock_unlimited ? Infinity : Math.max(0, toInt(item.stock_qty, 0));
            if (!item.stock_unlimited && available < qty) {
                setActionError('Not enough stock available.');
                return;
            }
            setBusyItemId(item.id);
            setActionError('');
            setActionInfo('');
            try {
                const res = await fetch('/api/swag/purchase', {
                    method: 'POST',
                    headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ item_id: item.id, quantity: qty })
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json?.error || 'Failed to place order.');
                setActionInfo('Order placed. We will follow up with collection details.');
                await loadItems();
                await loadTokens();
                await loadOrders();
            } catch (err) {
                setActionError(err?.message || 'Failed to place order.');
            } finally {
                setBusyItemId('');
            }
        },
        [authHeader, getQty, loadItems, loadTokens]
    );

    const itemsEmpty = !loading && !items.length;
    const isAdmin = Boolean(profile?.is_admin);

    return (
        <>
            <section className="platform-card" aria-label="Swag store">
                <div className="platform-kpi-row">
                    <div>
                        <h2 style={{ margin: 0 }}>SWAG store</h2>
                        <p className="platform-subtitle" style={{ marginTop: '0.25rem' }}>
                            Spend tokens on merch, stationery, and gear.
                        </p>
                    </div>
                    <span className="badge neutral">{tokensLoading ? '…' : `${tokensLeft} tokens`}</span>
                </div>
                <div className="platform-card-actions" style={{ marginTop: '0.75rem' }}>
                    {isAdmin ? (
                        <Link className="btn ghost" href="/platform/admin/swag">
                            Manage SWAG
                        </Link>
                    ) : null}
                </div>
                {error ? <p className="platform-message error">{error}</p> : null}
                {actionError ? <p className="platform-message error">{actionError}</p> : null}
                {actionInfo ? <p className="platform-message">{actionInfo}</p> : null}
            </section>

            {loading ? (
                <p className="platform-subtitle" style={{ marginTop: '1rem' }}>
                    Loading…
                </p>
            ) : itemsEmpty ? (
                <p className="platform-subtitle" style={{ marginTop: '1rem' }}>
                    No SWAG items yet.
                </p>
            ) : (
                <div className="platform-grid" style={{ marginTop: '1rem' }}>
                    {items.map(item => {
                        const qty = getQty(item.id);
                        const totalTokens = Math.max(0, toInt(item.tokens_cost, 0) * qty);
                        const available = item.stock_unlimited ? Infinity : Math.max(0, toInt(item.stock_qty, 0));
                        const isSoldOut = !item.stock_unlimited && available <= 0;
                        const notEnoughTokens = !tokensLoading && tokensLeft < totalTokens;
                        return (
                            <section key={item.id} className="platform-card span-4" aria-label={item.title || 'SWAG item'}>
                                <div className="platform-swag-media">
                                    {item.image_url ? (
                                        <img src={item.image_url} alt={item.title || 'SWAG item'} loading="lazy" />
                                    ) : (
                                        <div className="platform-swag-placeholder">No image</div>
                                    )}
                                </div>
                                <h3 style={{ marginTop: '1rem', marginBottom: '0.4rem' }}>{item.title}</h3>
                                {item.description ? <p className="platform-subtitle">{item.description}</p> : null}
                                <div className="platform-swag-meta">
                                    <span className="badge neutral">{item.tokens_cost} tokens</span>
                                    {item.stock_unlimited ? (
                                        <span className="badge success">Unlimited</span>
                                    ) : (
                                        <span className={`badge ${isSoldOut ? 'error' : 'pending'}`}>
                                            {isSoldOut ? 'Sold out' : `${available} left`}
                                        </span>
                                    )}
                                    {qty > 1 ? <span className="platform-subtitle">Total: {totalTokens} tokens</span> : null}
                                </div>
                                <div className="platform-swag-actions">
                                    <label className="platform-subtitle">
                                        Qty
                                        <input
                                            type="number"
                                            min="1"
                                            step="1"
                                            inputMode="numeric"
                                            max={item.stock_unlimited ? undefined : Math.max(1, available)}
                                            value={quantities?.[item.id] ?? '1'}
                                            onChange={e => updateQty(item.id, e.target.value)}
                                            disabled={busyItemId === item.id || isSoldOut}
                                        />
                                    </label>
                                    <button
                                        className="btn primary"
                                        type="button"
                                        onClick={() => purchase(item)}
                                        disabled={busyItemId === item.id || isSoldOut || notEnoughTokens}
                                    >
                                        {busyItemId === item.id ? 'Working…' : notEnoughTokens ? 'Not enough tokens' : 'Redeem tokens'}
                                    </button>
                                </div>
                            </section>
                        );
                    })}
                </div>
            )}

            <section className="platform-card" style={{ marginTop: '1.25rem' }} aria-label="Your SWAG orders">
                <h2 style={{ marginTop: 0 }}>Your orders</h2>
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
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map(order => (
                                    <tr key={order.id}>
                                        <td className="platform-mono">{order.created_at?.slice(0, 10) || '—'}</td>
                                        <td>
                                            <Link className="platform-link" href={`/platform/swag/orders/${order.id}`}>
                                                {order.item_snapshot?.title || order.item_id}
                                            </Link>
                                        </td>
                                        <td className="platform-mono">{order.quantity}</td>
                                        <td className="platform-mono">{order.tokens_cost}</td>
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
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="platform-subtitle">No orders yet.</p>
                )}
            </section>
        </>
    );
}
