import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../../_lib/adminGuard';

export const runtime = 'nodejs';

const SWAG_BUCKET = process.env.SUPABASE_SWAG_BUCKET || process.env.SUPABASE_WORK_UNITS_BUCKET || 'HIVE';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function safeText(value, limit = 200) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function sanitizeFilename(name) {
    const base = safeText(name, 140);
    if (!base) return 'image';
    return (
        base
            .replace(/\\/g, '/')
            .split('/')
            .pop()
            .replace(/[^\w.\-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^\-+|\-+$/g, '') || 'image'
    );
}

function guessContentType({ fileType, filename }) {
    const type = safeText(fileType, 100).toLowerCase();
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

function firstUploadFile(form) {
    const candidate = form.get('image') || form.get('file') || form.get('files[]') || form.get('files');
    if (typeof candidate?.arrayBuffer !== 'function') return null;
    return candidate;
}

function parseStorageObjectLocation(value) {
    const raw = safeText(value, 2000);
    if (!raw) return null;

    if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
        const pathOnly = raw.replace(/^\/+/, '');
        if (!pathOnly) return null;
        return { bucket: SWAG_BUCKET, path: pathOnly };
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

async function ensureBucket(admin) {
    try {
        const { data, error } = await admin.storage.getBucket(SWAG_BUCKET);
        if (error && !String(error?.message || '').toLowerCase().includes('not found')) {
            return { ok: false, error: error.message };
        }
        if (data) {
            if (data.public === false && typeof admin.storage.updateBucket === 'function') {
                try {
                    const { error: updateError } = await admin.storage.updateBucket(SWAG_BUCKET, { public: true });
                    if (updateError) return { ok: false, error: updateError.message };
                } catch (e) {
                    return { ok: false, error: e?.message || 'Failed to update bucket visibility.' };
                }
            }
            return { ok: true };
        }
    } catch {}

    try {
        const { error: createError } = await admin.storage.createBucket(SWAG_BUCKET, { public: true });
        if (createError && !String(createError?.message || '').toLowerCase().includes('already exists')) {
            return { ok: false, error: createError.message };
        }
        if (typeof admin.storage.updateBucket === 'function') {
            try {
                await admin.storage.updateBucket(SWAG_BUCKET, { public: true });
            } catch {}
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e?.message || 'Failed to create bucket.' };
    }
}

export async function POST(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const itemId = safeText(params?.id, 80);
    if (!itemId) return NextResponse.json({ error: 'Missing item id.' }, { status: 400 });

    const { data: existing, error: existingError } = await guard.admin
        .from('swag_items')
        .select('id, image_url')
        .eq('id', itemId)
        .maybeSingle();
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
    if (!existing?.id) return NextResponse.json({ error: 'SWAG item not found.' }, { status: 404 });

    const bucketOk = await ensureBucket(guard.admin);
    if (!bucketOk.ok) return NextResponse.json({ error: bucketOk.error || 'Storage is not available.' }, { status: 500 });

    const form = await request.formData();
    const file = firstUploadFile(form);
    if (!file) return NextResponse.json({ error: 'Upload an image file.' }, { status: 400 });

    const safeName = sanitizeFilename(file?.name || 'image');
    const contentType = guessContentType({ fileType: file?.type, filename: safeName });
    if (!contentType.startsWith('image/')) {
        return NextResponse.json({ error: 'Only image uploads are supported.' }, { status: 400 });
    }

    const ab = await file.arrayBuffer();
    if (ab.byteLength > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: 'Image is too large. Use a file up to 10MB.' }, { status: 400 });
    }

    const uploadId = crypto.randomUUID();
    const path = `swag/${itemId}/${uploadId}-${safeName}`;
    const { error: uploadError } = await guard.admin.storage.from(SWAG_BUCKET).upload(path, ab, { contentType, upsert: true });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: publicData } = guard.admin.storage.from(SWAG_BUCKET).getPublicUrl(path);
    const imageUrl = safeText(publicData?.publicUrl, 2000) || null;
    if (!imageUrl) {
        try {
            await guard.admin.storage.from(SWAG_BUCKET).remove([path]);
        } catch {}
        return NextResponse.json({ error: 'Failed to create image URL after upload.' }, { status: 500 });
    }

    const { data: updated, error: updateError } = await guard.admin
        .from('swag_items')
        .update({ image_url: imageUrl })
        .eq('id', itemId)
        .select('id, title, description, image_url, tokens_cost, stock_qty, stock_unlimited, is_active, created_at, updated_at')
        .single();

    if (updateError) {
        try {
            await guard.admin.storage.from(SWAG_BUCKET).remove([path]);
        } catch {}
        return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const oldLocation = parseStorageObjectLocation(existing?.image_url);
    if (oldLocation?.bucket && oldLocation?.path) {
        try {
            await guard.admin.storage.from(oldLocation.bucket).remove([oldLocation.path]);
        } catch {}
    }

    return NextResponse.json({ item: updated });
}
