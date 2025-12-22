import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../_lib/adminGuard';

export const runtime = 'nodejs';

const BUCKET = process.env.SUPABASE_SPACES_BUCKET || 'HIVE';

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

async function ensureBucket(admin) {
    try {
        const { data, error } = await admin.storage.getBucket(BUCKET);
        if (error && !String(error?.message || '').toLowerCase().includes('not found')) {
            return { ok: false, error: error.message };
        }
        if (data) {
            // If the bucket already exists but is private, images won't render on the public website.
            // Best-effort flip it to public using the service role.
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

async function getNextSortOrder(admin, slug) {
    const { data } = await admin
        .from('space_images')
        .select('sort_order')
        .eq('space_slug', slug)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();
    const current = Number(data?.sort_order || 0);
    return Number.isFinite(current) ? current + 1 : 0;
}

function serializeImage(row) {
    return {
        id: row?.id || null,
        url: row?.url || null,
        sort_order: row?.sort_order ?? 0,
        alt: row?.alt || null,
        bucket: row?.bucket || null,
        path: row?.path || null,
        created_at: row?.created_at || null,
        updated_at: row?.updated_at || null
    };
}

export async function GET(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const slug = safeText(params?.slug, 80);
    if (!slug) return NextResponse.json({ error: 'Missing space slug.' }, { status: 400 });

    const { data, error } = await guard.admin
        .from('space_images')
        .select('id, url, sort_order, alt, bucket, path, created_at, updated_at')
        .eq('space_slug', slug)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, images: (data || []).map(serializeImage) });
}

export async function POST(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const slug = safeText(params?.slug, 80);
    if (!slug) return NextResponse.json({ error: 'Missing space slug.' }, { status: 400 });

    const bucketOk = await ensureBucket(guard.admin);
    if (!bucketOk.ok) return NextResponse.json({ error: bucketOk.error || 'Storage not available.' }, { status: 500 });

    const form = await request.formData();
    const externalUrl = safeText(form.get('url'), 2000);
    const alt = safeText(form.get('alt'), 200);
    const makeCover = safeText(form.get('make_cover'), 10).toLowerCase() === 'true';

    // IMPORTANT: `form.keys()` yields duplicate keys when multiple files share the same name,
    // so avoid iterating keys and instead read known fields directly.
    const files = [
        ...form.getAll('files[]'),
        ...form.getAll('files'),
        ...form.getAll('file')
    ];

    if (!files.length && !externalUrl) {
        return NextResponse.json({ error: 'Provide at least one file or a url.' }, { status: 400 });
    }

    const created = [];
    let sortOrder = await getNextSortOrder(guard.admin, slug);

    if (externalUrl) {
        const { data, error } = await guard.admin
            .from('space_images')
            .insert({
                space_slug: slug,
                url: externalUrl,
                sort_order: sortOrder,
                alt: alt || null,
                bucket: null,
                path: null
            })
            .select('id, url, sort_order, alt, bucket, path, created_at, updated_at')
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        created.push(serializeImage(data));
        sortOrder += 1;
    }

    for (const file of files) {
        if (!file || typeof file?.arrayBuffer !== 'function') continue;
        const ab = await file.arrayBuffer();
        const safeName = sanitizeFilename(file?.name || 'image');
        const id = crypto.randomUUID();
        const path = `spaces/${slug}/${id}-${safeName}`;
        const { error: upErr } = await guard.admin.storage
            .from(BUCKET)
            .upload(path, ab, { contentType: file?.type || 'application/octet-stream', upsert: true });
        if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

        const { data: pub } = guard.admin.storage.from(BUCKET).getPublicUrl(path);
        const publicUrl = pub?.publicUrl || null;
        if (!publicUrl) return NextResponse.json({ error: 'Failed to compute public URL for uploaded image.' }, { status: 500 });

        const { data, error } = await guard.admin
            .from('space_images')
            .insert({
                space_slug: slug,
                url: publicUrl,
                sort_order: sortOrder,
                alt: alt || null,
                bucket: BUCKET,
                path
            })
            .select('id, url, sort_order, alt, bucket, path, created_at, updated_at')
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        created.push(serializeImage(data));
        sortOrder += 1;
    }

    if (created.length) {
        const { data: space } = await guard.admin.from('spaces').select('image').eq('slug', slug).maybeSingle();
        const currentCover = safeText(space?.image, 1000);
        const nextCover = created[0]?.url || null;
        if ((makeCover && nextCover) || (!currentCover && nextCover)) {
            await guard.admin.from('spaces').update({ image: nextCover }).eq('slug', slug);
        }
    }

    return NextResponse.json({ ok: true, images: created });
}
