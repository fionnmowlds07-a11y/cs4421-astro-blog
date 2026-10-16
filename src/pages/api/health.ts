import type { APIRoute } from 'astro';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from 'astro:env/server';
import { checkDatabase } from '../../lib/supabase';

export const prerender = false;

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

// Plain /api/health only says the server is up, so the container healthcheck and CI never depend on
// the database. /api/health?deep=1 also checks Supabase: 503 if it's down, 200 if it's fine or not set up.
export const GET: APIRoute = async ({ url }) => {
	const base = { uptime: process.uptime(), timestamp: new Date().toISOString() };
	if (url.searchParams.get('deep') !== '1') {
		return json({ status: 'ok', ...base }, 200);
	}

	const database = await checkDatabase({ url: SUPABASE_URL, publishableKey: SUPABASE_PUBLISHABLE_KEY });
	const healthy = database.status !== 'down';
	return json({ status: healthy ? 'ok' : 'degraded', ...base, checks: { database } }, healthy ? 200 : 503, {
		'Cache-Control': 'no-store',
	});
};
