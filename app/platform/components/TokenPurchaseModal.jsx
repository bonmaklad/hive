'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlatformSession } from '../PlatformContext';

const TOKEN_PRICE_CENTS = 1000;
const MIN_TOKENS = 10;

function formatNZD(cents) {
    const value = Number(cents || 0) / 100;
    try {
        return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(value);
    } catch {
        return `$${value}`;
    }
}

function parseTokenQuantity(value) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
}

function safeReturnPath(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith('/platform')) return null;
    return trimmed;
}

export default function TokenPurchaseModal({
    triggerLabel = 'Tokens',
    triggerVariant = 'icon',
    showStatus = false,
    tokensLeft = null,
    returnPath = '/platform'
}) {
    const { supabase } = usePlatformSession();
    const [open, setOpen] = useState(false);
    const [tokenQty, setTokenQty] = useState(String(MIN_TOKENS));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    const quantity = useMemo(() => parseTokenQuantity(tokenQty), [tokenQty]);
    const totalCents = useMemo(() => Math.max(0, quantity * TOKEN_PRICE_CENTS), [quantity]);
    const canPurchase = quantity >= MIN_TOKENS;

    useEffect(() => {
        if (!showStatus) return;
        const params = new URLSearchParams(window.location.search);
        const stripeState = params.get('stripe');
        if (!stripeState) return;
        if (stripeState === 'tokens-success') {
            const tokens = params.get('tokens');
            setInfo(tokens ? `Payment complete. ${tokens} token(s) will appear shortly.` : 'Payment complete. Tokens will appear shortly.');
            setOpen(true);
        }
        if (stripeState === 'tokens-cancel') {
            setInfo('Token purchase cancelled.');
            setOpen(true);
        }
    }, [showStatus]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = event => {
            if (event.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open]);

    const authHeader = useCallback(async () => {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) throw new Error('No session token. Please sign in again.');
        return { Authorization: `Bearer ${token}` };
    }, [supabase]);

    const startCheckout = useCallback(async () => {
        if (!canPurchase || busy) return;
        setBusy(true);
        setError('');
        try {
            const safePath = safeReturnPath(returnPath) || '/platform';
            const res = await fetch('/api/rooms/tokens/purchase', {
                method: 'POST',
                headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity, return_path: safePath })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to start Stripe checkout.');
            const checkoutUrl = json?.checkout_url;
            if (!checkoutUrl) throw new Error('Stripe checkout URL missing.');
            window.location.assign(checkoutUrl);
        } catch (err) {
            setError(err?.message || 'Failed to start Stripe checkout.');
        } finally {
            setBusy(false);
        }
    }, [authHeader, busy, quantity, returnPath]);

    const triggerClassName =
        triggerVariant === 'icon' ? 'btn ghost platform-token-trigger' : triggerVariant === 'compact' ? 'btn ghost platform-token-trigger is-compact' : 'btn ghost';

    return (
        <>
            <button className={triggerClassName} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog">
                {triggerVariant === 'icon' || triggerVariant === 'compact' ? (
                    <>
                        <span className="platform-token-trigger-icon" aria-hidden="true">
                            +
                        </span>
                        <span className="platform-token-trigger-text">{triggerLabel}</span>
                    </>
                ) : (
                    triggerLabel
                )}
            </button>

            {open ? (
                <div className="platform-modal-overlay" role="presentation" onMouseDown={() => setOpen(false)}>
                    <div
                        className="platform-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Buy tokens"
                        onMouseDown={event => event.stopPropagation()}
                    >
                        <div className="platform-modal-header">
                            <h2 style={{ margin: 0 }}>Buy tokens</h2>
                            <button className="btn ghost" type="button" onClick={() => setOpen(false)}>
                                Close
                            </button>
                        </div>
                        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem' }}>
                            <p className="platform-subtitle">
                                Top up your room credits anytime. Tokens are {formatNZD(TOKEN_PRICE_CENTS)} each. Minimum {MIN_TOKENS} tokens.
                            </p>
                            {typeof tokensLeft === 'number' ? (
                                <p className="platform-subtitle">
                                    Current balance: <span className="platform-mono">{tokensLeft}</span> tokens
                                </p>
                            ) : null}
                            <label className="platform-subtitle">
                                Tokens to buy
                                <input
                                    type="number"
                                    min={MIN_TOKENS}
                                    step="1"
                                    inputMode="numeric"
                                    value={tokenQty}
                                    onChange={e => setTokenQty(e.target.value)}
                                    disabled={busy}
                                    style={{ marginTop: '0.35rem' }}
                                />
                            </label>
                            <p className="platform-subtitle">
                                Total: {canPurchase ? formatNZD(totalCents) : '—'}{' '}
                                {quantity ? `(${quantity} token${quantity === 1 ? '' : 's'})` : ''}
                            </p>
                            {error ? <p className="platform-message error">{error}</p> : null}
                            {info ? <p className="platform-message">{info}</p> : null}
                            <div className="platform-card-actions">
                                <button className="btn primary" type="button" onClick={startCheckout} disabled={!canPurchase || busy}>
                                    {busy ? 'Redirecting…' : 'Purchase tokens'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
