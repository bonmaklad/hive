/** @jest-environment jsdom */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EventCalendarClient from '@/app/events/EventCalendarClient';
import { HIVE_LOCATION } from '@/lib/eventOptions';

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

test.each([
    ['No room', '', 'true'],
    ['Hive Lounge', 'hive-lounge', null]
])('event editors can select %s when rescheduling a HIVE event', async (roomName, roomSlug, unlink) => {
    const user = userEvent.setup();
    const startsAt = new Date();
    startsAt.setHours(13, 0, 0, 0);
    const endsAt = new Date(startsAt);
    endsAt.setHours(14);
    let saved = {
        id: 'linked-event',
        title: 'HIVE meetup',
        description: '<p>Meet at HIVE</p>',
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        location_address: HIVE_LOCATION.address,
        room_booking_id: 'linked-room',
        room_booking_title: 'Nikau Room',
        room_booking_space_slug: 'nikau-room',
        can_edit: true
    };
    let submitted;
    global.fetch = jest.fn(async (url, options = {}) => {
        if (options.method === 'PATCH') {
            submitted = options.body;
            saved = { ...saved, starts_at: submitted.get('starts_at'), ends_at: submitted.get('ends_at') };
            return { ok: true, json: async () => ({ event: saved }) };
        }
        if (url === '/api/events/rooms') {
            return { ok: true, json: async () => ({ spaces: [
                { slug: 'nikau-room', title: 'Nikau Room' }, { slug: 'hive-lounge', title: 'Hive Lounge' }
            ] }) };
        }
        return { ok: true, json: async () => url.includes('/rsvps') ? { rsvps: [] } : { events: [saved], spaces: [] } };
    });

    render(<EventCalendarClient audience="member" canCreate />);
    await user.click(await screen.findByRole('button', { name: /HIVE meetup/ }));
    const details = await screen.findByRole('complementary', { name: 'Event details' });
    await user.click(within(details).getByRole('button', { name: 'Edit', exact: true }));
    const rooms = screen.getByRole('combobox', { name: 'Room', exact: true });
    expect(rooms.value).toBe('nikau-room');
    const startDateInput = screen.getByTestId('event-start-date');
    const dayBefore = new Date(startDateInput.value);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    const newDate = dayBefore.toISOString().slice(0, 10);
    fireEvent.change(startDateInput, { target: { value: newDate } });
    expect(screen.getByTestId('event-end-date').value).toBe(newDate);
    await user.selectOptions(rooms, within(rooms).getByRole('option', { name: roomName }));
    await user.click(screen.getByRole('button', { name: 'Update event', exact: true }));

    expect(submitted.get('location_mode')).toBe('hive');
    expect(submitted.get('starts_at')).toBe(new Date(`${newDate}T13:00`).toISOString());
    expect(submitted.get('ends_at')).toBe(new Date(`${newDate}T14:00`).toISOString());
    expect(submitted.get('space_slug')).toBe(roomSlug || null);
    expect(submitted.get('unlink_room_booking')).toBe(unlink);
    expect(submitted.has('booking_date')).toBe(false);
});
