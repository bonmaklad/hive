import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../_lib/adminGuard';
import { createSupabaseAdminClient } from '../../../../_lib/supabaseAuth';

const BUCKET = 'tenant-docs';

async function ensureBucket(admin) {
    try {
        const { data, error } = await admin.storage.getBucket(BUCKET);
        if (error && !String(error?.message || '').toLowerCase().includes('not found')) {
            // Unexpected error when getting bucket
            return { ok: false, error: error.message };
        }
        if (data) return { ok: true };
    } catch {
        // fall through to create
    }

    try {
        const { error: createError } = await admin.storage.createBucket(BUCKET, { public: false });
        if (createError && !String(createError?.message || '').includes('already exists')) {
            return { ok: false, error: createError.message };
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e?.message || 'Failed to create bucket' };
    }
}

async function ensureTenantFolder(admin, tenantId) {
    try {
        const path = `${tenantId}/.keep`;
        const { error: headErr } = await admin.storage.from(BUCKET).list(tenantId, { limit: 1 });
        // If folder missing or empty, attempt to upload placeholder (idempotent)
        const { error: uploadError } = await admin.storage
            .from(BUCKET)
            .upload(path, new Uint8Array(0), { contentType: 'text/plain', upsert: true });
        if (uploadError && !String(uploadError?.message || '').includes('duplicate')) {
            // ignore duplicate or existing
        }
    } catch {
        // ignore
    }
}

function serializeItem(item) {
    return {
        name: item?.name || null,
        size: item?.metadata?.size ?? null,
        updated_at: item?.updated_at || item?.created_at || null
    };
}

export async function GET(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) {
        return NextResponse.json({ error: guard.error }, { status: guard.status });
    }
    const admin = guard.admin || createSupabaseAdminClient();
    const tenantId = params?.id;
    if (!tenantId || typeof tenantId !== 'string') {
        return NextResponse.json({ error: 'Missing tenant id.' }, { status: 400 });
    }

    const bucketOk = await ensureBucket(admin);
    if (!bucketOk.ok) {
        return NextResponse.json({ error: bucketOk.error || 'Storage not available.' }, { status: 500 });
    }

    // Ensure tenant folder exists so users see it
    await ensureTenantFolder(admin, tenantId);

    try {
        const { data: list, error: listError } = await admin.storage
            .from(BUCKET)
            .list(tenantId, { limit: 500, sortBy: { column: 'name', order: 'asc' } });
        if (listError) throw listError;

        const files = (Array.isArray(list) ? list : [])
            .filter(it => it && it.name && (it?.metadata?.mimetype !== 'vnd.folder') && it.name !== '.keep')
            .map(serializeItem);

        const out = [];
        for (const f of files) {
            const path = `${tenantId}/${f.name}`;
            const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600);
            out.push({ ...f, url: signError ? null : (signed?.signedUrl || signed?.signed_url || null) });
        }

        return NextResponse.json({ files: out });
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Failed to list documents.' }, { status: 500 });
    }
}

export async function POST(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) {
        return NextResponse.json({ error: guard.error }, { status: guard.status });
    }
    const admin = guard.admin || createSupabaseAdminClient();
    const tenantId = params?.id;
    if (!tenantId || typeof tenantId !== 'string') {
        return NextResponse.json({ error: 'Missing tenant id.' }, { status: 400 });
    }

    const bucketOk = await ensureBucket(admin);
    if (!bucketOk.ok) {
        return NextResponse.json({ error: bucketOk.error || 'Storage not available.' }, { status: 500 });
    }

    try {
        const form = await request.formData();
        const entries = [];
        // Support both 'file' and 'files'
        for (const key of form.keys()) {
            if (key === 'file' || key === 'files' || key === 'files[]') {
                const values = form.getAll(key);
                for (const v of values) entries.push(v);
            }
        }
        if (!entries.length) {
            const single = form.get('file');
            if (single) entries.push(single);
        }
        if (!entries.length) {
            return NextResponse.json({ error: 'No files uploaded.' }, { status: 400 });
        }

        await ensureTenantFolder(admin, tenantId);

        const uploaded = [];
        for (const file of entries) {
            if (!file || typeof file?.arrayBuffer !== 'function') continue;
            const ab = await file.arrayBuffer();
            const path = `${tenantId}/${file.name}`;
            const { error: upErr } = await admin.storage
                .from(BUCKET)
                .upload(path, ab, { contentType: file.type || 'application/octet-stream', upsert: true });
            if (!upErr) uploaded.push(file.name);
        }

        return NextResponse.json({ uploaded });
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Failed to upload documents.' }, { status: 500 });
    }
}
