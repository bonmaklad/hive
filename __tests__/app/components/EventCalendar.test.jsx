/** @jest-environment jsdom */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EventCalendarClient from '@/app/events/EventCalendarClient';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
jest.mock('next/dynamic', () => () => require('@/app/components/EventDescriptionEditor').default);
jest.mock('@/lib/supabase/browser', () => ({
    createSupabaseBrowserClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) } })
}));

test('members create a formatted event, see its design and reopen it for editing', async () => {
    const user = userEvent.setup();
    let saved = null;
    const writes = [];
    global.fetch = jest.fn(async (url, options = {}) => {
        if (options.method === 'POST' || options.method === 'PATCH') {
            writes.push(options.body.get('description'));
            saved = { ...Object.fromEntries(options.body), id: 'test-event', can_edit: true, topics: [], organizer: { name: 'Test member' } };
            return { ok: true, json: async () => ({ event: saved }) };
        }
        return { ok: true, json: async () => url.includes('/rsvps') ? { rsvps: [] } : { events: saved ? [saved] : [], spaces: [] } };
    });
    const { unmount } = render(<EventCalendarClient audience="member" canCreate />);
    await user.click(await screen.findByRole('button', { name: 'Add event', exact: true }));
    await user.type(screen.getByLabelText('Title'), 'Member meetup');
    await user.click(screen.getByRole('button', { name: 'HTML', exact: true }));
    const html = '<h2>Welcome members</h2><p style="color:#6fffb6"><strong>Bring ideas</strong><br>See you there</p><ul><li>Networking</li></ul>';
    fireEvent.change(screen.getByRole('textbox', { name: 'Description HTML' }), { target: { value: html } });
    await user.click(screen.getByRole('button', { name: 'Save event', exact: true }));
    const details = await screen.findByRole('complementary', { name: 'Event details' });
    expect(within(details).getByRole('heading', { name: 'Welcome members' })).toBeTruthy();
    expect(details.querySelector('strong').textContent).toBe('Bring ideas');
    expect(writes).toEqual([html]);
    await user.click(within(details).getByRole('button', { name: 'Edit', exact: true }));
    await user.click(screen.getByRole('button', { name: 'HTML', exact: true }));
    expect(screen.getByRole('textbox', { name: 'Description HTML' }).value).toBe(html);
    const updated = html.replace('Bring ideas', 'Bring questions');
    fireEvent.change(screen.getByRole('textbox', { name: 'Description HTML' }), { target: { value: updated } });
    await user.click(screen.getByRole('button', { name: 'Update event', exact: true }));
    expect(await screen.findByText('Bring questions', { selector: 'strong' })).toBeTruthy();
    expect(writes).toEqual([html, updated]);
    unmount();
});
