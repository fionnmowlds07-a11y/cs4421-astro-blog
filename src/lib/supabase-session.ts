// Per-request Supabase client that acts as the logged-in user, for the rowing admin area.
// The login session is kept in cookies that only the server reads and writes (via @supabase/ssr):
// the browser never talks to Supabase directly and never sees a key or token in JavaScript.

import { type CookieOptions, createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseConfig } from './supabase';

/**
 * Forced onto every session cookie, whatever Supabase asks for:
 * httpOnly so page scripts can't read the session, secure so it's only sent over HTTPS
 * (browsers allow it on http://localhost too), and sameSite 'lax' so other sites can't
 * send it along with a form they submit to this one.
 */
export const SESSION_COOKIE_OPTIONS = {
	httpOnly: true,
	secure: true,
	sameSite: 'lax',
	path: '/',
} as const satisfies CookieOptions;

/** The part of Astro's cookie API the adapter needs (kept small so it can be faked in tests). */
export interface CookieJar {
	set(name: string, value: string, options: CookieOptions): void;
}

/** Connects @supabase/ssr to this request's cookies: reads them from the request, writes them through Astro. */
export function cookieAdapter(request: Request, cookies: CookieJar) {
	return {
		getAll() {
			return parseCookieHeader(request.headers.get('cookie') ?? '').map(({ name, value }) => ({
				name,
				value: value ?? '',
			}));
		},
		setAll(toSet: { name: string; value: string; options: CookieOptions }[]) {
			for (const { name, value, options } of toSet) {
				cookies.set(name, value, { ...options, ...SESSION_COOKIE_OPTIONS });
			}
		},
	};
}

/** A Supabase client for this request, or null when Supabase isn't configured (e.g. in CI). */
export function createSessionClient(
	{ url, publishableKey }: SupabaseConfig,
	request: Request,
	cookies: CookieJar,
): SupabaseClient | null {
	if (!url || !publishableKey) return null;
	return createServerClient(url, publishableKey, { cookies: cookieAdapter(request, cookies) });
}

/**
 * Whether the request carries a Supabase login cookie (sb-<project>-auth-token, possibly split into .0, .1 …).
 * Lets public pages skip asking Supabase about visitors who have never logged in.
 */
export function hasSessionCookie(request: Request): boolean {
	return parseCookieHeader(request.headers.get('cookie') ?? '').some(
		({ name, value }) => /^sb-.+-auth-token(\.\d+)?$/.test(name) && Boolean(value),
	);
}
