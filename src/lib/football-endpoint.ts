// Shared response handling for the football-data.org backed API endpoints:
// caching headers on success, and graceful JSON errors (with a structured log line) on failure.

import { FootballDataError } from './football';

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...headers },
	});

/**
 * Loads data with the API key and turns the outcome into a response:
 * 200 with caching headers, 503 without a key or when rate limited, 502 when the upstream API fails.
 */
export async function footballDataResponse(
	apiKey: string | undefined,
	label: string,
	load: (apiKey: string) => Promise<unknown>,
): Promise<Response> {
	if (!apiKey) {
		return json({ error: `${label} are not configured` }, 503);
	}

	try {
		const data = await load(apiKey);
		// Shared caches (e.g. CloudFront) may keep it for 10 minutes, browsers for 1, matching the server-side cache.
		return json(data, 200, { 'Cache-Control': 'public, max-age=60, s-maxage=600' });
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
			return json({ error: `${label} are temporarily unavailable, please try again shortly` }, 503, {
				'Retry-After': '60',
			});
		}
		return json({ error: `Could not load ${label} right now` }, 502);
	}
}
