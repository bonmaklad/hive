import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../_lib/supabaseAuth';

export const runtime = 'nodejs';

function safeText(value, limit = 160) {
    return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function normalizeEmail(value) {
    return safeText(value, 254).toLowerCase();
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function jsonError(message, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request) {
    try {
        const body = await request.json().catch(() => ({}));

        const email = normalizeEmail(body?.email);
        const personType = safeText(body?.personType || 'community', 50).toLowerCase();
        const firstName = safeText(body?.firstName, 80);
        const lastName = safeText(body?.lastName, 80);
        const company = safeText(body?.company, 120);
        const phone = safeText(body?.phone, 40);
        const source = safeText(body?.source || 'website', 80).toLowerCase();

        if (!isValidEmail(email)) {
            return jsonError('Enter a valid email address.', 400);
        }

        if (!personType) {
            return jsonError('Person type is required.', 400);
        }

        const admin = createSupabaseAdminClient();
        const now = new Date().toISOString();

        const { data: existing, error: existingError } = await admin
            .from('community_signups')
            .select('id')
            .eq('email_normalized', email)
            .eq('person_type', personType)
            .maybeSingle();

        if (existingError) {
            throw existingError;
        }

        if (existing?.id) {
            const updates = {
                source,
                status: 'active',
                last_seen_at: now
            };

            if (firstName) updates.first_name = firstName;
            if (lastName) updates.last_name = lastName;
            if (company) updates.company = company;
            if (phone) updates.phone = phone;

            const { error: updateError } = await admin
                .from('community_signups')
                .update(updates)
                .eq('id', existing.id);

            if (updateError) {
                throw updateError;
            }

            return NextResponse.json({
                ok: true,
                created: false,
                message: "Thanks, you're already on the list."
            });
        }

        const { error: insertError } = await admin.from('community_signups').insert({
            email,
            first_name: firstName || null,
            last_name: lastName || null,
            company: company || null,
            phone: phone || null,
            person_type: personType,
            source,
            status: 'active',
            last_seen_at: now
        });

        if (insertError) {
            if (insertError.code === '23505') {
                return NextResponse.json({
                    ok: true,
                    created: false,
                    message: "Thanks, you're already on the list."
                });
            }
            throw insertError;
        }

        return NextResponse.json({
            ok: true,
            created: true,
            message: "Thanks, you're on the list."
        });
    } catch (error) {
        console.error('Community signup failed', error);
        return jsonError('Could not save your signup right now. Please try again.', 500);
    }
}
