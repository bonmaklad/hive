'use client';

import { useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function UpdatePasswordForm() {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    const submit = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setInfo('');

        try {
            if (password.length < 8) {
                throw new Error('Password must be at least 8 characters.');
            }
            if (password !== confirm) {
                throw new Error('Passwords do not match.');
            }

            const { error: updateError } = await supabase.auth.updateUser({
                password,
                data: { must_set_password: false }
            });
            if (updateError) throw updateError;

            setPassword('');
            setConfirm('');
            setInfo('Password updated.');
        } catch (err) {
            setError(err?.message || 'Could not update password.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form className="contact-form" onSubmit={submit}>
            <label>
                New password
                <input
                    type="password"
                    name="new-password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={busy}
                />
            </label>
            <label>
                Confirm new password
                <input
                    type="password"
                    name="confirm-password"
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    disabled={busy}
                />
            </label>

            {error && <p className="platform-message error">{error}</p>}
            {info && <p className="platform-message info">{info}</p>}

            <div className="platform-actions">
                <button className="btn primary" type="submit" disabled={busy}>
                    {busy ? 'Saving…' : 'Save password'}
                </button>
            </div>
        </form>
    );
}
