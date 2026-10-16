// Shared response handling for the football-data.org backed API endpoints:
// caching headers on success, and graceful JSON errors (with a structured log line) on failure.

import { FootballDataError, logFootballDataError } from './football';

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...headers },
	});

/**
 * Cache-Control for football data. Browsers keep it for a minute; shared caches (e.g. CloudFront) for
 * 10 minutes, matching the server-side cache, but only a minute after a failed refresh, so recovered
 * stats reach visitors sooner.
 */
export const footballCacheControl = (refreshFailed: boolean) =>
	`public, max-age=60, s-maxage=${refreshFailed ? 60 : 600}`;

/**
 * Loads data with the API key and turns the outcome into a response:
 * 200 with caching headers, 503 without a key or when rate limited, 502 when the upstream API fails.
 */
export async function footballDataResponse(
	apiKey: string | undefined,
	label: string,
	load: (apiKey: string) => Promise<{ refreshFailed: boolean }>,
): Promise<Response> {
	if (!apiKey) {
		return json({ error: `${label} are not configured` }, 503);
	}

	try {
		const data = await load(apiKey);
		return json(data, 200, { 'Cache-Control': footballCacheControl(data.refreshFailed) });
	} catch (error) {
		const status = error instanceof FootballDataError ? error.status : undefined;
		logFootballDataError(error);
		if (status === 429) {
			return json({ error: `${label} are temporarily unavailable, please try again shortly` }, 503, {
				'Retry-After': '60',
			});
		}
		return json({ error: `Could not load ${label} right now` }, 502);
	}
}
