'use client';

import { useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

function getDefaultName(user) {
    return user?.user_metadata?.name || user?.user_metadata?.full_name || '';
}

export default function ProfileForm({ user, onUpdated }) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [name, setName] = useState(getDefaultName(user));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    const save = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setInfo('');

        try {
            const trimmed = name.trim();
            if (trimmed.length < 2) {
                throw new Error('Name must be at least 2 characters.');
            }

            const { error: updateError } = await supabase.auth.updateUser({
                data: { name: trimmed }
            });
            if (updateError) throw updateError;

            setInfo('Profile updated.');
            onUpdated?.();
        } catch (err) {
            setError(err?.message || 'Could not update profile.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form className="contact-form" onSubmit={save}>
            <label>
                Display name
                <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    disabled={busy}
                    autoComplete="name"
                    placeholder="e.g. Alex Smith"
                />
            </label>

            {error && <p className="platform-message error">{error}</p>}
            {info && <p className="platform-message info">{info}</p>}

            <div className="platform-actions">
                <button className="btn primary" type="submit" disabled={busy}>
                    {busy ? 'Saving…' : 'Save profile'}
                </button>
            </div>
        </form>
    );
}

