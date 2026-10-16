import type { APIRoute } from 'astro';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from 'astro:env/server';
import { LOGIN_PATH } from '../../lib/admin-guard';
import { createSessionClient } from '../../lib/supabase-session';

export const prerender = false;

// Logging out is a POST (a form button), never a link, so another site can't log you out with an
// image tag; Astro's security.checkOrigin also rejects posts from other websites.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const supabase = createSessionClient({ url: SUPABASE_URL, publishableKey: SUPABASE_PUBLISHABLE_KEY }, request, cookies);
	// signOut ends the session in Supabase and clears the session cookies through the cookie adapter.
	await supabase?.auth.signOut();
	return redirect(`${LOGIN_PATH}?logged-out`, 303);
};
