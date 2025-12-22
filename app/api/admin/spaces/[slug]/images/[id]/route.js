import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../../_lib/adminGuard';

export const runtime = 'nodejs';

function safeText(value, limit = 400) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function toIntOrNull(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && !value.trim()) return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.floor(n);
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

export async function PATCH(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const slug = safeText(params?.slug, 80);
    const id = safeText(params?.id, 80);
    if (!slug) return NextResponse.json({ error: 'Missing space slug.' }, { status: 400 });
    if (!id) return NextResponse.json({ error: 'Missing image id.' }, { status: 400 });

    const payload = await request.json().catch(() => ({}));
    const updates = {};

    if (payload?.sort_order !== undefined) {
        const v = toIntOrNull(payload?.sort_order);
        if (v == null) return NextResponse.json({ error: 'sort_order must be a number.' }, { status: 400 });
        updates.sort_order = v;
    }
    if (payload?.alt !== undefined) {
        updates.alt = safeText(payload?.alt, 200) || null;
    }

    if (!Object.keys(updates).length && payload?.make_cover !== true) {
        return NextResponse.json({ error: 'No updates provided.' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await guard.admin
        .from('space_images')
        .update(updates)
        .eq('id', id)
        .eq('space_slug', slug)
        .select('id, url, sort_order, alt, bucket, path, created_at, updated_at')
        .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    if (payload?.make_cover === true) {
        const url = safeText(updated?.url, 2000);
        if (url) await guard.admin.from('spaces').update({ image: url }).eq('slug', slug);
    }

    return NextResponse.json({ ok: true, image: serializeImage(updated) });
}

export async function DELETE(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const slug = safeText(params?.slug, 80);
    const id = safeText(params?.id, 80);
    if (!slug) return NextResponse.json({ error: 'Missing space slug.' }, { status: 400 });
    if (!id) return NextResponse.json({ error: 'Missing image id.' }, { status: 400 });

    const { data: existing, error: fetchError } = await guard.admin
        .from('space_images')
        .select('id, url, bucket, path')
        .eq('id', id)
        .eq('space_slug', slug)
        .maybeSingle();
    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: 'Image not found.' }, { status: 404 });

    if (existing?.bucket && existing?.path) {
        try {
            await guard.admin.storage.from(existing.bucket).remove([existing.path]);
        } catch {
            // Best-effort cleanup only.
        }
    }

    const { error: delError } = await guard.admin.from('space_images').delete().eq('id', id).eq('space_slug', slug);
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });

    // If this image was the cover, pick a new cover (first image by sort_order) or clear it.
    const { data: space } = await guard.admin.from('spaces').select('image').eq('slug', slug).maybeSingle();
    const cover = safeText(space?.image, 2000);
    if (cover && cover === safeText(existing?.url, 2000)) {
        const { data: next } = await guard.admin
            .from('space_images')
            .select('url')
            .eq('space_slug', slug)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
        await guard.admin.from('spaces').update({ image: safeText(next?.url, 2000) || null }).eq('slug', slug);
    }

    return NextResponse.json({ ok: true });
}

