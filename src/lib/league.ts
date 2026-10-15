// Premier League stats derived from a season's matches.
// The free football-data.org tier only returns the overall table (with form: null), so home/away
// tables, form, clean sheets, half-time records and position history are worked out here from results.
// Every function is pure (no network), so they can be unit tested with fixture data.

import type { ApiMatch, ApiTeam, Outcome } from './football';

const FORM_LENGTH = 5;

export type Venue = 'all' | 'home' | 'away';

export interface TeamInfo {
	id: number;
	name: string;
	shortName: string;
	tla: string;
	crest: string;
}

export interface TableRow {
	position: number;
	team: TeamInfo;
	played: number;
	won: number;
	drawn: number;
	lost: number;
	goalsFor: number;
	goalsAgainst: number;
	goalDifference: number;
	points: number;
	/** Last five results in this table's games, oldest first (like a form guide). */
	form: Outcome[];
}

export interface TeamStats {
	team: TeamInfo;
	played: number;
	goalsFor: number;
	goalsAgainst: number;
	goalsPerGame: number;
	concededPerGame: number;
	pointsPerGame: number;
	winRate: number;
	cleanSheets: number;
	failedToScore: number;
	halfTime: { leading: number; level: number; trailing: number };
	/** Games behind at half-time that were not lost. */
	comebacks: number;
}

export interface PositionHistory {
	matchdays: number[];
	teams: { team: TeamInfo; positions: number[] }[];
}

export interface HeadToHeadMatch {
	id: number;
	date: string;
	status: string;
	home: TeamInfo;
	away: TeamInfo;
	score: { home: number; away: number } | null;
}

/** One team's side of a finished match. */
interface TeamResult {
	teamId: number;
	date: string;
	matchday: number | null;
	venue: 'home' | 'away';
	goalsFor: number;
	goalsAgainst: number;
	halfTimeFor: number | null;
	halfTimeAgainst: number | null;
	outcome: Outcome;
}

function toTeamInfo(team: ApiTeam): TeamInfo {
	return {
		id: team.id,
		name: team.name,
		shortName: team.shortName || team.name,
		tla: team.tla ?? team.shortName.slice(0, 3).toUpperCase(),
		crest: team.crest,
	};
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const perGame = (total: number, played: number) => (played ? round2(total / played) : 0);

function outcomeOf(goalsFor: number, goalsAgainst: number): Outcome {
	return goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D';
}

/** Every team that appears in the matches (finished or not), so teams yet to play still get a row. */
function teamsIn(matches: ApiMatch[]): Map<number, TeamInfo> {
	const teams = new Map<number, TeamInfo>();
	for (const m of matches) {
		if (!teams.has(m.homeTeam.id)) teams.set(m.homeTeam.id, toTeamInfo(m.homeTeam));
		if (!teams.has(m.awayTeam.id)) teams.set(m.awayTeam.id, toTeamInfo(m.awayTeam));
	}
	return teams;
}

const isFinished = (m: ApiMatch) =>
	m.status === 'FINISHED' && m.score.fullTime.home !== null && m.score.fullTime.away !== null;

/** Splits each finished match into a result for the home side and one for the away side, oldest first. */
function teamResults(matches: ApiMatch[]): TeamResult[] {
	return matches
		.filter(isFinished)
		.sort((a, b) => a.utcDate.localeCompare(b.utcDate))
		.flatMap((m) => {
			const home = m.score.fullTime.home as number;
			const away = m.score.fullTime.away as number;
			const htHome = m.score.halfTime?.home ?? null;
			const htAway = m.score.halfTime?.away ?? null;
			const shared = { date: m.utcDate, matchday: m.matchday ?? null };
			return [
				{
					...shared,
					teamId: m.homeTeam.id,
					venue: 'home' as const,
					goalsFor: home,
					goalsAgainst: away,
					halfTimeFor: htHome,
					halfTimeAgainst: htAway,
					outcome: outcomeOf(home, away),
				},
				{
					...shared,
					teamId: m.awayTeam.id,
					venue: 'away' as const,
					goalsFor: away,
					goalsAgainst: home,
					halfTimeFor: htAway,
					halfTimeAgainst: htHome,
					outcome: outcomeOf(away, home),
				},
			];
		});
}

function resultsByTeam(results: TeamResult[]): Map<number, TeamResult[]> {
	const byTeam = new Map<number, TeamResult[]>();
	for (const r of results) {
		const list = byTeam.get(r.teamId) ?? [];
		list.push(r);
		byTeam.set(r.teamId, list);
	}
	return byTeam;
}

/**
 * League table from results. Sorted by points, then goal difference, then goals scored, then name.
 * (The Premier League's next tie-breaker is head-to-head, which only matters for exact ties late in a season.)
 */
export function buildTable(matches: ApiMatch[], venue: Venue = 'all'): TableRow[] {
	const results = teamResults(matches).filter((r) => venue === 'all' || r.venue === venue);
	const byTeam = resultsByTeam(results);

	const rows = [...teamsIn(matches).values()].map((team) => {
		const games = byTeam.get(team.id) ?? [];
		const won = games.filter((g) => g.outcome === 'W').length;
		const drawn = games.filter((g) => g.outcome === 'D').length;
		const goalsFor = games.reduce((sum, g) => sum + g.goalsFor, 0);
		const goalsAgainst = games.reduce((sum, g) => sum + g.goalsAgainst, 0);
		return {
			position: 0,
			team,
			played: games.length,
			won,
			drawn,
			lost: games.length - won - drawn,
			goalsFor,
			goalsAgainst,
			goalDifference: goalsFor - goalsAgainst,
			points: won * 3 + drawn,
			form: games.slice(-FORM_LENGTH).map((g) => g.outcome),
		};
	});

	return rows
		.sort(
			(a, b) =>
				b.points - a.points ||
				b.goalDifference - a.goalDifference ||
				b.goalsFor - a.goalsFor ||
				a.team.shortName.localeCompare(b.team.shortName),
		)
		.map((row, index) => ({ ...row, position: index + 1 }));
}

/** Per-team attacking, defensive and half-time stats, in alphabetical order. */
export function teamStats(matches: ApiMatch[]): TeamStats[] {
	const byTeam = resultsByTeam(teamResults(matches));

	return [...teamsIn(matches).values()]
		.sort((a, b) => a.shortName.localeCompare(b.shortName))
		.map((team) => {
			const games = byTeam.get(team.id) ?? [];
			const played = games.length;
			const count = (test: (g: TeamResult) => boolean) => games.filter(test).length;
			const goalsFor = games.reduce((sum, g) => sum + g.goalsFor, 0);
			const goalsAgainst = games.reduce((sum, g) => sum + g.goalsAgainst, 0);
			const won = count((g) => g.outcome === 'W');
			const points = won * 3 + count((g) => g.outcome === 'D');
			const withHalfTime = games.filter((g) => g.halfTimeFor !== null && g.halfTimeAgainst !== null);
			const trailingAtHalfTime = withHalfTime.filter((g) => (g.halfTimeFor as number) < (g.halfTimeAgainst as number));
			return {
				team,
				played,
				goalsFor,
				goalsAgainst,
				goalsPerGame: perGame(goalsFor, played),
				concededPerGame: perGame(goalsAgainst, played),
				pointsPerGame: perGame(points, played),
				winRate: played ? Math.round((won / played) * 100) : 0,
				cleanSheets: count((g) => g.goalsAgainst === 0),
				failedToScore: count((g) => g.goalsFor === 0),
				halfTime: {
					leading: withHalfTime.filter((g) => (g.halfTimeFor as number) > (g.halfTimeAgainst as number)).length,
					level: withHalfTime.filter((g) => g.halfTimeFor === g.halfTimeAgainst).length,
					trailing: trailingAtHalfTime.length,
				},
				comebacks: trailingAtHalfTime.filter((g) => g.outcome !== 'L').length,
			};
		});
}

/**
 * Each team's league position after every matchday that has finished games.
 * Postponed games count towards the matchday they were scheduled in, as on most "position by round" charts.
 */
export function positionHistory(matches: ApiMatch[]): PositionHistory {
	const finished = matches.filter((m) => isFinished(m) && m.matchday != null);
	const matchdays = [...new Set(finished.map((m) => m.matchday as number))].sort((a, b) => a - b);
	const teams = [...teamsIn(matches).values()];
	const positions = new Map<number, number[]>(teams.map((t) => [t.id, []]));

	for (const matchday of matchdays) {
		// Unfinished matches are kept in so every team gets a row, even before its first game.
		const upToMatchday = matches.filter((m) => !isFinished(m) || (m.matchday ?? Infinity) <= matchday);
		for (const row of buildTable(upToMatchday)) positions.get(row.team.id)?.push(row.position);
	}

	return { matchdays, teams: teams.map((team) => ({ team, positions: positions.get(team.id) ?? [] })) };
}

/** This season's league meetings between two teams, oldest first, including ones not yet played. */
export function headToHead(matches: ApiMatch[], teamA: number, teamB: number): HeadToHeadMatch[] {
	return matches
		.filter(
			(m) =>
				(m.homeTeam.id === teamA && m.awayTeam.id === teamB) || (m.homeTeam.id === teamB && m.awayTeam.id === teamA),
		)
		.sort((a, b) => a.utcDate.localeCompare(b.utcDate))
		.map((m) => ({
			id: m.id,
			date: m.utcDate,
			status: m.status,
			home: toTeamInfo(m.homeTeam),
			away: toTeamInfo(m.awayTeam),
			score: isFinished(m) ? { home: m.score.fullTime.home as number, away: m.score.fullTime.away as number } : null,
		}));
}
