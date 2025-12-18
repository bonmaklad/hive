'use client';

import {
    combineChunks,
    createChunks,
    isChunkLike,
    parse,
    serialize,
    stringFromBase64URL,
    stringToBase64URL
} from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from './env';

const BASE64_PREFIX = 'base64-';
let cachedBrowserClient;

// Cookie options safe for browser-set cookies.
// Do NOT use DEFAULT_COOKIE_OPTIONS from @supabase/ssr in the browser.
const COOKIE_OPTIONS = {
    path: '/',
    sameSite: 'lax',
    secure: typeof window !== 'undefined' && window.location.protocol === 'https:'
};

function getAllCookies() {
    if (typeof document === 'undefined') {
        return [];
    }

    const parsed = parse(document.cookie || '');
    return Object.keys(parsed).map(name => ({ name, value: parsed[name] ?? '' }));
}

function setAllCookies(cookiesToSet) {
    if (typeof document === 'undefined') {
        return;
    }

    cookiesToSet.forEach(({ name, value, options }) => {
        document.cookie = serialize(name, value, options);
    });
}

export function createSupabaseBrowserClient() {
    const { url, anonKey } = getSupabaseEnv();

    if (cachedBrowserClient) {
        return cachedBrowserClient;
    }

    const storageKey = 'sb-supabase-auth-token';

    const storage = {
        isServer: false,
        getItem: async key => {
            const allCookies = getAllCookies();
            const chunkedCookie = await combineChunks(key, async chunkName => {
                const cookie = allCookies.find(({ name }) => name === chunkName);
                return cookie ? cookie.value : null;
            });

            if (!chunkedCookie) return null;

            if (chunkedCookie.startsWith(BASE64_PREFIX)) {
                return stringFromBase64URL(chunkedCookie.substring(BASE64_PREFIX.length));
            }

            return chunkedCookie;
        },
        setItem: async (key, value) => {
            const allCookies = getAllCookies();
            const cookieNames = allCookies.map(({ name }) => name);

            const removeCookies = new Set(cookieNames.filter(name => isChunkLike(name, key)));
            const encoded = BASE64_PREFIX + stringToBase64URL(value);
            const setCookies = createChunks(key, encoded);

            setCookies.forEach(({ name }) => removeCookies.delete(name));

            const removeCookieOptions = { ...COOKIE_OPTIONS, maxAge: 0 };
            // Persist for 7 days by default
            const setCookieOptions = { ...COOKIE_OPTIONS, maxAge: 60 * 60 * 24 * 7 };

            setAllCookies([
                ...[...removeCookies].map(name => ({ name, value: '', options: removeCookieOptions })),
                ...setCookies.map(({ name, value }) => ({ name, value, options: setCookieOptions }))
            ]);
        },
        removeItem: async key => {
            const allCookies = getAllCookies();
            const cookieNames = allCookies.map(({ name }) => name);
            const removeCookies = cookieNames.filter(name => isChunkLike(name, key));
            const removeCookieOptions = { ...COOKIE_OPTIONS, maxAge: 0 };

            setAllCookies(removeCookies.map(name => ({ name, value: '', options: removeCookieOptions })));
        }
    };

    cachedBrowserClient = createClient(url, anonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

    return cachedBrowserClient;
}
