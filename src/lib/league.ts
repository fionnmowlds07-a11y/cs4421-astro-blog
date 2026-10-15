// Premier League stats derived from a season's matches.
// The free football-data.org tier only returns the overall table (with form: null), so home/away
// tables, form, clean sheets, half-time records and position history are worked out here from results.
// The mapping functions are pure (no network), so they can be unit tested with fixture data;
// the network section at the bottom loads and caches everything the stats pages need.

import {
	type ApiMatch,
	type ApiScorer,
	type ApiTeam,
	createTtlCache,
	type FetchFn,
	getJson,
	MAN_UNITED_ID,
	type Outcome,
} from './football';

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

export interface ApiLeagueScorer extends ApiScorer {
	team: ApiTeam;
}

export interface ApiSquadPlayer {
	id: number;
	name: string;
	position: string | null;
	dateOfBirth: string | null;
	nationality: string | null;
}

export interface LeagueScorer {
	playerId: number;
	name: string;
	nationality: string | null;
	team: TeamInfo;
	goals: number;
	/** null on the free tier, which doesn't report assists. */
	assists: number | null;
	playedMatches: number | null;
}

export type PositionGroup = 'Goalkeeper' | 'Defence' | 'Midfield' | 'Offence' | 'Other';

export interface SquadPlayer {
	id: number;
	name: string;
	position: PositionGroup;
	age: number | null;
	nationality: string | null;
	goals: number;
}

export interface PremierLeagueData {
	tables: Record<Venue, TableRow[]>;
	stats: TeamStats[];
	positionHistory: PositionHistory;
	/** United's league meetings with each opponent, keyed by the opponent's team id. */
	headToHead: Record<number, HeadToHeadMatch[]>;
	scorers: LeagueScorer[];
	squad: SquadPlayer[];
	updatedAt: string;
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

export interface StatMetric {
	key: string;
	label: string;
	short: string;
	/** Whether a bigger number is better (goals scored) or worse (goals conceded). */
	better: 'high' | 'low';
	value: (stats: TeamStats) => number;
	format: (value: number) => string;
	hint?: string;
}

const decimal = (value: number) => value.toFixed(2);
const whole = (value: number) => String(value);

/** The team stats shown on the Stats and Compare pages, in display order. */
export const STAT_METRICS: StatMetric[] = [
	{ key: 'pointsPerGame', label: 'Points per game', short: 'PPG', better: 'high', value: (s) => s.pointsPerGame, format: decimal },
	{ key: 'winRate', label: 'Win rate', short: 'Win %', better: 'high', value: (s) => s.winRate, format: (v) => `${Math.round(v)}%` },
	{ key: 'goalsPerGame', label: 'Goals per game', short: 'GF/G', better: 'high', value: (s) => s.goalsPerGame, format: decimal },
	{ key: 'concededPerGame', label: 'Conceded per game', short: 'GA/G', better: 'low', value: (s) => s.concededPerGame, format: decimal },
	{ key: 'cleanSheets', label: 'Clean sheets', short: 'CS', better: 'high', value: (s) => s.cleanSheets, format: whole },
	{ key: 'failedToScore', label: 'Failed to score', short: 'FTS', better: 'low', value: (s) => s.failedToScore, format: whole },
	{
		key: 'leadingAtHalfTime',
		label: 'Ahead at half-time',
		short: 'HT ▲',
		better: 'high',
		value: (s) => s.halfTime.leading,
		format: whole,
	},
	{
		key: 'trailingAtHalfTime',
		label: 'Behind at half-time',
		short: 'HT ▼',
		better: 'low',
		value: (s) => s.halfTime.trailing,
		format: whole,
	},
	{
		key: 'comebacks',
		label: 'Comebacks',
		short: 'CB',
		better: 'high',
		value: (s) => s.comebacks,
		format: whole,
		hint: 'Behind at half-time but didn’t lose',
	},
];

export interface StatRank {
	value: number;
	/** 1 = best in the league. Tied teams share a rank, like a sports table ("=3rd"). */
	rank: number;
	tied: boolean;
	of: number;
	best: number;
	worst: number;
	average: number;
}

/**
 * Where a team sits in the league for one stat, plus the league's best, worst and average.
 * Teams yet to play are left out, so their zeros don't skew the ranking.
 */
export function rankFor(stats: TeamStats[], metric: StatMetric, teamId: number): StatRank | null {
	const ranked = stats.filter((s) => s.played > 0);
	const team = ranked.find((s) => s.team.id === teamId);
	if (!team) return null;
	const values = ranked.map(metric.value);
	const value = metric.value(team);
	const isBetter = (other: number) => (metric.better === 'high' ? other > value : other < value);
	const sorted = [...values].sort((a, b) => (metric.better === 'high' ? b - a : a - b));
	return {
		value,
		rank: 1 + values.filter(isBetter).length,
		tied: values.filter((v) => v === value).length > 1,
		of: values.length,
		best: sorted[0],
		worst: sorted[sorted.length - 1],
		average: round2(values.reduce((sum, v) => sum + v, 0) / values.length),
	};
}

/** The league's top scorers, most goals first (ties keep the API's order, which favours fewer games). */
export function leagueScorers(scorers: ApiLeagueScorer[]): LeagueScorer[] {
	return scorers
		.map((s) => ({
			playerId: s.player.id,
			name: s.player.name,
			nationality: s.player.nationality ?? null,
			team: toTeamInfo(s.team),
			goals: s.goals,
			assists: s.assists,
			playedMatches: s.playedMatches ?? null,
		}))
		.sort((a, b) => b.goals - a.goals);
}

const POSITION_ORDER: PositionGroup[] = ['Goalkeeper', 'Defence', 'Midfield', 'Offence', 'Other'];

function ageOn(dateOfBirth: string | null, today: Date): number | null {
	if (!dateOfBirth) return null;
	const born = new Date(dateOfBirth);
	const hadBirthday =
		today.getUTCMonth() > born.getUTCMonth() ||
		(today.getUTCMonth() === born.getUTCMonth() && today.getUTCDate() >= born.getUTCDate());
	return today.getUTCFullYear() - born.getUTCFullYear() - (hadBirthday ? 0 : 1);
}

/**
 * The squad grouped by position (goalkeepers first), with ages and league goals from the scorer list.
 * Within a position, scorers come first, then alphabetical.
 */
export function squadSummary(
	squad: ApiSquadPlayer[],
	scorers: ApiScorer[],
	teamId = MAN_UNITED_ID,
	today = new Date(),
): SquadPlayer[] {
	const goals = new Map(scorers.filter((s) => s.team.id === teamId).map((s) => [s.player.id, s.goals]));
	const groupOf = (position: string | null): PositionGroup =>
		POSITION_ORDER.includes(position as PositionGroup) ? (position as PositionGroup) : 'Other';

	return squad
		.map((p) => ({
			id: p.id,
			name: p.name,
			position: groupOf(p.position),
			age: ageOn(p.dateOfBirth, today),
			nationality: p.nationality,
			goals: goals.get(p.id) ?? 0,
		}))
		.sort(
			(a, b) =>
				POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position) ||
				b.goals - a.goals ||
				a.name.localeCompare(b.name),
		);
}

// --- Network ---

/** Loads the whole season in 3 parallel requests and derives every table and stat from it. */
export async function fetchPremierLeagueData(apiKey: string, fetchFn: FetchFn = fetch): Promise<PremierLeagueData> {
	const [season, scorers, team] = await Promise.all([
		getJson<{ matches: ApiMatch[] }>('/competitions/PL/matches', apiKey, fetchFn),
		getJson<{ scorers: ApiLeagueScorer[] }>('/competitions/PL/scorers?limit=100', apiKey, fetchFn),
		getJson<{ squad: ApiSquadPlayer[] }>(`/teams/${MAN_UNITED_ID}`, apiKey, fetchFn),
	]);
	const matches = season.matches;
	const opponents = [...new Set(matches.flatMap((m) => [m.homeTeam.id, m.awayTeam.id]))].filter(
		(id) => id !== MAN_UNITED_ID,
	);

	return {
		tables: { all: buildTable(matches, 'all'), home: buildTable(matches, 'home'), away: buildTable(matches, 'away') },
		stats: teamStats(matches),
		positionHistory: positionHistory(matches),
		headToHead: Object.fromEntries(opponents.map((id) => [id, headToHead(matches, MAN_UNITED_ID, id)])),
		scorers: leagueScorers(scorers.scorers),
		squad: squadSummary(team.squad, scorers.scorers),
		updatedAt: new Date().toISOString(),
	};
}

export const LEAGUE_TTL_MS = 10 * 60 * 1000;
const leagueCache = createTtlCache<PremierLeagueData>(LEAGUE_TTL_MS);

/**
 * Cached league data: 3 requests per 10 minutes per running server. Together with the
 * Man United summary (also 3) that stays well inside the free tier's 10 requests per minute.
 */
export function getPremierLeagueData(apiKey: string): Promise<PremierLeagueData> {
	return leagueCache.get('premier-league', () => fetchPremierLeagueData(apiKey));
}
