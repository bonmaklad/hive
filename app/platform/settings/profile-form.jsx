'use client';

import { useEffect, useMemo, useState } from 'react';
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

    // Load the current profile name from the profiles table so the form reflects saved value
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (!user?.id) return;
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('name')
                    .eq('id', user.id)
                    .maybeSingle();
                if (cancelled) return;
                if (!error && data && typeof data.name === 'string' && data.name.trim()) {
                    setName(data.name);
                } else {
                    // Fall back to auth metadata if no profile name is set
                    setName(getDefaultName(user));
                }
            } catch {
                // ignore, keep existing value
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [supabase, user?.id]);

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

            const { error: updateProfileError } = await supabase
                .from('profiles')
                .update({ name: trimmed })
                .eq('id', user.id);
            if (updateProfileError) throw updateProfileError;

            const { error: updateAuthError } = await supabase.auth.updateUser({ data: { name: trimmed } });
            if (updateAuthError) throw updateAuthError;

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
