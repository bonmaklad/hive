'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const agentId = '5121833d5fc5429d81d740af99432d0d';

export default function WebsiteAgent() {
    const pathname = usePathname();
    const enabled = Boolean(pathname) && pathname !== '/platform' && !pathname.startsWith('/platform/');
    const enabledRef = useRef(false);

    useEffect(() => {
        enabledRef.current = enabled;
        if (!enabled) return;

        const removeWidget = () => {
            document.querySelectorAll(`[data-agent-root="${agentId}"][data-agent-mode="floating"]`).forEach(root => root.remove());
        };
        const script = document.createElement('script');
        script.src = 'https://agent.hivehq.nz/embed.js';
        script.dataset.agent = agentId;
        script.defer = true;
        // A pending download can finish after navigation removed the script.
        script.onload = () => {
            if (!enabledRef.current) removeWidget();
        };
        document.body.appendChild(script);

        return () => {
            enabledRef.current = false;
            script.remove();
            // Removing the embed root also triggers its overlay and listener cleanup.
            removeWidget();
        };
    }, [enabled]);

    return null;
}
