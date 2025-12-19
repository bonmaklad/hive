import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseAuth';

export const runtime = 'nodejs';

function safeQuery(value) {
    const q = typeof value === 'string' ? value.trim() : '';
    if (q.length < 1) return '';
    if (q.length > 64) return q.slice(0, 64);
    return q;
}

export async function GET(request) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error }, { status: 401 });
    }

    const url = new URL(request.url);
    const q = safeQuery(url.searchParams.get('q'));
    if (!q) {
        return NextResponse.json({ results: [] });
    }

    const supabase = createSupabaseAdminClient();

    const { data, error: searchError } = await supabase
        .from('profiles')
        .select('id, name, email')
        .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
        .order('name', { ascending: true })
        .limit(10);

    if (searchError) {
        return NextResponse.json({ error: searchError.message }, { status: 500 });
    }

    const results = (data || [])
        .filter(p => p?.id && p.id !== user.id)
        .map(p => ({
            id: p.id,
            name: p.name || '',
            email: p.email || ''
        }));

    return NextResponse.json({ results });
}
