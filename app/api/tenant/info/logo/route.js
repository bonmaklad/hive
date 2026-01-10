import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../../_lib/supabaseAuth';

export const runtime = 'nodejs';

const BUCKET = process.env.SUPABASE_TENANT_LOGOS_BUCKET || 'tenant-logos';

function safeText(value, limit = 400) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function guessContentType({ fileType, filename }) {
    const type = safeText(fileType, 100);
    if (type && type.startsWith('image/')) return type;
    const name = safeText(filename, 200).toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'svg') return 'image/svg+xml';
    if (ext === 'avif') return 'image/avif';
    if (ext === 'heic') return 'image/heic';
    return 'application/octet-stream';
}

function sanitizeFilename(name) {
    const base = safeText(name, 140);
    if (!base) return 'logo';
    return base
        .replace(/\\/g, '/')
        .split('/')
        .pop()
        .replace(/[^\w.\-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^\-+|\-+$/g, '') || 'logo';
}

function parseStorageObjectLocation(value) {
    const raw = safeText(value, 2000);
    if (!raw) return null;

    if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
        const pathOnly = raw.replace(/^\/+/, '');
        if (!pathOnly) return null;
        return { bucket: BUCKET, path: pathOnly };
    }

    let url = null;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }

    const pathname = url.pathname || '';
    const match = pathname.match(/\/storage\/v1\/object\/(public|sign)\/([^/]+)\/(.+)$/);
    if (!match) return null;

    const bucket = safeText(match[2], 200);
    let decoded = match[3] || '';
    try {
        decoded = decodeURIComponent(decoded);
    } catch {}
    const path = safeText(decoded, 2000).replace(/^\/+/, '');
    if (!bucket || !path) return null;
    return { bucket, path };
}

function resolveExistingObjectLocation(existing) {
    const bucket = safeText(existing?.logo_bucket, 200);
    const path = safeText(existing?.logo_path, 2000).replace(/^\/+/, '');
    if (path) return { bucket: bucket || BUCKET, path };
    return parseStorageObjectLocation(existing?.logo_url) || null;
}

async function ensureBucket(admin) {
    try {
        const { data, error } = await admin.storage.getBucket(BUCKET);
        if (error && !String(error?.message || '').toLowerCase().includes('not found')) {
            return { ok: false, error: error.message };
        }
        if (data) {
            if (data.public === false && typeof admin.storage.updateBucket === 'function') {
                try {
                    const { error: updateError } = await admin.storage.updateBucket(BUCKET, { public: true });
                    if (updateError) return { ok: false, error: updateError.message };
                } catch (e) {
                    return { ok: false, error: e?.message || 'Failed to update bucket visibility' };
                }
            }
            return { ok: true };
        }
    } catch {}

    try {
        const { error: createError } = await admin.storage.createBucket(BUCKET, { public: true });
        if (createError && !String(createError?.message || '').includes('already exists')) {
            return { ok: false, error: createError.message };
        }
        if (typeof admin.storage.updateBucket === 'function') {
            try {
                await admin.storage.updateBucket(BUCKET, { public: true });
            } catch {}
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e?.message || 'Failed to create bucket' };
    }
}

async function resolveTenantLink(admin, userId) {
    const { data, error } = await admin
        .from('tenant_users')
        .select('tenant_id, role, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);

    const list = Array.isArray(data) ? data : [];
    if (!list.length) return { tenantId: null, role: null };

    const owner = list.find(item => item.role === 'owner');
    const adminRole = list.find(item => item.role === 'admin');
    const chosen = owner || adminRole || list[0];

    return {
        tenantId: chosen?.tenant_id || null,
        role: chosen?.role || null
    };
}

async function loadProfile(admin, userId) {
    const { data, error } = await admin
        .from('profiles')
        .select('id, is_admin')
        .eq('id', userId)
        .maybeSingle();

    if (error) throw new Error(error.message);
    return data || null;
}

async function getExistingLogo(admin, tenantId) {
    const { data, error } = await admin
        .from('tenant_info')
        .select('logo_url, logo_bucket, logo_path')
        .eq('tenant_id', tenantId)
        .maybeSingle();

    if (error) throw new Error(error.message);
    return { logo_url: data?.logo_url ?? null, logo_bucket: data?.logo_bucket ?? null, logo_path: data?.logo_path ?? null };
}

async function updateTenantLogo(admin, tenantId, updates) {
    const { data, error } = await admin
        .from('tenant_info')
        .upsert({ tenant_id: tenantId, ...updates }, { onConflict: 'tenant_id' })
        .select('tenant_id, logo_url, logo_bucket, logo_path')
        .single();

    if (error) throw new Error(error.message);
    return data;
}

export async function POST(request) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const admin = createSupabaseAdminClient();

    try {
        const profile = await loadProfile(admin, user.id);
        const { tenantId, role } = await resolveTenantLink(admin, user.id);
        const canEdit = Boolean(profile?.is_admin || role === 'owner' || role === 'admin');

        if (!tenantId) return NextResponse.json({ error: 'No tenant membership found.' }, { status: 403 });
        if (!canEdit) return NextResponse.json({ error: 'Tenant admin access required.' }, { status: 403 });

        const bucketOk = await ensureBucket(admin);
        if (!bucketOk.ok) return NextResponse.json({ error: bucketOk.error || 'Storage not available.' }, { status: 500 });

        const form = await request.formData();
        const files = [...form.getAll('files[]'), ...form.getAll('files'), form.get('file')].filter(Boolean);
        const file = files.find(f => typeof f?.arrayBuffer === 'function') || null;
        if (!file) return NextResponse.json({ error: 'Provide a logo file to upload.' }, { status: 400 });

        const existing = await getExistingLogo(admin, tenantId);
        const existingLocation = resolveExistingObjectLocation(existing);

        const ab = await file.arrayBuffer();
        const safeName = sanitizeFilename(file?.name || 'logo');
        const uploadId = crypto.randomUUID();
        const path = `${tenantId}/${uploadId}-${safeName}`;
        const contentType = guessContentType({ fileType: file?.type, filename: safeName });

        const { error: upErr } = await admin.storage
            .from(BUCKET)
            .upload(path, ab, { contentType, upsert: true });
        if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

        const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
        const publicUrl = pub?.publicUrl || null;
        if (!publicUrl) return NextResponse.json({ error: 'Failed to compute public URL for uploaded logo.' }, { status: 500 });

        const updated = await updateTenantLogo(admin, tenantId, { logo_url: publicUrl, logo_bucket: BUCKET, logo_path: path });

        if (existingLocation?.bucket && existingLocation?.path) {
            try {
                await admin.storage.from(existingLocation.bucket).remove([existingLocation.path]);
            } catch {}
        }

        return NextResponse.json({ ok: true, logo_url: updated?.logo_url || publicUrl });
    } catch (err) {
        return NextResponse.json({ error: err?.message || 'Failed to upload logo.' }, { status: 500 });
    }
}

export async function DELETE(request) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const admin = createSupabaseAdminClient();

    try {
        const profile = await loadProfile(admin, user.id);
        const { tenantId, role } = await resolveTenantLink(admin, user.id);
        const canEdit = Boolean(profile?.is_admin || role === 'owner' || role === 'admin');

        if (!tenantId) return NextResponse.json({ error: 'No tenant membership found.' }, { status: 403 });
        if (!canEdit) return NextResponse.json({ error: 'Tenant admin access required.' }, { status: 403 });

        const existing = await getExistingLogo(admin, tenantId);
        const existingLocation = resolveExistingObjectLocation(existing);
        await updateTenantLogo(admin, tenantId, { logo_url: null, logo_bucket: null, logo_path: null });

        if (existingLocation?.bucket && existingLocation?.path) {
            try {
                await admin.storage.from(existingLocation.bucket).remove([existingLocation.path]);
            } catch {}
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        return NextResponse.json({ error: err?.message || 'Failed to delete logo.' }, { status: 500 });
    }
}
