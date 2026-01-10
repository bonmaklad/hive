'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { usePlatformSession } from '../PlatformContext';

function getInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'H';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function TenantDirectoryForm() {
    const { user, profile, tenantRole, supabase } = usePlatformSession();
    const [tenant, setTenant] = useState(null);
    const [logoUrl, setLogoUrl] = useState('');
    const [form, setForm] = useState({
        about: '',
        phone: '',
        email: '',
        office_location: '',
        website_url: '',
        key_contact_name: '',
        profile_name: '',
        directory_enabled: true
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const canEdit = useMemo(() => {
        return Boolean(profile?.is_admin || tenantRole === 'owner' || tenantRole === 'admin');
    }, [profile?.is_admin, tenantRole]);

    const authHeader = useCallback(async () => {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) throw new Error('Missing session token.');
        return { Authorization: `Bearer ${token}` };
    }, [supabase]);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            if (!user?.id || !canEdit) {
                setLoading(false);
                return;
            }

            setLoading(true);
            setError('');
            setNotice('');

            try {
                const res = await fetch('/api/tenant/info', { headers: await authHeader() });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json?.error || 'Failed to load directory profile.');

                if (cancelled) return;

                setTenant(json?.tenant || null);
                setLogoUrl(json?.info?.logo_url || '');
                setForm({
                    about: json?.info?.about || '',
                    phone: json?.info?.phone || '',
                    email: json?.info?.email || '',
                    office_location: json?.info?.office_location || '',
                    website_url: json?.info?.website_url || '',
                    key_contact_name: json?.info?.key_contact_name || '',
                    profile_name: json?.info?.profile_name || (json?.tenant?.name || ''),
                    directory_enabled: (json?.info?.directory_enabled ?? true) !== false
                });
            } catch (err) {
                if (!cancelled) setError(err?.message || 'Failed to load directory profile.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();

        return () => {
            cancelled = true;
        };
    }, [authHeader, canEdit, user?.id]);

    const onSubmit = async event => {
        event.preventDefault();
        setSaving(true);
        setError('');
        setNotice('');

        try {
            const res = await fetch('/api/tenant/info', {
                method: 'PUT',
                headers: {
                    ...(await authHeader()),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(form)
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to save directory profile.');

            setNotice('Directory profile updated.');
        } catch (err) {
            setError(err?.message || 'Failed to save directory profile.');
        } finally {
            setSaving(false);
        }
    };

    const onLogoChange = async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        setUploading(true);
        setError('');
        setNotice('');

        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/tenant/info/logo', {
                method: 'POST',
                headers: await authHeader(),
                body: formData
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to upload logo.');

            setLogoUrl(json?.logo_url || '');
            setNotice('Logo updated.');
        } catch (err) {
            setError(err?.message || 'Failed to upload logo.');
        } finally {
            setUploading(false);
        }
    };

    const onRemoveLogo = async () => {
        setUploading(true);
        setError('');
        setNotice('');

        try {
            const res = await fetch('/api/tenant/info/logo', {
                method: 'DELETE',
                headers: await authHeader()
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to remove logo.');

            setLogoUrl('');
            setNotice('Logo removed.');
        } catch (err) {
            setError(err?.message || 'Failed to remove logo.');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="platform-card" style={{ marginTop: '1.5rem' }}>
            <h2>Directory profile</h2>
            <p className="platform-subtitle">Share the details that appear in the public HIVE Directory.</p>

            {!canEdit ? (
                <p className="platform-message info">Only tenant owners and admins can edit the directory listing.</p>
            ) : loading ? (
                <p className="platform-subtitle">Loading...</p>
            ) : !tenant ? (
                <p className="platform-message info">No tenant membership found for this account.</p>
            ) : (
                <form className="contact-form directory-profile-form" onSubmit={onSubmit}>
                    <label>
                        Directory profile name
                        <input
                            type="text"
                            value={form.profile_name}
                            onChange={event => setForm(current => ({ ...current, profile_name: event.target.value }))}
                            placeholder={tenant?.name || 'Public name'}
                            disabled={saving}
                        />
                    </label>

                    <div className="directory-logo-row">
                        <div className="directory-logo-preview" aria-hidden="true">
                            {logoUrl ? (
                                <Image src={logoUrl} alt="" width={96} height={96} sizes="96px" unoptimized />
                            ) : (
                                <span>{getInitials(tenant?.name)}</span>
                            )}
                        </div>
                        <div className="directory-logo-actions">
                            <label className={`btn secondary directory-file-btn ${uploading ? 'is-busy' : ''}`}>
                                {uploading ? 'Uploading...' : 'Upload logo'}
                                <input type="file" accept="image/*" onChange={onLogoChange} disabled={uploading} />
                            </label>
                            {logoUrl ? (
                                <button className="btn ghost" type="button" onClick={onRemoveLogo} disabled={uploading}>
                                    Remove logo
                                </button>
                            ) : null}
                        </div>
                    </div>

                    <label>
                        About
                        <textarea
                            rows={4}
                            value={form.about}
                            onChange={event => setForm(current => ({ ...current, about: event.target.value }))}
                            placeholder="Tell the HIVE community what you build."
                            disabled={saving}
                        />
                    </label>

                    <label>
                        Key contact person
                        <input
                            type="text"
                            value={form.key_contact_name}
                            onChange={event => setForm(current => ({ ...current, key_contact_name: event.target.value }))}
                            placeholder="Name only (optional)"
                            disabled={saving}
                        />
                    </label>

                    <label>
                        Office location
                        <input
                            type="text"
                            value={form.office_location}
                            onChange={event => setForm(current => ({ ...current, office_location: event.target.value }))}
                            placeholder="e.g. Floor 2, Office 3"
                            disabled={saving}
                        />
                    </label>

                    <label>
                        Email
                        <input
                            type="email"
                            value={form.email}
                            onChange={event => setForm(current => ({ ...current, email: event.target.value }))}
                            placeholder="hello@team.com"
                            disabled={saving}
                        />
                    </label>

                    <label>
                        Website
                        <input
                            type="url"
                            value={form.website_url}
                            onChange={event => setForm(current => ({ ...current, website_url: event.target.value }))}
                            placeholder="https://yourcompany.com"
                            disabled={saving}
                        />
                    </label>

                    <label>
                        Phone
                        <input
                            type="tel"
                            value={form.phone}
                            onChange={event => setForm(current => ({ ...current, phone: event.target.value }))}
                            placeholder="+64 21 123 456"
                            disabled={saving}
                        />
                    </label>

                    {error && <p className="platform-message error">{error}</p>}
                    {notice && <p className="platform-message info">{notice}</p>}

                    <div className="platform-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                                type="checkbox"
                                checked={form.directory_enabled}
                                onChange={e => setForm(current => ({ ...current, directory_enabled: e.target.checked }))}
                                disabled={saving}
                            />
                            Show in public directory
                        </label>
                        <button className="btn primary" type="submit" disabled={saving}>
                            {saving ? 'Saving...' : 'Save profile'}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
