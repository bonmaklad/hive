import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../_lib/adminGuard';

export const runtime = 'nodejs';

const BUCKET = process.env.SUPABASE_WORK_UNITS_BUCKET || 'HIVE';

function safeText(value, limit = 400) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function sanitizeFilename(name) {
    const base = safeText(name, 140);
    if (!base) return 'image';
    return base
        .replace(/\\/g, '/')
        .split('/')
        .pop()
        .replace(/[^\w.\-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^\-+|\-+$/g, '') || 'image';
}

function isMissingColumnError(err, columnName) {
    const msg = String(err?.message || '').toLowerCase();
    const col = String(columnName || '').toLowerCase();
    if (!col) return false;
    const mentionsColumn = msg.includes(`'${col}'`) || msg.includes(`"${col}"`) || msg.includes(`.${col}`) || msg.includes(` ${col} `);
    if (!mentionsColumn) return false;
    return msg.includes('does not exist') || msg.includes('schema cache');
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
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e?.message || 'Failed to create bucket' };
    }
}

async function updateWorkUnitImageColumns({ admin, id, updates }) {
    const candidates = [updates];
    if (Object.prototype.hasOwnProperty.call(updates, 'image_bucket') || Object.prototype.hasOwnProperty.call(updates, 'image_path')) {
        const { image_bucket: _bucket, image_path: _path, ...withoutMeta } = updates;
        candidates.push(withoutMeta);
    }

    let lastError = null;
    for (const candidate of candidates) {
        try {
            const { data, error } = await admin.from('work_units').update(candidate).eq('id', id).select('*').single();
            if (error) throw new Error(error.message);
            return data;
        } catch (err) {
            lastError = err;
            const missing = isMissingColumnError(err, 'image_bucket') || isMissingColumnError(err, 'image_path') || isMissingColumnError(err, 'image');
            if (!missing) throw err;
        }
    }

    throw lastError || new Error('Failed to update work unit image.');
}

async function getExistingImage(admin, id) {
    const { data, error } = await admin
        .from('work_units')
        .select('image, image_bucket, image_path')
        .eq('id', id)
        .maybeSingle();
    if (error && isMissingColumnError(new Error(error.message), 'image_bucket')) {
        const { data: legacy, error: legacyError } = await admin.from('work_units').select('image').eq('id', id).maybeSingle();
        if (legacyError) throw new Error(legacyError.message);
        return { image: legacy?.image ?? null, image_bucket: null, image_path: null };
    }
    if (error) throw new Error(error.message);
    return { image: data?.image ?? null, image_bucket: data?.image_bucket ?? null, image_path: data?.image_path ?? null };
}

export async function POST(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const id = safeText(params?.id, 80);
    if (!id) return NextResponse.json({ error: 'Missing work unit id.' }, { status: 400 });

    const bucketOk = await ensureBucket(guard.admin);
    if (!bucketOk.ok) return NextResponse.json({ error: bucketOk.error || 'Storage not available.' }, { status: 500 });

    const form = await request.formData();
    const files = [...form.getAll('files[]'), ...form.getAll('files'), form.get('file')].filter(Boolean);
    const file = files.find(f => typeof f?.arrayBuffer === 'function') || null;

    if (!file) return NextResponse.json({ error: 'Provide a file to upload.' }, { status: 400 });

    const existing = await getExistingImage(guard.admin, id);

    const ab = await file.arrayBuffer();
    const safeName = sanitizeFilename(file?.name || 'image');
    const uploadId = crypto.randomUUID();
    const path = `work-units/${id}/${uploadId}-${safeName}`;

    const { error: upErr } = await guard.admin.storage
        .from(BUCKET)
        .upload(path, ab, { contentType: file?.type || 'application/octet-stream', upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { data: pub } = guard.admin.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub?.publicUrl || null;
    if (!publicUrl) return NextResponse.json({ error: 'Failed to compute public URL for uploaded image.' }, { status: 500 });

    const updated = await updateWorkUnitImageColumns({
        admin: guard.admin,
        id,
        updates: { image: publicUrl, image_bucket: BUCKET, image_path: path }
    });

    if (existing?.image_bucket && existing?.image_path) {
        try {
            await guard.admin.storage.from(existing.image_bucket).remove([existing.image_path]);
        } catch {}
    }

    return NextResponse.json({ ok: true, unit: updated });
}

export async function DELETE(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const id = safeText(params?.id, 80);
    if (!id) return NextResponse.json({ error: 'Missing work unit id.' }, { status: 400 });

    const existing = await getExistingImage(guard.admin, id);
    const updated = await updateWorkUnitImageColumns({
        admin: guard.admin,
        id,
        updates: { image: null, image_bucket: null, image_path: null }
    });

    if (existing?.image_bucket && existing?.image_path) {
        try {
            await guard.admin.storage.from(existing.image_bucket).remove([existing.image_path]);
        } catch {}
    }

    return NextResponse.json({ ok: true, unit: updated });
}

