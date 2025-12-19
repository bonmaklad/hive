import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createSupabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseAuth';

export const runtime = 'nodejs';

function getSiteUrl() {
    return (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(
        /\/$/,
        ''
    );
}

function getFromEmail() {
    return process.env.RESEND_FROM || 'HIVE HQ <no-reply@hivehq.nz>';
}

function chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
    return chunks;
}

export async function POST(request) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error }, { status: 401 });
    }

    if (!process.env.RESEND_API_KEY) {
        return NextResponse.json({ error: 'Missing RESEND_API_KEY' }, { status: 500 });
    }

    const body = await request.json().catch(() => null);
    const messageId = body?.message_id;
    const mentionEveryone = Boolean(body?.mention_everyone);
    const mentionedUserIds = Array.isArray(body?.mentioned_user_ids) ? body.mentioned_user_ids.filter(Boolean) : [];

    if (!messageId) {
        return NextResponse.json({ error: 'Missing message_id' }, { status: 400 });
    }

    if (!mentionEveryone && mentionedUserIds.length === 0) {
        return NextResponse.json({ ok: true, sent: 0 });
    }

    const admin = createSupabaseAdminClient();

    const { data: senderProfile } = await admin
        .from('profiles')
        .select('id, name, email, is_admin')
        .eq('id', user.id)
        .maybeSingle();

    const senderName = senderProfile?.name || user.user_metadata?.name || user.email || 'HIVE HQ member';
    const senderIsAdmin = Boolean(senderProfile?.is_admin);

    if (mentionEveryone && !senderIsAdmin) {
        return NextResponse.json({ error: 'Only admins can use @everyone.' }, { status: 403 });
    }

    const { data: messageRow, error: messageError } = await admin
        .from('chat_messages')
        .select('id, body, created_at')
        .eq('id', messageId)
        .single();

    if (messageError) {
        return NextResponse.json({ error: messageError.message }, { status: 404 });
    }

    const siteUrl = getSiteUrl();
    const link = `${siteUrl}/platform?chat=1`;

    let recipients = [];
    if (mentionEveryone) {
        const { data, error: recError } = await admin.from('profiles').select('id, email, name').not('email', 'is', null);
        if (recError) return NextResponse.json({ error: recError.message }, { status: 500 });
        recipients = (data || []).filter(p => p.id !== user.id);
    } else {
        const unique = Array.from(new Set(mentionedUserIds)).slice(0, 25);
        const { data, error: recError } = await admin.from('profiles').select('id, email, name').in('id', unique);
        if (recError) return NextResponse.json({ error: recError.message }, { status: 500 });
        recipients = (data || []).filter(p => p.id !== user.id);
    }

    const toEmails = recipients.map(r => r.email).filter(Boolean);

    if (!toEmails.length) {
        return NextResponse.json({ ok: true, sent: 0 });
    }

    if (toEmails.length > 200) {
        return NextResponse.json({ error: 'Too many recipients for @everyone.' }, { status: 400 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const subject = mentionEveryone
        ? `New announcement on HIVE HQ`
        : `You were mentioned on HIVE HQ`;

    const preview = String(messageRow.body || '').slice(0, 240);

    const html = `
        <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
            <h2 style="margin:0 0 12px;">HIVE HQ</h2>
            <p style="margin:0 0 12px;">
                ${mentionEveryone ? 'New announcement' : 'You were mentioned'} by <strong>${senderName}</strong>.
            </p>
            <div style="margin:0 0 16px; padding:12px 14px; border:1px solid #e5e7eb; border-radius:12px;">
                <div style="white-space:pre-wrap;">${preview.replace(/</g, '&lt;')}</div>
            </div>
            <p style="margin:0 0 16px;">
                <a href="${link}">Open HIVE HQ</a>
            </p>
            <p style="margin:0; color:#6b7280; font-size:12px;">
                You received this because you are a HIVE HQ member.
            </p>
        </div>
    `;

    let sent = 0;
    for (const batch of chunk(toEmails, 25)) {
        // Send per-batch (Resend supports array)
        // Note: this reveals recipients to each other if sent as multi-"to".
        // If you want privacy, send individually.
        const results = await Promise.allSettled(
            batch.map(to =>
                resend.emails.send({
                    from: getFromEmail(),
                    to,
                    subject,
                    html
                })
            )
        );
        sent += results.filter(r => r.status === 'fulfilled').length;
    }

    return NextResponse.json({ ok: true, sent });
}

