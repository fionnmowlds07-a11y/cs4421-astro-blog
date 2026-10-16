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
