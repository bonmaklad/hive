'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DeprecatedPoliciesRedirect() {
    const router = useRouter();

    useEffect(() => {
        const hash = typeof window !== 'undefined' ? window.location.hash : '';
        router.replace(`/platform/docs${hash || ''}`);
    }, [router]);

    return null;
}

