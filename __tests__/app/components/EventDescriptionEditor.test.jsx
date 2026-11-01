/** @jest-environment jsdom */
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EventDescriptionEditor from '@/app/components/EventDescriptionEditor';
import EventDescription from '@/app/components/EventDescription';

beforeAll(() => {
    // jsdom has no layout hit testing; ProseMirror uses this on mouse down.
    document.elementFromPoint = () => null;
    Range.prototype.getClientRects = () => [];
    Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
});

function EditorHarness({ initial = '' }) {
    const [value, setValue] = useState(initial);
    return <EventDescriptionEditor value={value} onChange={setValue} />;
}

test('pastes HTML, previews the design and reopens visual mode without losing source', async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);
    await user.click(screen.getByRole('button', { name: 'HTML', exact: true }));
    const html = '<div style="padding:16px"><h2>Member meetup</h2><p style="text-align:center"><strong>Welcome</strong><br>Bring ideas</p><table><tbody><tr><td>5pm</td></tr></tbody></table></div>';
    fireEvent.change(screen.getByRole('textbox', { name: 'Description HTML' }), { target: { value: html } });
    await user.click(screen.getByRole('button', { name: 'Preview', exact: true }));
    const heading = screen.getByRole('heading', { name: 'Member meetup' });
    expect(heading.parentElement.style.padding).toBe('16px');
    expect(screen.getByRole('cell', { name: '5pm' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Design', exact: true }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Description' }).querySelector('h2').textContent).toBe('Member meetup'));
    await user.click(screen.getByRole('button', { name: 'HTML', exact: true }));
    expect(screen.getByRole('textbox', { name: 'Description HTML' }).value).toBe(html);
});

test('visual editor applies toolbar formatting and supports undo', async () => {
    const user = userEvent.setup();
    render(<EditorHarness initial="Welcome members" />);
    const canvas = await screen.findByRole('textbox', { name: 'Description' });
    await user.click(canvas);
    await user.keyboard('{Control>}a{/Control}');
    await user.click(screen.getByRole('button', { name: 'Bold', exact: true }));
    await waitFor(() => expect(canvas.querySelector('strong')?.textContent).toBe('Welcome members'));
    await user.click(screen.getByRole('button', { name: 'Undo', exact: true }));
    expect(canvas.querySelector('strong')).toBeNull();
});

test('changing alignment of pasted HTML keeps its colour and replaces the old alignment', async () => {
    const user = userEvent.setup();
    render(<EditorHarness initial={'<p style="text-align:center;color:red">Welcome</p>'} />);
    await screen.findByRole('textbox', { name: 'Description' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Text alignment' }), 'right');
    await user.click(screen.getByRole('button', { name: 'HTML', exact: true }));
    const html = screen.getByRole('textbox', { name: 'Description HTML' }).value;
    expect(html).toMatch(/text-align:\s*right/);
    expect(html).toMatch(/color:\s*red/);
    expect(html).not.toMatch(/text-align:\s*center/);
});

test('formatted clipboard paste retains headings, emphasis and line breaks', async () => {
    render(<EditorHarness />);
    const canvas = await screen.findByRole('textbox', { name: 'Description' });
    fireEvent.paste(canvas, { clipboardData: {
        getData: type => type === 'text/html' ? '<h3>Agenda</h3><p><strong>Welcome</strong><br>Networking</p>' : '',
        files: []
    } });
    await waitFor(() => expect(canvas.querySelector('h3')?.textContent).toBe('Agenda'));
    expect(canvas.querySelector('strong').textContent).toBe('Welcome');
    expect(canvas.querySelector('br')).toBeTruthy();
});

test('description display renders old line breaks and removes executable markup', () => {
    const { container, rerender } = render(<EventDescription value={'First\nSecond'} />);
    expect(container.querySelector('br')).toBeTruthy();
    rerender(<EventDescription value={'<p onclick="bad()">Welcome</p><script>bad()</script>'} />);
    expect(container.querySelector('p').getAttribute('onclick')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
});
