import type { APIRoute } from 'astro';
import { FOOTBALL_DATA_API_KEY } from 'astro:env/server';
import { FootballDataError, getManUnitedSummary } from '../../../lib/football';

export const prerender = false;

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...headers },
	});

export const GET: APIRoute = async () => {
	if (!FOOTBALL_DATA_API_KEY) {
		return json({ error: 'Man United stats are not configured' }, 503);
	}

	try {
		const summary = await getManUnitedSummary(FOOTBALL_DATA_API_KEY);
		// Shared caches (e.g. CloudFront) may keep it for 10 minutes, browsers for 1, matching the server-side cache.
		return json(summary, 200, { 'Cache-Control': 'public, max-age=60, s-maxage=600' });
	} catch (error) {
		const status = error instanceof FootballDataError ? error.status : undefined;
		console.error(
			JSON.stringify({
				timestamp: new Date().toISOString(),
				level: 'ERROR',
				event: 'football_data_failed',
				upstreamStatus: status ?? null,
				message: error instanceof Error ? error.message : String(error),
			}),
		);
		if (status === 429) {
			return json({ error: 'Man United stats are temporarily unavailable, please try again shortly' }, 503, {
				'Retry-After': '60',
			});
		}
		return json({ error: 'Could not load Man United stats right now' }, 502);
	}
};
