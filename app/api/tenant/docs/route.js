import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseAuth';

const BUCKET = 'tenant-docs';

async function ensureBucket(admin) {
    try {
        const { data, error } = await admin.storage.getBucket(BUCKET);
        if (error && !String(error?.message || '').toLowerCase().includes('not found')) {
            return { ok: false, error: error.message };
        }
        if (data) return { ok: true };
    } catch {}

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
        const { error: uploadError } = await admin.storage
            .from(BUCKET)
            .upload(path, new Uint8Array(0), { contentType: 'text/plain', upsert: true });
        if (uploadError && !String(uploadError?.message || '').includes('duplicate')) {
            // ignore most errors here
        }
    } catch {}
}

export async function GET(request) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const admin = createSupabaseAdminClient();

    // Find tenant for this user (prefer owner)
    const { data: rows, error: tuError } = await admin
        .from('tenant_users')
        .select('tenant_id, role, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
    if (tuError) return NextResponse.json({ error: tuError.message }, { status: 500 });

    const list = Array.isArray(rows) ? rows : [];
    const owner = list.find(r => r.role === 'owner');
    const tenantId = owner?.tenant_id || list[0]?.tenant_id || null;
    if (!tenantId) return NextResponse.json({ files: [] });

    const bucketOk = await ensureBucket(admin);
    if (!bucketOk.ok) return NextResponse.json({ error: bucketOk.error || 'Storage not available.' }, { status: 500 });

    await ensureTenantFolder(admin, tenantId);

    try {
        const { data: files, error: listError } = await admin.storage
            .from(BUCKET)
            .list(tenantId, { limit: 500, sortBy: { column: 'name', order: 'asc' } });
        if (listError) throw listError;

        const visible = (Array.isArray(files) ? files : [])
            .filter(f => f?.name && (f?.metadata?.mimetype !== 'vnd.folder') && f.name !== '.keep');

        const out = [];
        for (const f of visible) {
            const path = `${tenantId}/${f.name}`;
            const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600);
            out.push({
                name: f.name,
                size: f?.metadata?.size ?? null,
                updated_at: f?.updated_at || f?.created_at || null,
                url: signError ? null : (signed?.signedUrl || signed?.signed_url || null)
            });
        }
        return NextResponse.json({ files: out });
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Failed to load documents.' }, { status: 500 });
    }
}
