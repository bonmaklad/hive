'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

function getSafeNext(next) {
  if (typeof next !== 'string') return '/platform';
  if (!next.startsWith('/')) return '/platform';
  return next;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [status, setStatus] = useState('Finishing sign-in…');
  const [error, setError] = useState('');

  useEffect(() => {
    const code = params.get('code');
    const next = getSafeNext(params.get('next'));

    if (!code) {
      setError('Missing sign-in code. Please request a new magic link.');
      setStatus('Could not finish sign-in.');
      return;
    }

    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) throw error;
        router.replace(next);
      })
      .catch(err => {
        setError(
          err?.message ||
            'This sign-in link must be opened in the same browser where you requested it.'
        );
        setStatus('Could not finish sign-in.');
      });
  }, [params, router, supabase]);

  return (
    <main className="platform-shell">
      <div className="platform-card">
        <h1>Signing you in…</h1>
        <p className="platform-subtitle">{status}</p>

        {error && <p className="platform-message error">{error}</p>}

        <p className="platform-footer" style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/login" className="btn ghost">Back to sign in</Link>
          <Link href="/" className="btn ghost">Back to site</Link>
        </p>
      </div>
    </main>
  );
}
