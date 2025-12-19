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

export default function AdminTenantsPage() {
    const { supabase } = usePlatformSession();
    const [tenants, setTenants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [newTenantName, setNewTenantName] = useState('');
    const [busy, setBusy] = useState(false);

    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('member');
    const [creditsUserId, setCreditsUserId] = useState('');
    const [creditsTokens, setCreditsTokens] = useState('10');
    const monthStart = useMemo(() => getMonthStart(), []);

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
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || 'Failed to load tenants.');
            setTenants(Array.isArray(json?.tenants) ? json.tenants : []);
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

    const createTenant = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/admin/tenants', {
                method: 'POST',
                headers: {
                    ...(await authHeader()),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: newTenantName })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || 'Failed to create tenant.');
            setNewTenantName('');
            await load();
        } catch (err) {
            setError(err?.message || 'Failed to create tenant.');
        } finally {
            setBusy(false);
        }
    };

    const addUser = async (tenantId) => {
        setBusy(true);
        setError('');
        try {
            const res = await fetch(`/api/admin/tenants/${tenantId}/users`, {
                method: 'POST',
                headers: {
                    ...(await authHeader()),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email: inviteEmail, role: inviteRole })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || 'Failed to add user.');
            setInviteEmail('');
            await load();
        } catch (err) {
            setError(err?.message || 'Failed to add user.');
        } finally {
            setBusy(false);
        }
    };

    const setCredits = async (tenantId) => {
        setBusy(true);
        setError('');
        try {
            const res = await fetch(`/api/admin/tenants/${tenantId}/credits`, {
                method: 'POST',
                headers: {
                    ...(await authHeader()),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    owner_id: creditsUserId,
                    period_start: monthStart,
                    tokens_total: Number(creditsTokens)
                })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || 'Failed to set credits.');
            await load();
        } catch (err) {
            setError(err?.message || 'Failed to set credits.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Tenants</h1>
                    <p className="platform-subtitle">Month start: {monthStart}</p>
                </div>
                <Link className="btn ghost" href="/platform/admin">
                    Back to admin
                </Link>
            </div>

            {error && <p className="platform-message error">{error}</p>}

            <div className="platform-card">
                <h2 style={{ marginTop: 0 }}>Create tenant</h2>
                <form className="contact-form" onSubmit={createTenant}>
                    <label>
                        Tenant name
                        <input value={newTenantName} onChange={e => setNewTenantName(e.target.value)} disabled={busy} />
                    </label>
                    <div className="platform-actions">
                        <button className="btn primary" type="submit" disabled={busy || !newTenantName.trim()}>
                            {busy ? 'Working…' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>

            {loading ? (
                <p className="platform-subtitle" style={{ marginTop: '1rem' }}>
                    Loading…
                </p>
            ) : (
                <div style={{ marginTop: '1.25rem', display: 'grid', gap: '1.25rem' }}>
                    {tenants.map(t => {
                        const users = Array.isArray(t.users) ? t.users : [];
                        const owner = t.owner?.profile || null;
                        const membership = t.membership || null;
                        const invoices = Array.isArray(t.invoices) ? t.invoices : [];
                        const totalCredits = users.reduce((sum, u) => sum + (u.room_credits?.tokens_total || 0), 0);
                        const totalUsed = users.reduce((sum, u) => sum + (u.room_credits?.tokens_used || 0), 0);

                        return (
                            <section key={t.id} className="platform-card">
                                <div className="platform-kpi-row">
                                    <h2 style={{ margin: 0 }}>{t.name}</h2>
                                    <span className="badge neutral">{t.id?.slice(0, 8)}</span>
                                </div>

                                <p className="platform-subtitle">
                                    Owner: {owner ? `${owner.name || '—'} (${owner.email || '—'})` : '—'}
                                </p>
                                <p className="platform-subtitle">
                                    Membership:{' '}
                                    {membership ? (
                                        <>
                                            <span className={`badge ${membership.status === 'live' ? 'success' : 'pending'}`}>
                                                {membership.status || '—'}
                                            </span>{' '}
                                            <span className="platform-mono">
                                                {membership.plan} • {formatNZD(membership.monthly_amount_cents)} / month
                                            </span>
                                        </>
                                    ) : (
                                        '—'
                                    )}
                                </p>
                                <p className="platform-subtitle">
                                    Room credits (this month): {totalCredits - totalUsed} left ({totalCredits} total)
                                </p>
                                <p className="platform-subtitle">Invoices: {invoices.length}</p>

                                <div style={{ marginTop: '1rem' }}>
                                    <h3 style={{ margin: 0 }}>Tenant users</h3>
                                    <div className="platform-table-wrap" style={{ marginTop: '0.75rem' }}>
                                        <table className="platform-table">
                                            <thead>
                                                <tr>
                                                    <th>Name</th>
                                                    <th>Email</th>
                                                    <th>Role</th>
                                                    <th>Credits</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {users.length ? (
                                                    users.map(u => (
                                                        <tr key={`${u.tenant_id}:${u.user_id}`}>
                                                            <td>{u.profile?.name || '—'}</td>
                                                            <td className="platform-mono">{u.profile?.email || '—'}</td>
                                                            <td className="platform-mono">{u.role}</td>
                                                            <td className="platform-mono">
                                                                {u.room_credits
                                                                    ? `${(u.room_credits.tokens_total || 0) - (u.room_credits.tokens_used || 0)} left`
                                                                    : '—'}
                                                            </td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    <tr>
                                                        <td colSpan={4} className="platform-subtitle">
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
                                            <option value="admin">admin</option>
                                        </select>
                                        <div className="platform-card-actions">
                                            <button className="btn primary" type="button" onClick={() => addUser(t.id)} disabled={busy || !inviteEmail.trim()}>
                                                {busy ? 'Working…' : 'Add / invite'}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="platform-card span-6">
                                        <h3 style={{ marginTop: 0 }}>Set room credits</h3>
                                        <label className="platform-subtitle">User</label>
                                        <select value={creditsUserId} onChange={e => setCreditsUserId(e.target.value)} disabled={busy}>
                                            <option value="">Select user…</option>
                                            {users.map(u => (
                                                <option key={u.user_id} value={u.user_id}>
                                                    {u.profile?.email || u.user_id}
                                                </option>
                                            ))}
                                        </select>
                                        <label className="platform-subtitle" style={{ marginTop: '0.75rem', display: 'block' }}>
                                            Tokens total (this month)
                                        </label>
                                        <input value={creditsTokens} onChange={e => setCreditsTokens(e.target.value)} disabled={busy} />
                                        <div className="platform-card-actions">
                                            <button className="btn primary" type="button" onClick={() => setCredits(t.id)} disabled={busy || !creditsUserId}>
                                                {busy ? 'Working…' : 'Save credits'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        );
                    })}
                </div>
            )}
        </main>
    );
}
