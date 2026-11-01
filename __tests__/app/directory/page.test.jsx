import { renderToStaticMarkup } from 'react-dom/server';
import DirectoryPage from '@/app/directory/page';
import { getTenantDirectory } from '@/lib/tenants';

jest.mock('@/lib/tenants', () => ({ getTenantDirectory: jest.fn() }));
jest.mock('@/app/components/SiteNav', () => () => null);
jest.mock('@/app/directory/DirectoryClient', () => function DirectoryClient({ tenants, totalCount }) {
    return <p>Showing {tenants.length} of {totalCount} teams</p>;
});

test('all public counts use eligible directory listings rather than every tenant account', async () => {
    getTenantDirectory.mockResolvedValue([
        { id: 'live-1', email: 'one@example.test' },
        { id: 'live-2' }
    ]);

    const html = renderToStaticMarkup(await DirectoryPage());
    expect(html).toContain('<span>2</span><p>Companies</p>');
    expect(html).toContain('<span>1</span><p>Contact ready</p>');
    expect(html).toContain('<span>2</span><p>HIVE Companies</p>');
    expect(html).toContain('Showing 2 of 2 teams');
});

test('membership lookup errors do not publish listings or count hidden tenants', async () => {
    getTenantDirectory.mockRejectedValue(new Error('Membership lookup failed'));

    const html = renderToStaticMarkup(await DirectoryPage());
    expect(html).toContain('<span>0</span><p>Companies</p>');
    expect(html).toContain('Showing 0 of 0 teams');
});
