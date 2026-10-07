'use client';
import { useEffect, useState } from 'react';
import AdminSpacesPage from '@/app/platform/admin/spaces/page';
import { PlatformSessionProvider } from '@/app/platform/PlatformContext';
import BeforeSpaces from './BeforeSpaces';

export default function SpaceManagementPreview() {
    const [ready, setReady] = useState(false);
    const [before, setBefore] = useState(false);
    useEffect(() => {
        const originalFetch = window.fetch;
        let spaces = [{
            slug: 'nikau-room', title: 'Nikau Room', is_visible: true, tokens_per_hour: 1,
            pricing_half_day_cents: 12000, pricing_full_day_cents: 20000,
            copy: 'A flexible seminar room with views down Victoria Avenue.', capacity: 'Up to 12 seated',
            highlights: ['Whiteboard', 'TV with casting'], best_for: ['Workshops', 'Planning sessions'],
            layouts: [{ label: 'Boardroom', capacity: '10 people' }], images: []
        }];
        window.fetch = async (url, options = {}) => {
            if (!String(url).startsWith('/api/admin/spaces')) return originalFetch(url, options);
            if (options.method === 'PATCH') {
                spaces[0] = { ...spaces[0], ...JSON.parse(options.body) };
                return Response.json({ ok: true, space: spaces[0] });
            }
            if (options.method === 'DELETE') {
                spaces = [];
                return Response.json({ ok: true });
            }
            return Response.json({ spaces });
        };
        setBefore(new URLSearchParams(window.location.search).get('before') === '1');
        setReady(true);
        return () => { window.fetch = originalFetch; };
    }, []);
    if (!ready) return null;
    const session = { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'preview-token' } } }) } } };
    return <PlatformSessionProvider value={session}><div className="platform-shell">{before ? <BeforeSpaces /> : <AdminSpacesPage />}</div></PlatformSessionProvider>;
}
