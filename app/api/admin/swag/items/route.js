import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/adminGuard';

export const runtime = 'nodejs';
const SWAG_BUCKET = process.env.SUPABASE_SWAG_BUCKET || process.env.SUPABASE_WORK_UNITS_BUCKET || 'HIVE';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function safeText(value, limit = 200) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function toInt(value, fallback = 0) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
}

function toBool(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    const v = safeText(value, 20).toLowerCase();
    if (!v) return fallback;
    if (['1', 'true', 'yes', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'off'].includes(v)) return false;
    return fallback;
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

async function parseCreatePayload(request) {
    const contentType = safeText(request.headers.get('content-type') || '', 200).toLowerCase();
    if (contentType.includes('multipart/form-data')) {
        const form = await request.formData();
        const tokensRaw = form.get('tokens_cost');
        const stockRaw = form.get('stock_qty');
        return {
            title: safeText(form.get('title'), 120),
            description: safeText(form.get('description'), 1200),
            image_url: safeText(form.get('image_url'), 1000) || null,
            image_file: firstUploadFile(form),
            tokens_cost: tokensRaw === null || (typeof tokensRaw === 'string' && !tokensRaw.trim()) ? NaN : toInt(tokensRaw, NaN),
            is_active: toBool(form.get('is_active'), true),
            stock_qty: stockRaw === null || (typeof stockRaw === 'string' && !stockRaw.trim()) ? 0 : toInt(stockRaw, 0),
            stock_unlimited: toBool(form.get('stock_unlimited'), false)
        };
    }

    const payload = await request.json().catch(() => ({}));
    return {
        title: safeText(payload?.title, 120),
        description: safeText(payload?.description, 1200),
        image_url: safeText(payload?.image_url, 1000) || null,
        image_file: null,
        tokens_cost: toInt(payload?.tokens_cost, NaN),
        is_active: payload?.is_active === undefined ? true : Boolean(payload?.is_active),
        stock_qty: toInt(payload?.stock_qty, 0),
        stock_unlimited: Boolean(payload?.stock_unlimited)
    };
}

export async function GET(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const { data, error } = await guard.admin
        .from('swag_items')
        .select('id, title, description, image_url, tokens_cost, stock_qty, stock_unlimited, is_active, created_at, updated_at')
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data || [] });
}

export async function POST(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const payload = await parseCreatePayload(request);
    const title = payload.title;
    const description = payload.description;
    const tokensCost = payload.tokens_cost;
    const isActive = payload.is_active;
    const stockQty = payload.stock_qty;
    const stockUnlimited = payload.stock_unlimited;
    const file = payload.image_file;

    if (!title) return NextResponse.json({ error: 'title is required.' }, { status: 400 });
    if (!Number.isFinite(tokensCost) || tokensCost < 0) {
        return NextResponse.json({ error: 'tokens_cost must be >= 0.' }, { status: 400 });
    }
    if (!Number.isFinite(stockQty) || stockQty < 0) {
        return NextResponse.json({ error: 'stock_qty must be >= 0.' }, { status: 400 });
    }
    if (!file && !payload.image_url) {
        return NextResponse.json({ error: 'Upload an image for the product.' }, { status: 400 });
    }

    const itemId = crypto.randomUUID();
    let imageUrl = payload.image_url;
    let uploadedPath = null;
    if (file) {
        const bucketOk = await ensureBucket(guard.admin);
        if (!bucketOk.ok) {
            return NextResponse.json({ error: bucketOk.error || 'Storage is not available.' }, { status: 500 });
        }

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
        imageUrl = safeText(publicData?.publicUrl, 2000) || null;
        if (!imageUrl) {
            try {
                await guard.admin.storage.from(SWAG_BUCKET).remove([path]);
            } catch {}
            return NextResponse.json({ error: 'Failed to create image URL after upload.' }, { status: 500 });
        }
        uploadedPath = path;
    }

    const { data, error } = await guard.admin
        .from('swag_items')
        .insert({
            id: itemId,
            title,
            description: description || null,
            image_url: imageUrl || null,
            tokens_cost: tokensCost,
            stock_qty: stockQty,
            stock_unlimited: stockUnlimited,
            is_active: isActive,
            created_by: guard.user.id
        })
        .select('id, title, description, image_url, tokens_cost, stock_qty, stock_unlimited, is_active, created_at, updated_at')
        .single();

    if (error) {
        if (uploadedPath) {
            try {
                await guard.admin.storage.from(SWAG_BUCKET).remove([uploadedPath]);
            } catch {}
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ item: data });
}
