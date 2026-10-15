import { describe, expect, it, vi } from 'vitest';
import { type ApiMatch, FootballDataError, MAN_UNITED_ID } from './football';
import {
	type ApiLeagueScorer,
	type ApiSquadPlayer,
	buildTable,
	fetchPremierLeagueData,
	headToHead,
	leagueScorers,
	positionHistory,
	squadSummary,
	teamStats,
} from './league';

const team = (id: number, shortName: string) => ({
	id,
	name: `${shortName} FC`,
	shortName,
	tla: shortName.slice(0, 3).toUpperCase(),
	crest: `${id}.png`,
});

const ARSENAL = team(1, 'Arsenal');
const BRIGHTON = team(2, 'Brighton');
const CHELSEA = team(3, 'Chelsea');
const DERBY = team(4, 'Derby');
const EVERTON = team(5, 'Everton');

let nextId = 1;
function game(
	matchday: number,
	date: string,
	home: ReturnType<typeof team>,
	away: ReturnType<typeof team>,
	fullTime?: [number, number],
	halfTime?: [number, number],
): ApiMatch {
	return {
		id: nextId++,
		utcDate: `${date}T15:00:00Z`,
		status: fullTime ? 'FINISHED' : 'TIMED',
		matchday,
		competition: { code: 'PL', name: 'Premier League' },
		homeTeam: home,
		awayTeam: away,
		score: {
			fullTime: { home: fullTime?.[0] ?? null, away: fullTime?.[1] ?? null },
			...(halfTime && { halfTime: { home: halfTime[0], away: halfTime[1] } }),
		},
	};
}

// A tiny five-team league worked out by hand. Everton has only an unplayed fixture.
//   MD1: Arsenal 2-0 Brighton (HT 1-0)   Chelsea 1-1 Derby (HT 0-1)
//   MD2: Brighton 3-1 Chelsea (HT 0-1)   Derby 0-0 Arsenal (HT 0-0)
//   MD3: Arsenal v Everton, Brighton v Arsenal (not played yet)
const SEASON: ApiMatch[] = [
	game(3, '2026-12-01', BRIGHTON, ARSENAL),
	game(2, '2026-08-08', BRIGHTON, CHELSEA, [3, 1], [0, 1]),
	game(1, '2026-08-01', ARSENAL, BRIGHTON, [2, 0], [1, 0]),
	game(3, '2026-08-15', ARSENAL, EVERTON),
	game(2, '2026-08-09', DERBY, ARSENAL, [0, 0], [0, 0]),
	game(1, '2026-08-02', CHELSEA, DERBY, [1, 1], [0, 1]),
];

const names = (rows: { team: { shortName: string } }[]) => rows.map((r) => r.team.shortName);

describe('buildTable', () => {
	it('builds the overall table with correct figures and order, including teams yet to play', () => {
		const table = buildTable(SEASON);
		expect(names(table)).toEqual(['Arsenal', 'Brighton', 'Derby', 'Chelsea', 'Everton']);
		expect(table.map((r) => r.position)).toEqual([1, 2, 3, 4, 5]);
		expect(table[0]).toMatchObject({ played: 2, won: 1, drawn: 1, lost: 0, goalsFor: 2, goalsAgainst: 0, goalDifference: 2, points: 4 });
		expect(table[3]).toMatchObject({ played: 2, won: 0, drawn: 1, lost: 1, goalsFor: 2, goalsAgainst: 4, goalDifference: -2, points: 1 });
		expect(table[4]).toMatchObject({ played: 0, points: 0, form: [] });
	});

	it('builds home and away tables from only those games', () => {
		expect(names(buildTable(SEASON, 'home'))).toEqual(['Brighton', 'Arsenal', 'Chelsea', 'Derby', 'Everton']);
		expect(names(buildTable(SEASON, 'away'))).toEqual(['Derby', 'Arsenal', 'Everton', 'Chelsea', 'Brighton']);
		expect(buildTable(SEASON, 'home').find((r) => r.team.id === ARSENAL.id)).toMatchObject({ played: 1, points: 3, form: ['W'] });
	});

	it('breaks ties on goal difference, then goals scored, then name', () => {
		const table = buildTable([
			game(1, '2026-08-01', CHELSEA, ARSENAL, [2, 2]),
			game(1, '2026-08-02', BRIGHTON, DERBY, [1, 1]),
		]);
		// All four have 1 point and 0 goal difference; Arsenal and Chelsea scored more, then alphabetical.
		expect(names(table)).toEqual(['Arsenal', 'Chelsea', 'Brighton', 'Derby']);
	});

	it('keeps the last five results as form, oldest first', () => {
		const scores: [number, number][] = [[0, 1], [1, 0], [2, 0], [0, 3], [1, 1], [4, 0]];
		const games = scores.map((score, i) => game(i + 1, `2026-08-0${i + 1}`, ARSENAL, BRIGHTON, score));
		expect(buildTable(games.reverse())[0].form).toEqual(['W', 'W', 'L', 'D', 'W']);
	});
});

describe('teamStats', () => {
	it('works out per-game, clean sheet and half-time stats for each team, alphabetically', () => {
		const stats = teamStats(SEASON);
		expect(names(stats)).toEqual(['Arsenal', 'Brighton', 'Chelsea', 'Derby', 'Everton']);
		expect(stats[0]).toMatchObject({
			played: 2,
			goalsPerGame: 1,
			concededPerGame: 0,
			pointsPerGame: 2,
			winRate: 50,
			cleanSheets: 2,
			failedToScore: 1,
			halfTime: { leading: 1, level: 1, trailing: 0 },
			comebacks: 0,
		});
	});

	it('counts games behind at half-time that were not lost as comebacks', () => {
		const [, brighton, chelsea] = teamStats(SEASON);
		// Brighton: behind at half-time twice, lost one and won one.
		expect(brighton).toMatchObject({ halfTime: { leading: 0, level: 0, trailing: 2 }, comebacks: 1 });
		// Chelsea: drew from behind against Derby, lost from ahead against Brighton.
		expect(chelsea).toMatchObject({ halfTime: { leading: 1, level: 0, trailing: 1 }, comebacks: 1 });
	});

	it('rounds per-game figures to 2 decimals and gives zeros (not NaN) to teams without games', () => {
		const stats = teamStats([
			game(1, '2026-08-01', ARSENAL, BRIGHTON, [0, 1]),
			game(2, '2026-08-08', CHELSEA, ARSENAL, [0, 0]),
			game(3, '2026-08-15', ARSENAL, BRIGHTON, [0, 2]),
			game(4, '2026-08-22', ARSENAL, EVERTON),
		]);
		expect(stats[0]).toMatchObject({ played: 3, pointsPerGame: 0.33, concededPerGame: 1, winRate: 0 });
		expect(stats.find((s) => s.team.id === EVERTON.id)).toMatchObject({
			played: 0,
			goalsPerGame: 0,
			pointsPerGame: 0,
			winRate: 0,
		});
	});

	it('leaves games without a half-time score out of the half-time record', () => {
		const [arsenal] = teamStats([game(1, '2026-08-01', ARSENAL, BRIGHTON, [1, 0])]);
		expect(arsenal).toMatchObject({ played: 1, halfTime: { leading: 0, level: 0, trailing: 0 } });
	});
});

describe('positionHistory', () => {
	it('gives every team its position after each played matchday', () => {
		const history = positionHistory(SEASON);
		expect(history.matchdays).toEqual([1, 2]);
		const positions = Object.fromEntries(history.teams.map((t) => [t.team.shortName, t.positions]));
		expect(positions).toEqual({
			Arsenal: [1, 1],
			Brighton: [5, 2],
			Chelsea: [2, 4],
			Derby: [3, 3],
			Everton: [4, 5],
		});
	});

	it('ends on the same positions as the current table', () => {
		const history = positionHistory(SEASON);
		for (const row of buildTable(SEASON)) {
			expect(history.teams.find((t) => t.team.id === row.team.id)?.positions.at(-1)).toBe(row.position);
		}
	});
});

describe('headToHead', () => {
	it('lists both meetings in date order, home or away, with no score for unplayed games', () => {
		const meetings = headToHead(SEASON, BRIGHTON.id, ARSENAL.id);
		expect(meetings.map((m) => [m.home.shortName, m.away.shortName, m.score])).toEqual([
			['Arsenal', 'Brighton', { home: 2, away: 0 }],
			['Brighton', 'Arsenal', null],
		]);
	});

	it('returns nothing for teams that do not meet', () => {
		expect(headToHead(SEASON, CHELSEA.id, EVERTON.id)).toEqual([]);
	});
});

const UNITED = team(MAN_UNITED_ID, 'Man United');

const scorer = (id: number, name: string, scorerTeam: ReturnType<typeof team>, goals: number): ApiLeagueScorer => ({
	player: { id, name, nationality: 'England' },
	team: scorerTeam,
	goals,
	assists: null,
	playedMatches: 6,
});

describe('leagueScorers', () => {
	it('lists every scorer with their team, most goals first, keeping missing assists as null', () => {
		const scorers = leagueScorers([scorer(1, 'Saka', ARSENAL, 2), scorer(2, 'Bruno', UNITED, 3)]);
		expect(scorers.map((s) => [s.name, s.team.shortName, s.goals, s.assists])).toEqual([
			['Bruno', 'Man United', 3, null],
			['Saka', 'Arsenal', 2, null],
		]);
	});
});

describe('squadSummary', () => {
	const player = (id: number, name: string, position: string | null, dateOfBirth: string | null = null): ApiSquadPlayer => ({
		id,
		name,
		position,
		dateOfBirth,
		nationality: 'England',
	});

	it('groups by position, goalkeepers first, with scorers first and unknown positions last', () => {
		const squad = squadSummary(
			[
				player(1, 'Zirkzee', 'Offence'),
				player(2, 'Armer', null),
				player(3, 'Amad', 'Offence'),
				player(4, 'Onana', 'Goalkeeper'),
				player(5, 'Mbeumo', 'Offence'),
				player(6, 'Mainoo', 'Midfield'),
			],
			[scorer(5, 'Mbeumo', UNITED, 3), scorer(99, 'Saka', ARSENAL, 2)],
		);
		expect(squad.map((p) => [p.name, p.position, p.goals])).toEqual([
			['Onana', 'Goalkeeper', 0],
			['Mainoo', 'Midfield', 0],
			['Mbeumo', 'Offence', 3],
			['Amad', 'Offence', 0],
			['Zirkzee', 'Offence', 0],
			['Armer', 'Other', 0],
		]);
	});

	it('works out ages, counting a birthday only once it has happened', () => {
		const today = new Date('2026-10-15T12:00:00Z');
		const ages = squadSummary(
			[
				player(1, 'Before', 'Midfield', '2000-10-14'),
				player(2, 'On', 'Midfield', '2000-10-15'),
				player(3, 'After', 'Midfield', '2000-10-16'),
				player(4, 'Unknown', 'Midfield', null),
			],
			[],
			MAN_UNITED_ID,
			today,
		).map((p) => [p.name, p.age]);
		expect(ages).toEqual([
			['After', 25],
			['Before', 26],
			['On', 26],
			['Unknown', null],
		]);
	});
});

describe('fetchPremierLeagueData', () => {
	const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

	it('makes the three API calls with the key header and derives every table and stat', async () => {
		const season = [...SEASON, game(4, '2026-09-01', UNITED, ARSENAL, [1, 0]), game(5, '2026-12-20', CHELSEA, UNITED)];
		const fetchFn = vi.fn(async (url: string | URL | Request) => {
			const path = String(url);
			if (path.endsWith('/matches')) return json({ matches: season });
			if (path.includes('/scorers')) return json({ scorers: [scorer(7, 'Bruno', UNITED, 1)] });
			return json({ squad: [{ id: 7, name: 'Bruno', position: 'Midfield', dateOfBirth: null, nationality: 'Portugal' }] });
		});

		const data = await fetchPremierLeagueData('test-key', fetchFn as typeof fetch);

		expect(fetchFn.mock.calls.map(([url]) => String(url))).toEqual([
			'https://api.football-data.org/v4/competitions/PL/matches',
			'https://api.football-data.org/v4/competitions/PL/scorers?limit=100',
			`https://api.football-data.org/v4/teams/${MAN_UNITED_ID}`,
		]);
		for (const [, init] of fetchFn.mock.calls as unknown as [string, RequestInit][]) {
			expect(init.headers).toEqual({ 'X-Auth-Token': 'test-key' });
		}
		expect(data.tables.all).toHaveLength(6);
		expect(data.tables.home.find((r) => r.team.id === MAN_UNITED_ID)?.points).toBe(3);
		expect(data.stats).toHaveLength(6);
		expect(data.positionHistory.matchdays).toEqual([1, 2, 4]);
		expect(Object.keys(data.headToHead)).toHaveLength(5);
		expect(data.headToHead[ARSENAL.id].map((m) => m.score)).toEqual([{ home: 1, away: 0 }]);
		expect(data.headToHead[CHELSEA.id].map((m) => m.score)).toEqual([null]);
		expect(data.headToHead[BRIGHTON.id]).toEqual([]);
		expect(data.scorers.map((s) => s.name)).toEqual(['Bruno']);
		expect(data.squad).toMatchObject([{ name: 'Bruno', position: 'Midfield', goals: 1 }]);
	});

	it('throws a FootballDataError carrying the status when the API refuses', async () => {
		const fetchFn = vi.fn(async () => json({ message: 'Too many requests' }, 429));
		const error = await fetchPremierLeagueData('test-key', fetchFn as typeof fetch).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(FootballDataError);
		expect((error as FootballDataError).status).toBe(429);
	});
});
