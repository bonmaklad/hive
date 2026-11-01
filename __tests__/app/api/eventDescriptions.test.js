import { POST } from '@/app/api/events/route';
import { PATCH } from '@/app/api/events/[id]/route';
import { createSupabaseAdminClient, getUserFromRequest } from '@/app/api/_lib/supabaseAuth';
import { requireTenantContext } from '@/app/api/rooms/_lib/tenantBilling';

jest.mock('@/app/api/_lib/supabaseAuth', () => ({ createSupabaseAdminClient: jest.fn(), getUserFromRequest: jest.fn() }));
jest.mock('@/app/api/rooms/_lib/tenantBilling', () => ({ requireTenantContext: jest.fn() }));

let saved;
let writes;

beforeEach(() => {
    saved = { id: 'event-1', organizer_id: 'member-1', tenant_id: 'tenant-1', title: 'Meetup', description: 'Original' };
    writes = [];
    const admin = {
        from(table) {
            const query = {
                select: () => query,
                eq: () => query,
                in: () => query,
                insert(values) { writes.push(values); saved = { ...saved, ...values }; return query; },
                update(values) { writes.push(values); saved = { ...saved, ...values }; return query; },
                maybeSingle: async () => ({ data: table === 'profiles' ? { is_admin: false } : saved, error: null }),
                single: async () => ({ data: saved, error: null }),
                then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); }
            };
            return query;
        }
    };
    createSupabaseAdminClient.mockReturnValue(admin);
    getUserFromRequest.mockResolvedValue({ user: { id: 'member-1' } });
    requireTenantContext.mockResolvedValue({ ok: true, user: { id: 'member-1' }, tenantId: 'tenant-1', admin });
});

function request(description) {
    const form = new FormData();
    form.set('title', 'Member meetup');
    form.set('description', description);
    form.set('starts_at', '2099-11-10T04:00:00Z');
    form.set('ends_at', '2099-11-10T05:00:00Z');
    return { formData: async () => form };
}

describe.each([['create', POST], ['edit', PATCH]])('%s event description', (_, handler) => {
    test('stores and returns long styled HTML without truncation or executable markup', async () => {
        const html = `<h2>Agenda</h2><p style="color:#123456" onclick="bad()">${'Details &amp; networking. '.repeat(200)}</p><script>bad()</script>`;
        const response = await handler(request(html), { params: { id: 'event-1' } });
        expect(response.status).toBe(200);
        expect(writes).toHaveLength(1);
        expect(writes[0].description.length).toBeGreaterThan(3000);
        expect(writes[0].description).toContain('<h2>Agenda</h2><p style="color:#123456">');
        expect(writes[0].description).not.toMatch(/script|onclick|bad\(\)/);
        expect((await response.json()).event.description).toBe(writes[0].description);
    });

    test.each(['<p><br></p>', '<script>bad()</script>', 'x'.repeat(50001)])('rejects empty or oversized markup before writing (%#)', async description => {
        const response = await handler(request(description), { params: { id: 'event-1' } });
        expect(response.status).toBe(400);
        expect(writes).toHaveLength(0);
    });
});
