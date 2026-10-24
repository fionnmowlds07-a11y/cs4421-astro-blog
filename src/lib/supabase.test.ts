import { describe, expect, it, vi } from 'vitest';
import { checkDatabase, getSupabase } from './supabase';

const LOCAL = { url: 'http://127.0.0.1:54321', publishableKey: 'sb_publishable_test' };

describe('getSupabase', () => {
	it('returns null when Supabase is not configured, so pages can show a fallback', () => {
		expect(getSupabase({})).toBeNull();
		expect(getSupabase({ url: LOCAL.url })).toBeNull();
		expect(getSupabase({ publishableKey: LOCAL.publishableKey })).toBeNull();
	});

	it('reuses one client for the same settings', () => {
		const client = getSupabase(LOCAL);
		expect(client).not.toBeNull();
		expect(getSupabase({ ...LOCAL })).toBe(client);
	});

	it('creates a new client when the settings change', () => {
		const first = getSupabase(LOCAL);
		const second = getSupabase({ ...LOCAL, publishableKey: 'sb_publishable_other' });
		expect(second).not.toBe(first);
	});
});

describe('checkDatabase', () => {
	const respond = (status: number) => async () => new Response('{}', { status });

	it('reports not_configured without settings, and makes no request', async () => {
		const fetchFn = vi.fn();
		expect(await checkDatabase({}, fetchFn)).toEqual({ status: 'not_configured' });
		expect(fetchFn).not.toHaveBeenCalled();
	});

	// Not the REST API root: hosted Supabase only answers that with the secret key (401 with the publishable one).
	it('reads one row of a public table with the publishable key and reports ok with the latency', async () => {
		const fetchFn = vi.fn(respond(200));
		const result = await checkDatabase(LOCAL, fetchFn as typeof fetch);

		expect(result).toMatchObject({ status: 'ok' });
		expect(result.status === 'ok' && result.latencyMs).toBeGreaterThanOrEqual(0);
		const [url, init] = fetchFn.mock.calls[0] as unknown as [URL, RequestInit];
		expect(String(url)).toBe('http://127.0.0.1:54321/rest/v1/erg_sessions?select=id&limit=1');
		expect(init.headers).toEqual({ apikey: LOCAL.publishableKey });
	});

	it('reports down when Supabase answers with an error (e.g. the database is stopped)', async () => {
		expect(await checkDatabase(LOCAL, respond(503) as typeof fetch)).toMatchObject({
			status: 'down',
			error: 'Supabase responded 503',
		});
	});

	it('reports down, not a crash, when Supabase is unreachable or too slow', async () => {
		const unreachable = async () => {
			throw new TypeError('fetch failed');
		};
		expect(await checkDatabase(LOCAL, unreachable as typeof fetch)).toMatchObject({
			status: 'down',
			error: 'Supabase unreachable',
		});

		const slow = (_url: unknown, init?: RequestInit) =>
			new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)));
		expect(await checkDatabase(LOCAL, slow as typeof fetch, 20)).toMatchObject({
			status: 'down',
			error: 'Supabase no answer within 20 ms',
		});
	});
});
