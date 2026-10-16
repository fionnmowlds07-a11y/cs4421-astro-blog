import { describe, expect, it, vi } from 'vitest';
import {
	type ApiMatch,
	type ApiScorer,
	type ApiStandings,
	createRefreshingCache,
	FootballDataError,
	fetchManUnitedSummary,
	leagueSummary,
	MAN_UNITED_ID,
	summariseMatches,
	teamScorers,
} from './football';

const UNITED = { id: MAN_UNITED_ID, name: 'Manchester United FC', shortName: 'Man United', crest: 'mu.png' };
const team = (id: number, shortName: string) => ({ id, name: `${shortName} FC`, shortName, crest: `${id}.png` });

let nextId = 1;
function match(
	date: string,
	opponent: ReturnType<typeof team>,
	options: { home?: boolean; score?: [number, number]; status?: string; competition?: string } = {},
): ApiMatch {
	const { home = true, score, status = score ? 'FINISHED' : 'TIMED', competition = 'PL' } = options;
	return {
		id: nextId++,
		utcDate: `${date}T15:00:00Z`,
		status,
		competition: { code: competition, name: competition },
		homeTeam: home ? UNITED : opponent,
		awayTeam: home ? opponent : UNITED,
		score: { fullTime: { home: score?.[0] ?? null, away: score?.[1] ?? null } },
	};
}

describe('summariseMatches', () => {
	it('scores results from United’s point of view, home and away', () => {
		const { recentResults } = summariseMatches([
			match('2026-09-01', team(1, 'Arsenal'), { home: true, score: [2, 1] }),
			match('2026-09-08', team(2, 'Chelsea'), { home: false, score: [3, 1] }),
			match('2026-09-15', team(3, 'Leeds'), { home: false, score: [0, 2] }),
			match('2026-09-22', team(4, 'Spurs'), { home: true, score: [1, 1] }),
		]);
		expect(recentResults.map((r) => [r.opponent, r.venue, r.goalsFor, r.goalsAgainst, r.outcome])).toEqual([
			['Spurs', 'H', 1, 1, 'D'],
			['Leeds', 'A', 2, 0, 'W'],
			['Chelsea', 'A', 1, 3, 'L'],
			['Arsenal', 'H', 2, 1, 'W'],
		]);
	});

	it('keeps the 5 latest results (newest first) and the next 5 fixtures (soonest first), even from unsorted input', () => {
		const finished = Array.from({ length: 7 }, (_, i) =>
			match(`2026-08-0${i + 1}`, team(10 + i, `Played ${i + 1}`), { score: [1, 0] }),
		);
		const upcoming = Array.from({ length: 7 }, (_, i) => match(`2026-11-0${i + 1}`, team(20 + i, `Next ${i + 1}`)));
		const { recentResults, upcomingFixtures } = summariseMatches([...upcoming, ...finished].reverse());

		expect(recentResults.map((r) => r.opponent)).toEqual(['Played 7', 'Played 6', 'Played 5', 'Played 4', 'Played 3']);
		expect(upcomingFixtures.map((f) => f.opponent)).toEqual(['Next 1', 'Next 2', 'Next 3', 'Next 4', 'Next 5']);
	});

	it('builds the form guide oldest to newest, because the free tier returns no form', () => {
		const { form } = summariseMatches([
			match('2026-09-01', team(1, 'A'), { score: [2, 0] }),
			match('2026-09-08', team(2, 'B'), { score: [0, 1] }),
			match('2026-09-15', team(3, 'C'), { score: [1, 1] }),
		]);
		expect(form).toEqual(['W', 'L', 'D']);
	});

	it('ignores postponed matches and finished matches without a score', () => {
		const { recentResults, upcomingFixtures } = summariseMatches([
			match('2026-09-01', team(1, 'Postponed'), { status: 'POSTPONED' }),
			match('2026-09-08', team(2, 'No score'), { status: 'FINISHED' }),
			match('2026-09-15', team(3, 'Valid'), { score: [1, 0] }),
		]);
		expect(recentResults.map((r) => r.opponent)).toEqual(['Valid']);
		expect(upcomingFixtures).toEqual([]);
	});
});

describe('leagueSummary', () => {
	const row = (id: number, position: number) => ({
		position,
		team: team(id, `Team ${id}`),
		playedGames: 6,
		won: 1,
		draw: 3,
		lost: 2,
		points: 6,
		goalsFor: 7,
		goalsAgainst: 7,
		goalDifference: 0,
	});

	it('reads United’s row from the overall (TOTAL) table, not the home/away tables', () => {
		const standings: ApiStandings = {
			standings: [
				{ type: 'HOME', table: [row(MAN_UNITED_ID, 1)] },
				{ type: 'TOTAL', table: [row(5, 12), row(MAN_UNITED_ID, 13)] },
			],
		};
		expect(leagueSummary(standings)).toEqual({
			position: 13,
			played: 6,
			won: 1,
			drawn: 3,
			lost: 2,
			points: 6,
			goalDifference: 0,
		});
	});

	it('returns null when United are not in the table', () => {
		expect(leagueSummary({ standings: [{ type: 'TOTAL', table: [row(5, 1)] }] })).toBeNull();
	});
});

describe('teamScorers', () => {
	const scorer = (name: string, teamId: number, goals: number, assists: number | null): ApiScorer => ({
		player: { id: nextId++, name },
		team: { id: teamId },
		goals,
		assists,
	});

	it('keeps only United players, sorted by goals then assists, treating missing assists as 0', () => {
		expect(
			teamScorers([
				scorer('Haaland', 65, 9, 1),
				scorer('Mbeumo', MAN_UNITED_ID, 3, null),
				scorer('Cunha', MAN_UNITED_ID, 1, 2),
				scorer('Bruno', MAN_UNITED_ID, 3, 1),
			]),
		).toEqual([
			{ name: 'Bruno', goals: 3, assists: 1 },
			{ name: 'Mbeumo', goals: 3, assists: 0 },
			{ name: 'Cunha', goals: 1, assists: 2 },
		]);
	});
});

describe('createRefreshingCache', () => {
	// A fake clock: fresh for 10 ms, shown while stale up to 100 ms, failed refreshes retried after 5 ms.
	function setup() {
		let clock = 0;
		const onRefreshError = vi.fn();
		const cache = createRefreshingCache<string>({
			freshMs: 10,
			maxStaleMs: 100,
			retryMs: 5,
			onRefreshError,
			now: () => clock,
		});
		return { cache, onRefreshError, tick: (ms: number) => (clock += ms) };
	}
	// Lets a background refresh (a promise nobody awaits) finish.
	const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

	it('serves a fresh value without loading again', async () => {
		const { cache, tick } = setup();
		const load = vi.fn().mockResolvedValue('v1');

		expect(await cache.get('k', load)).toEqual({ value: 'v1', refreshFailed: false });
		tick(9);
		expect(await cache.get('k', load)).toEqual({ value: 'v1', refreshFailed: false });
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('serves a stale value instantly and refreshes it in the background', async () => {
		const { cache, tick } = setup();
		const load = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');

		await cache.get('k', load);
		tick(10);
		// The stale value comes back straight away, without waiting for the refresh.
		expect(await cache.get('k', load)).toEqual({ value: 'v1', refreshFailed: false });
		await settle();
		expect(await cache.get('k', load)).toEqual({ value: 'v2', refreshFailed: false });
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('keeps the old value and flags it when a background refresh fails, then recovers', async () => {
		const { cache, onRefreshError, tick } = setup();
		const load = vi
			.fn()
			.mockResolvedValueOnce('v1')
			.mockRejectedValueOnce(new Error('timeout'))
			.mockResolvedValueOnce('v2');

		await cache.get('k', load);
		tick(10);
		await cache.get('k', load);
		await settle();

		expect(await cache.get('k', load)).toEqual({ value: 'v1', refreshFailed: true });
		expect(onRefreshError).toHaveBeenCalledWith(new Error('timeout'));

		tick(5);
		await cache.get('k', load);
		await settle();
		expect(await cache.get('k', load)).toEqual({ value: 'v2', refreshFailed: false });
	});

	it('waits before retrying a failed refresh, so a broken API is not hammered', async () => {
		const { cache, tick } = setup();
		const load = vi.fn().mockResolvedValueOnce('v1').mockRejectedValue(new Error('down'));

		await cache.get('k', load);
		tick(10);
		await cache.get('k', load);
		await settle();
		for (let i = 0; i < 5; i++) await cache.get('k', load);
		expect(load).toHaveBeenCalledTimes(2);

		tick(5);
		await cache.get('k', load);
		await settle();
		expect(load).toHaveBeenCalledTimes(3);
	});

	it('runs only one refresh at a time, however many callers arrive', async () => {
		const { cache, tick } = setup();
		let finish: (value: string) => void = () => {};
		const load = vi
			.fn()
			.mockResolvedValueOnce('v1')
			.mockImplementationOnce(() => new Promise<string>((resolve) => (finish = resolve)));

		await cache.get('k', load);
		tick(10);
		const results = await Promise.all([cache.get('k', load), cache.get('k', load), cache.get('k', load)]);
		expect(results.map((r) => r.value)).toEqual(['v1', 'v1', 'v1']);
		expect(load).toHaveBeenCalledTimes(2);

		finish('v2');
		await settle();
		expect((await cache.get('k', load)).value).toBe('v2');
	});

	it('stops showing a value once it is too old, and waits for a fresh one instead', async () => {
		const { cache, tick } = setup();
		const load = vi.fn().mockResolvedValueOnce('v1').mockRejectedValueOnce(new Error('down'));

		await cache.get('k', load);
		tick(100);
		await expect(cache.get('k', load)).rejects.toThrow('down');
	});

	it('shares one first load between simultaneous callers', async () => {
		const { cache } = setup();
		const load = vi.fn().mockResolvedValue('data');

		const results = await Promise.all([cache.get('k', load), cache.get('k', load), cache.get('k', load)]);
		expect(results.map((r) => r.value)).toEqual(['data', 'data', 'data']);
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('does not cache a failed first load, so the next call retries', async () => {
		const { cache } = setup();
		const load = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('recovered');

		await expect(cache.get('k', load)).rejects.toThrow('down');
		expect((await cache.get('k', load)).value).toBe('recovered');
	});
});

describe('fetchManUnitedSummary', () => {
	const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

	it('makes the three API calls with the key header and combines them into one summary', async () => {
		const fetchFn = vi.fn(async (url: string | URL | Request) => {
			const path = String(url);
			if (path.includes('/matches')) return json({ matches: [match('2026-09-01', team(1, 'Arsenal'), { score: [2, 0] })] });
			if (path.includes('/standings')) return json({ standings: [] });
			return json({ scorers: [] });
		});

		const summary = await fetchManUnitedSummary('test-key', fetchFn as typeof fetch);

		const urls = fetchFn.mock.calls.map(([url]) => String(url));
		expect(urls).toEqual([
			`https://api.football-data.org/v4/teams/${MAN_UNITED_ID}/matches`,
			'https://api.football-data.org/v4/competitions/PL/standings',
			'https://api.football-data.org/v4/competitions/PL/scorers?limit=100',
		]);
		for (const [, init] of fetchFn.mock.calls as unknown as [string, RequestInit][]) {
			expect(init.headers).toEqual({ 'X-Auth-Token': 'test-key' });
		}
		expect(summary.form).toEqual(['W']);
		expect(summary.league).toBeNull();
		expect(summary.topScorers).toEqual([]);
	});

	it('throws a FootballDataError carrying the status when the API refuses (e.g. rate limited)', async () => {
		const fetchFn = vi.fn(async () => json({ message: 'Too many requests' }, 429));
		const error = await fetchManUnitedSummary('test-key', fetchFn as typeof fetch).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(FootballDataError);
		expect((error as FootballDataError).status).toBe(429);
	});
});
