'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePlatformSession } from '../../PlatformContext';

function formatNZD(cents) {
    const value = Number(cents || 0) / 100;
    try {
        return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(value);
    } catch {
        return `$${value}`;
    }
}

export default function AdminRequestsPage() {
    const { supabase } = usePlatformSession();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busyId, setBusyId] = useState('');

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
            const res = await fetch('/api/admin/membership-change-requests?status=pending', { headers: await authHeader() });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || 'Failed to load requests.');
            setRequests(Array.isArray(json?.requests) ? json.requests : []);
        } catch (err) {
            setError(err?.message || 'Failed to load requests.');
            setRequests([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const decide = async (id, action) => {
        setBusyId(id);
        setError('');
        try {
            const res = await fetch(`/api/admin/membership-change-requests/${id}`, {
                method: 'POST',
                headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || 'Failed to update request.');
            await load();
        } catch (err) {
            setError(err?.message || 'Failed to update request.');
        } finally {
            setBusyId('');
        }
    };

    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Membership requests</h1>
                    <p className="platform-subtitle">Approve or decline pending changes.</p>
                </div>
                <Link className="btn ghost" href="/platform/admin">
                    Back to admin
                </Link>
            </div>

            {error && <p className="platform-message error">{error}</p>}

            {loading ? (
                <p className="platform-subtitle">Loading…</p>
            ) : (
                <div className="platform-table-wrap">
                    <table className="platform-table">
                        <thead>
                            <tr>
                                <th>Member</th>
                                <th>Requested</th>
                                <th>Extras</th>
                                <th>Created</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.length ? (
                                requests.map(r => (
                                    <tr key={r.id}>
                                        <td>
                                            <div>{r.owner?.name || '—'}</div>
                                            <div className="platform-mono">{r.owner?.email || r.owner_id}</div>
                                        </td>
                                        <td className="platform-mono">
                                            {r.requested_plan || '—'}
                                            {r.requested_office_id ? ` • ${r.requested_office_id}` : ''}
                                        </td>
                                        <td className="platform-mono">
                                            donation: {formatNZD(r.requested_donation_cents || 0)} / mo
                                            <br />
                                            fridge: {r.requested_fridge_enabled ? 'yes' : 'no'}
                                        </td>
                                        <td className="platform-mono">{new Date(r.created_at).toLocaleString()}</td>
                                        <td>
                                            <div className="platform-actions">
                                                <button
                                                    className="btn primary"
                                                    type="button"
                                                    onClick={() => decide(r.id, 'approve')}
                                                    disabled={busyId === r.id}
                                                >
                                                    {busyId === r.id ? 'Working…' : 'Approve'}
                                                </button>
                                                <button
                                                    className="btn secondary"
                                                    type="button"
                                                    onClick={() => decide(r.id, 'reject')}
                                                    disabled={busyId === r.id}
                                                >
                                                    {busyId === r.id ? 'Working…' : 'Decline'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="platform-subtitle">
                                        No pending requests.
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
