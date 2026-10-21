import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupPersonalBests, loadRowingPage, rowingCacheControl, type PersonalBest } from './rowing-data';

const pb = (machine: 'concept2' | 'rp3', distance_m: number): PersonalBest => ({
	session_id: `${machine}-${distance_m}`,
	machine,
	distance_m,
	label: `${distance_m}m`,
	duration_ds: distance_m * 2,
	avg_split_ds: 1000,
	avg_rate: null,
	session_date: '2026-10-01',
});

/**
 * A stand-in for the Supabase client: every query builder method returns the same builder,
 * and awaiting it gives the next result queued for that table.
 */
function fakeClient(results: Record<string, Array<{ data?: unknown; error?: unknown } | Error>>) {
	const calls: string[] = [];
	const client = {
		from(table: string) {
			calls.push(table);
			const result = results[table].shift();
			const builder: object = new Proxy(
				{},
				{
					get: (_, prop) =>
						prop === 'then'
							? (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
									(result instanceof Error ? Promise.reject(result) : Promise.resolve({ data: null, error: null, ...result })).then(
										resolve,
										reject,
									)
							: () => builder,
				},
			);
			return builder;
		},
	};
	return { client: client as unknown as SupabaseClient, calls };
}

const ok = (data: unknown) => ({ data, error: null });

describe('groupPersonalBests', () => {
	it('groups by machine, Concept2 first, shortest distance first, leaving out machines without PBs', () => {
		const groups = groupPersonalBests([pb('rp3', 2000), pb('concept2', 6000), pb('concept2', 500), pb('concept2', 2000)]);
		expect(groups.map((g) => [g.machine, g.bests.map((b) => b.distance_m)])).toEqual([
			['concept2', [500, 2000, 6000]],
			['rp3', [2000]],
		]);
		expect(groupPersonalBests([pb('concept2', 2000)]).map((g) => g.machine)).toEqual(['concept2']);
	});
});

describe('rowingCacheControl', () => {
	it('lets shared caches keep the page for a few minutes, but never a failed load', () => {
		expect(rowingCacheControl('ok')).toBe('public, max-age=60, s-maxage=300');
		expect(rowingCacheControl('unavailable')).toBe('no-store');
	});
});

describe('loadRowingPage', () => {
	afterEach(() => vi.restoreAllMocks());

	it('is unavailable without a client (Supabase not set up, e.g. in CI)', async () => {
		expect(await loadRowingPage(null)).toEqual({ status: 'unavailable' });
	});

	it('loads PBs, recent sessions, outings and the 2k history', async () => {
		const session = { id: 's1', session_type: 'intervals', erg_intervals: [{ piece_no: 1 }] };
		const { client, calls } = fakeClient({
			personal_bests: [ok([pb('rp3', 2000), pb('concept2', 500)])],
			erg_sessions: [ok([session]), ok([{ session_date: '2026-10-10', avg_split_ds: 930 }])],
			on_water_outings: [ok([{ id: 'o1' }])],
		});
		const data = await loadRowingPage(client);
		expect(calls).toEqual(['personal_bests', 'erg_sessions', 'on_water_outings', 'erg_sessions']);
		expect(data).toEqual({
			status: 'ok',
			personalBests: [
				{ machine: 'concept2', bests: [pb('concept2', 500)] },
				{ machine: 'rp3', bests: [pb('rp3', 2000)] },
			],
			sessions: [session],
			outings: [{ id: 'o1' }],
			twoK: [{ session_date: '2026-10-10', avg_split_ds: 930 }],
		});
	});

	it('is unavailable, and logs why, if any of the queries fails', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { client } = fakeClient({
			personal_bests: [ok([])],
			erg_sessions: [ok([]), ok([])],
			on_water_outings: [{ data: null, error: { message: 'relation does not exist' } }],
		});
		expect(await loadRowingPage(client)).toEqual({ status: 'unavailable' });
		expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ event: 'rowing_data_failed', message: 'relation does not exist' });
	});

	it('is unavailable if the database does not answer (the request throws, e.g. on the timeout)', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { client } = fakeClient({
			personal_bests: [new Error('The operation was aborted due to timeout')],
			erg_sessions: [ok([]), ok([])],
			on_water_outings: [ok([])],
		});
		expect(await loadRowingPage(client)).toEqual({ status: 'unavailable' });
	});
});
