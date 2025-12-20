import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseAuth';

export const runtime = 'nodejs';

function safeText(value: unknown, limit = 200) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

async function requireSiteAccess({ request, siteId }: { request: Request; siteId: string }) {
    const { user, error: authError } = await getUserFromRequest(request);
    if (!user) return { ok: false as const, status: 401, error: authError || 'Unauthorized' };

    const admin = createSupabaseAdminClient();

    const { data: site, error: siteError } = await admin.from('sites').select('id, owner_id').eq('id', siteId).maybeSingle();
    if (siteError) return { ok: false as const, status: 500, error: siteError.message };
    if (!site) return { ok: false as const, status: 404, error: 'Site not found.' };

    if (site.owner_id === user.id) return { ok: true as const, admin, user, site, isAdmin: false };

    const { data: profile, error: profileError } = await admin.from('profiles').select('id, is_admin').eq('id', user.id).maybeSingle();
    if (profileError) return { ok: false as const, status: 500, error: profileError.message };
    if (!profile?.is_admin) return { ok: false as const, status: 403, error: 'Not allowed.' };

    return { ok: true as const, admin, user, site, isAdmin: true };
}

function extractOutputText(json: any) {
    if (typeof json?.output_text === 'string') return json.output_text;
    const outputs = Array.isArray(json?.output) ? json.output : [];
    for (const out of outputs) {
        const content = Array.isArray(out?.content) ? out.content : [];
        for (const c of content) {
            if (c?.type === 'output_text' && typeof c?.text === 'string') return c.text;
        }
    }
    return '';
}

export async function POST(request: Request) {
    const payload = await request.json().catch(() => ({}));
    const siteId = safeText(payload?.siteId || payload?.site_id, 80);
    const path = safeText(payload?.path, 2000);
    const content = typeof payload?.content === 'string' ? payload.content : '';
    const instruction = typeof payload?.instruction === 'string' ? payload.instruction : '';

    if (!siteId) return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 });
    if (!instruction) return NextResponse.json({ error: 'instruction is required' }, { status: 400 });

    const guard = await requireSiteAccess({ request, siteId });
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const apiKey = process.env.OPENAI_API_KEY || process.env.HIVE_OPENAI_API_KEY || '';
    if (!apiKey) {
        return NextResponse.json(
            { error: 'AI is not configured.', detail: 'Set `OPENAI_API_KEY` (or `HIVE_OPENAI_API_KEY`) on the Next.js server.' },
            { status: 501 }
        );
    }

    const model = process.env.HIVE_AI_MODEL || 'gpt-4o-mini';

    const prompt = [
        `You are an AI coding assistant.`,
        `Return ONLY a unified diff that edits exactly one file: ${path}`,
        `Do not include explanations, code fences, or multiple files.`,
        ``,
        `Instruction:`,
        instruction,
        ``,
        `Current file content:`,
        content
    ].join('\n');

    const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model,
            input: prompt,
            max_output_tokens: 900
        })
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
        return NextResponse.json({ error: 'AI request failed.', detail: json?.error?.message || null }, { status: 502 });
    }

    const diff = extractOutputText(json).trim();
    if (!diff) return NextResponse.json({ error: 'AI returned empty output.' }, { status: 502 });

    return NextResponse.json({ diff });
}
