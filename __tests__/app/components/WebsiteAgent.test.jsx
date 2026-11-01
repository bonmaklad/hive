/** @jest-environment jsdom */
import { fireEvent, render } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import WebsiteAgent from '@/app/components/WebsiteAgent';

jest.mock('next/navigation', () => ({ usePathname: jest.fn() }));

const agentId = '5121833d5fc5429d81d740af99432d0d';
const scriptSelector = `script[data-agent="${agentId}"]`;
const rootSelector = `[data-agent-root="${agentId}"]`;

function addWidgetRoot() {
    const root = document.createElement('div');
    root.dataset.agentRoot = agentId;
    root.dataset.agentMode = 'floating';
    document.body.appendChild(root);
    return root;
}

test.each(['/platform', '/platform/', '/platform/benefits', '/platform/admin/spaces', null])(
    'does not load the widget on %s', pathname => {
        usePathname.mockReturnValue(pathname);
        render(<WebsiteAgent />);
        expect(document.querySelector(scriptSelector)).toBeNull();
    }
);

test('loads one widget and keeps it mounted between public website pages', () => {
    usePathname.mockReturnValue('/');
    const { rerender } = render(<WebsiteAgent />);
    const script = document.querySelector(scriptSelector);
    expect(script.src).toBe('https://agent.hivehq.nz/embed.js');
    expect(script.defer).toBe(true);

    usePathname.mockReturnValue('/events');
    rerender(<WebsiteAgent />);
    expect(document.querySelector(scriptSelector)).toBe(script);
    expect(document.querySelectorAll(scriptSelector)).toHaveLength(1);
});

test('removes an existing widget on entering the platform and reinstalls it on return', () => {
    usePathname.mockReturnValue('/');
    const { rerender } = render(<WebsiteAgent />);
    const originalScript = document.querySelector(scriptSelector);
    const root = addWidgetRoot();

    usePathname.mockReturnValue('/platform/benefits');
    rerender(<WebsiteAgent />);
    expect(document.querySelector(scriptSelector)).toBeNull();
    expect(root.isConnected).toBe(false);

    usePathname.mockReturnValue('/');
    rerender(<WebsiteAgent />);
    expect(document.querySelectorAll(scriptSelector)).toHaveLength(1);
    expect(document.querySelector(scriptSelector)).not.toBe(originalScript);
});

test('removes a widget created by a download finishing after navigation to the platform', () => {
    usePathname.mockReturnValue('/');
    const { rerender } = render(<WebsiteAgent />);
    const pendingScript = document.querySelector(scriptSelector);

    usePathname.mockReturnValue('/platform');
    rerender(<WebsiteAgent />);
    addWidgetRoot();
    fireEvent.load(pendingScript);
    expect(document.querySelector(rootSelector)).toBeNull();
});

test('a late download preserves the widget after returning to the website', () => {
    usePathname.mockReturnValue('/');
    const { rerender } = render(<WebsiteAgent />);
    const pendingScript = document.querySelector(scriptSelector);

    usePathname.mockReturnValue('/platform');
    rerender(<WebsiteAgent />);
    usePathname.mockReturnValue('/events');
    rerender(<WebsiteAgent />);
    const root = addWidgetRoot();
    fireEvent.load(pendingScript);
    expect(root.isConnected).toBe(true);
});
