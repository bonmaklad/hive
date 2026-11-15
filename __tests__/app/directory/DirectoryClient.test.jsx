/** @jest-environment jsdom */
import { render, screen, within } from '@testing-library/react';
import DirectoryClient from '@/app/directory/DirectoryClient';

test('touchscreen directions sit beside each logo and point left for 122 or members and right for 116', () => {
    render(<DirectoryClient showDirections tenants={[
        { id: 'left', name: 'Building 122 tenant', buildings: ['122'] },
        { id: 'right', name: 'Building 116 tenant', buildings: ['116'] },
        { id: 'member', name: 'Member without workspace', buildings: [] }
    ]} />);

    for (const [name, direction] of [
        ['Building 122 tenant', 'Turn left for 122 and members'],
        ['Building 116 tenant', 'Turn right for 116'],
        ['Member without workspace', 'Turn left for 122 and members']
    ]) {
        const card = screen.getByRole('heading', { name }).closest('article');
        const logoRow = card.querySelector('.directory-logo-row');
        expect(logoRow.querySelector('.directory-logo')).not.toBeNull();
        expect(within(logoRow).getByRole('img', { name: direction })).toBeTruthy();
    }
});

test('the regular directory does not show touchscreen direction arrows', () => {
    render(<DirectoryClient tenants={[{ id: 'tenant', name: 'Tenant', buildings: ['116'] }]} />);
    expect(screen.queryByRole('img', { name: /Turn/ })).toBeNull();
});
