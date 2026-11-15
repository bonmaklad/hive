/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import OfficeBadges from '@/app/touchscreen/OfficeBadges';

jest.mock('next/image', () => function MockImage(props) {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...Object.fromEntries(Object.entries(props).filter(([key]) => key !== 'unoptimized'))} />;
});

test('office circles show initials when a logo fails and skip public rooms or unknown coordinates', () => {
    render(<OfficeBadges tenants={[
        { name: 'Example Tenant', logoUrl: '/example-logo.png', officeCodes: ['122.12', '116.13', '999.1'] },
        { name: 'Another Tenant', profileName: 'Public Name', officeCodes: ['116.8'] }
    ]} />);

    const logoBadge = screen.getByRole('img', { name: 'Example Tenant, office 122.12' });
    expect(logoBadge.querySelector('img').getAttribute('src')).toBe('/example-logo.png');
    fireEvent.error(logoBadge.querySelector('img'));
    expect(logoBadge.textContent).toBe('ET');
    expect(logoBadge.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: 'Public Name, office 116.8' }).textContent).toBe('PN');
    expect(screen.queryByRole('img', { name: /116.13|999.1/ })).toBeNull();
});
