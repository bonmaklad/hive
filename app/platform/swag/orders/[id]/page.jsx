'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePlatformSession } from '../../../PlatformContext';

function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString();
}

export default function SwagOrderDetailPage({ params }) {
    const { supabase } = usePlatformSession();
    const orderId = params?.id;
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        if (!orderId) {
            setError('Missing order id.');
            setLoading(false);
            return () => {};
        }

        const load = async () => {
            setLoading(true);
            setError('');
            try {
                const { data } = await supabase.auth.getSession();
                const token = data?.session?.access_token;
                if (!token) throw new Error('No session token.');
                const res = await fetch(`/api/swag/orders/${encodeURIComponent(orderId)}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json?.error || 'Failed to load order.');
                if (!cancelled) setOrder(json?.order || null);
            } catch (err) {
                if (!cancelled) setError(err?.message || 'Failed to load order.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [orderId, supabase]);

    const statusMeta = useMemo(() => {
        if (!order?.status) return { label: '—', badge: 'neutral' };
        if (order.status === 'fulfilled') return { label: order.status, badge: 'success' };
        if (order.status === 'cancelled') return { label: order.status, badge: 'error' };
        return { label: order.status, badge: 'pending' };
    }, [order?.status]);

    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Order details</h1>
                    <p className="platform-subtitle">Review your SWAG redemption.</p>
                </div>
                <Link className="btn ghost" href="/platform/swag">
                    Back to SWAG
                </Link>
            </div>

            {error && <p className="platform-message error">{error}</p>}

            <section className="platform-card">
                {loading ? (
                    <p className="platform-subtitle">Loading…</p>
                ) : order ? (
                    <div className="platform-grid" style={{ gap: '1rem' }}>
                        <div className="span-6">
                            <div className="platform-swag-media">
                                {order.item_snapshot?.image_url ? (
                                    <img src={order.item_snapshot.image_url} alt={order.item_snapshot?.title || 'SWAG item'} />
                                ) : (
                                    <div className="platform-swag-placeholder">No image</div>
                                )}
                            </div>
                        </div>
                        <div className="span-6">
                            <h2 style={{ marginTop: 0 }}>{order.item_snapshot?.title || 'SWAG item'}</h2>
                            {order.item_snapshot?.description ? (
                                <p className="platform-subtitle">{order.item_snapshot.description}</p>
                            ) : null}
                            <div style={{ display: 'grid', gap: '0.4rem', marginTop: '0.75rem' }}>
                                <div className="platform-subtitle">
                                    Status: <span className={`badge ${statusMeta.badge}`}>{statusMeta.label}</span>
                                </div>
                                <div className="platform-subtitle">Ordered on: {formatDate(order.created_at)}</div>
                                <div className="platform-subtitle">Quantity: {order.quantity}</div>
                                <div className="platform-subtitle">Tokens per item: {order.unit_tokens}</div>
                                <div className="platform-subtitle">Total tokens: {order.tokens_cost}</div>
                                {order.fulfilled_at ? <div className="platform-subtitle">Fulfilled: {formatDate(order.fulfilled_at)}</div> : null}
                                {order.cancelled_at ? <div className="platform-subtitle">Cancelled: {formatDate(order.cancelled_at)}</div> : null}
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="platform-subtitle">Order not found.</p>
                )}
            </section>
        </main>
    );
}
