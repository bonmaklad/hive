import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../../_lib/supabaseAuth';

export const runtime = 'nodejs';

function safeText(value, limit = 2000) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

async function canModerate({ admin, userId }) {
    try {
        const { data } = await admin.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
        return Boolean(data?.is_admin);
    } catch (_) {
        return false;
    }
}

export async function PATCH(request, { params }) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const id = safeText(params?.id, 80);
    if (!id) return NextResponse.json({ error: 'Missing message id.' }, { status: 400 });

    const payload = await request.json().catch(() => ({}));
    const body = safeText(payload?.body, 2000);
    if (!body) return NextResponse.json({ error: 'Message body is required.' }, { status: 400 });

    const admin = createSupabaseAdminClient();

    const { data: existing, error: loadError } = await admin.from('chat_messages').select('id, user_id').eq('id', id).maybeSingle();
    if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });

    const isOwner = existing.user_id === user.id;
    const isAdmin = await canModerate({ admin, userId: user.id });
    if (!isOwner && !isAdmin) return NextResponse.json({ error: 'You can only edit your own messages.' }, { status: 403 });

    const { data: updated, error: updateError } = await admin
        .from('chat_messages')
        .update({ body })
        .eq('id', id)
        .select('id, user_id, user_name, body, created_at')
        .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({ ok: true, message: updated });
}

export async function DELETE(request, { params }) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const id = safeText(params?.id, 80);
    if (!id) return NextResponse.json({ error: 'Missing message id.' }, { status: 400 });

    const admin = createSupabaseAdminClient();

    const { data: existing, error: loadError } = await admin.from('chat_messages').select('id, user_id').eq('id', id).maybeSingle();
    if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });

    const isOwner = existing.user_id === user.id;
    const isAdmin = await canModerate({ admin, userId: user.id });
    if (!isOwner && !isAdmin) return NextResponse.json({ error: 'You can only delete your own messages.' }, { status: 403 });

    const { error: deleteError } = await admin.from('chat_messages').delete().eq('id', id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    return NextResponse.json({ ok: true });
}

