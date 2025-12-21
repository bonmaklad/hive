import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseAuth';
import { stripeRequest } from '../../_lib/stripe';

export const runtime = 'nodejs';

function safeText(value, limit = 200) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

async function isAdminUser(admin, userId) {
    const { data, error } = await admin.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
    if (error) return false;
    return Boolean(data?.is_admin);
}

async function resolveStripeInvoiceUrl(invoiceNumber) {
    const number = safeText(invoiceNumber, 120);
    if (!number) return null;

    if (number.startsWith('stripe:')) {
        const stripeInvoiceId = number.slice('stripe:'.length);
        const invoice = await stripeRequest('GET', `/v1/invoices/${encodeURIComponent(stripeInvoiceId)}`);
        return invoice?.hosted_invoice_url || invoice?.invoice_pdf || null;
    }

    if (number.startsWith('stripe_session:')) {
        const sessionId = number.slice('stripe_session:'.length);
        const session = await stripeRequest('GET', `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
        const stripeInvoiceId = typeof session?.invoice === 'string' ? session.invoice : session?.invoice?.id;
        if (stripeInvoiceId) {
            const invoice = await stripeRequest('GET', `/v1/invoices/${encodeURIComponent(stripeInvoiceId)}`);
            return invoice?.hosted_invoice_url || invoice?.invoice_pdf || null;
        }
        return session?.url || null;
    }

    return null;
}

export async function GET(request) {
    const { user, error } = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error }, { status: 401 });

    const url = new URL(request.url);
    const invoiceId = safeText(url.searchParams.get('invoice_id'), 80);
    if (!invoiceId) return NextResponse.json({ error: 'invoice_id required.' }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const isAdmin = await isAdminUser(admin, user.id);

    const { data: inv, error: invError } = await admin
        .from('invoices')
        .select('id, owner_id, invoice_number')
        .eq('id', invoiceId)
        .maybeSingle();

    if (invError) return NextResponse.json({ error: invError.message }, { status: 500 });
    if (!inv) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    if (!isAdmin && inv.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

    try {
        const externalUrl = await resolveStripeInvoiceUrl(inv.invoice_number || '');
        if (!externalUrl) {
            return NextResponse.json({ error: 'No external invoice URL available for this invoice.' }, { status: 404 });
        }
        return NextResponse.json({ ok: true, url: externalUrl });
    } catch (err) {
        return NextResponse.json({ error: err?.message || 'Failed to load Stripe invoice.' }, { status: 500 });
    }
}

