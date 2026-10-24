// Server-side Supabase client for the rowing section (ADR-002).
// Pages and endpoints pass in SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY from astro:env, so this module
// stays free of Astro imports and can be unit tested. The browser never talks to Supabase directly.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
	url?: string;
	publishableKey?: string;
}

let cached: { url: string; key: string; client: SupabaseClient } | null = null;

/**
 * Returns a client for the configured project, or null when Supabase isn't set up (e.g. in CI),
 * so callers can show a fallback instead of crashing. One client is reused per process.
 */
export function getSupabase({ url, publishableKey }: SupabaseConfig): SupabaseClient | null {
	if (!url || !publishableKey) return null;
	if (!cached || cached.url !== url || cached.key !== publishableKey) {
		cached = {
			url,
			key: publishableKey,
			// No sessions are stored on the server yet; the admin login (a later issue) handles its own.
			client: createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } }),
		};
	}
	return cached.client;
}

export type DatabaseCheck =
	| { status: 'not_configured' }
	| { status: 'ok'; latencyMs: number }
	| { status: 'down'; latencyMs: number; error: string };

const CHECK_TIMEOUT_MS = 3000;

/**
 * Checks that the Supabase database answers, for /api/health?deep=1.
 * It reads one row of erg_sessions, which anyone may read (RLS), so the database itself has to answer, the
 * same way the Rowing page needs it to. Not the REST API's root: hosted Supabase only answers that with the
 * secret key, which the website never has, so the live check always said "down".
 */
export async function checkDatabase(
	{ url, publishableKey }: SupabaseConfig,
	fetchFn: typeof fetch = fetch,
	timeoutMs = CHECK_TIMEOUT_MS,
): Promise<DatabaseCheck> {
	if (!url || !publishableKey) return { status: 'not_configured' };
	const started = performance.now();
	const latency = () => Math.round(performance.now() - started);
	try {
		const response = await fetchFn(new URL('/rest/v1/erg_sessions?select=id&limit=1', url), {
			headers: { apikey: publishableKey },
			signal: AbortSignal.timeout(timeoutMs),
		});
		if (response.ok) return { status: 'ok', latencyMs: latency() };
		return { status: 'down', latencyMs: latency(), error: `Supabase responded ${response.status}` };
	} catch (error) {
		const reason = error instanceof Error && error.name === 'TimeoutError' ? `no answer within ${timeoutMs} ms` : 'unreachable';
		return { status: 'down', latencyMs: latency(), error: `Supabase ${reason}` };
	}
}
