/** @jest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminSpacesPage from '@/app/platform/admin/spaces/page';
import { usePlatformSession } from '@/app/platform/PlatformContext';

jest.mock('@/app/platform/PlatformContext', () => ({ usePlatformSession: jest.fn() }));

let spaces;
let mutations;

beforeEach(() => {
    spaces = [{ slug: 'nikau-room', title: 'Nikau Room', is_visible: true, tokens_per_hour: 1, images: [] }];
    mutations = [];
    usePlatformSession.mockReturnValue({
        supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) } }
    });
    global.fetch = jest.fn(async (url, options = {}) => {
        if (options.method === 'PATCH') {
            const payload = JSON.parse(options.body);
            mutations.push(payload);
            spaces[0] = { ...spaces[0], ...payload };
            return { ok: true, json: async () => ({ space: spaces[0] }) };
        }
        if (options.method === 'DELETE') {
            spaces = [];
            return { ok: true, json: async () => ({ ok: true }) };
        }
        return { ok: true, json: async () => ({ spaces: spaces.slice() }) };
    });
});

afterEach(() => jest.restoreAllMocks());

test('admins can hide and show a selected space without deleting it', async () => {
    const user = userEvent.setup();
    render(<AdminSpacesPage />);
    await user.click(await screen.findByRole('button', { name: 'Hide from website' }));
    expect(mutations).toEqual([{ is_visible: false }]);
    await user.click(await screen.findByRole('button', { name: 'Show on website' }));
    expect(mutations).toEqual([{ is_visible: false }, { is_visible: true }]);
    expect(spaces).toHaveLength(1);
});

test('saving edits keeps a hidden space hidden and its slug locked', async () => {
    spaces[0].is_visible = false;
    const user = userEvent.setup();
    render(<AdminSpacesPage />);
    const title = await screen.findByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Updated Room');
    expect(screen.getByLabelText(/Slug/).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mutations).toHaveLength(1));
    expect(mutations[0]).toMatchObject({ slug: 'nikau-room', title: 'Updated Room', is_visible: false });
});

test('deleting the last space clears the editor and explains booking retention', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<AdminSpacesPage />);
    await user.click(await screen.findByRole('button', { name: 'Delete space' }));
    expect(confirm.mock.calls[0][0]).toContain('Existing bookings will be kept.');
    await screen.findByText('Select a space or create a new one.');
    expect(screen.queryByRole('button', { name: 'Delete space' })).toBeNull();
    expect(spaces).toEqual([]);
});
