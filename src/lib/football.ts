// Server-side client for the football-data.org v4 API (free tier: 10 requests/minute).
// The raw API shapes are mapped into a small summary that the page and API endpoint render.
// Mapping functions are pure (no network), so they can be unit tested with fixture data.

const BASE_URL = 'https://api.football-data.org/v4';
export const MAN_UNITED_ID = 66;
const RECENT_COUNT = 5;
const UPCOMING_COUNT = 5;
const REQUEST_TIMEOUT_MS = 8000;

// --- Raw API shapes (only the fields this site uses) ---

interface ApiTeam {
	id: number;
	name: string;
	shortName: string;
	crest: string;
}

export interface ApiMatch {
	id: number;
	utcDate: string;
	status: string;
	competition: { code: string; name: string };
	homeTeam: ApiTeam;
	awayTeam: ApiTeam;
	score: { fullTime: { home: number | null; away: number | null } };
}

export interface ApiTableRow {
	position: number;
	team: ApiTeam;
	playedGames: number;
	won: number;
	draw: number;
	lost: number;
	points: number;
	goalsFor: number;
	goalsAgainst: number;
	goalDifference: number;
}

export interface ApiStandings {
	standings: { type: string; table: ApiTableRow[] }[];
}

export interface ApiScorer {
	player: { id: number; name: string };
	team: { id: number };
	goals: number;
	assists: number | null;
}

// --- Summary shapes used by the site ---

export type Outcome = 'W' | 'D' | 'L';

export interface MatchSummary {
	id: number;
	date: string;
	competition: string;
	opponent: string;
	opponentCrest: string;
	venue: 'H' | 'A';
}

export interface ResultSummary extends MatchSummary {
	goalsFor: number;
	goalsAgainst: number;
	outcome: Outcome;
}

export interface LeagueSummary {
	position: number;
	played: number;
	won: number;
	drawn: number;
	lost: number;
	points: number;
	goalDifference: number;
}

export interface ScorerSummary {
	name: string;
	goals: number;
	assists: number;
}

export interface ManUnitedSummary {
	league: LeagueSummary | null;
	form: Outcome[];
	recentResults: ResultSummary[];
	upcomingFixtures: MatchSummary[];
	topScorers: ScorerSummary[];
	updatedAt: string;
}

// --- Pure mapping (unit tested) ---

const UPCOMING_STATUSES = new Set(['SCHEDULED', 'TIMED']);

function toMatchSummary(match: ApiMatch, teamId: number): MatchSummary {
	const isHome = match.homeTeam.id === teamId;
	const opponent = isHome ? match.awayTeam : match.homeTeam;
	return {
		id: match.id,
		date: match.utcDate,
		competition: match.competition.code,
		opponent: opponent.shortName || opponent.name,
		opponentCrest: opponent.crest,
		venue: isHome ? 'H' : 'A',
	};
}

/** Splits a season's matches into the latest results (newest first) and the next fixtures (soonest first). */
export function summariseMatches(matches: ApiMatch[], teamId = MAN_UNITED_ID) {
	const byDate = [...matches].sort((a, b) => a.utcDate.localeCompare(b.utcDate));

	const recentResults: ResultSummary[] = byDate
		.filter((m) => m.status === 'FINISHED' && m.score.fullTime.home !== null && m.score.fullTime.away !== null)
		.slice(-RECENT_COUNT)
		.reverse()
		.map((m) => {
			const isHome = m.homeTeam.id === teamId;
			const goalsFor = (isHome ? m.score.fullTime.home : m.score.fullTime.away) as number;
			const goalsAgainst = (isHome ? m.score.fullTime.away : m.score.fullTime.home) as number;
			const outcome: Outcome = goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D';
			return { ...toMatchSummary(m, teamId), goalsFor, goalsAgainst, outcome };
		});

	const upcomingFixtures = byDate
		.filter((m) => UPCOMING_STATUSES.has(m.status))
		.slice(0, UPCOMING_COUNT)
		.map((m) => toMatchSummary(m, teamId));

	// The free tier returns form: null, so form is derived from results (oldest to newest, like a form guide).
	const form = recentResults.map((r) => r.outcome).reverse();

	return { recentResults, upcomingFixtures, form };
}

/** Finds the team's row in the overall (TOTAL) league table. */
export function leagueSummary(standings: ApiStandings, teamId = MAN_UNITED_ID): LeagueSummary | null {
	const table = standings.standings.find((s) => s.type === 'TOTAL')?.table ?? [];
	const row = table.find((r) => r.team.id === teamId);
	if (!row) return null;
	return {
		position: row.position,
		played: row.playedGames,
		won: row.won,
		drawn: row.draw,
		lost: row.lost,
		points: row.points,
		goalDifference: row.goalDifference,
	};
}

/** The team's players from the league scorer list, most goals first (ties broken by assists). */
export function teamScorers(scorers: ApiScorer[], teamId = MAN_UNITED_ID): ScorerSummary[] {
	return scorers
		.filter((s) => s.team.id === teamId)
		.map((s) => ({ name: s.player.name, goals: s.goals, assists: s.assists ?? 0 }))
		.sort((a, b) => b.goals - a.goals || b.assists - a.assists);
}

// --- Cache ---

/**
 * Remembers each loaded value for ttlMs. Concurrent callers share one in-flight request,
 * and failures are not cached, so the next request retries.
 */
export function createTtlCache<T>(ttlMs: number, now: () => number = Date.now) {
	const entries = new Map<string, { expires: number; value: Promise<T> }>();
	return {
		async get(key: string, load: () => Promise<T>): Promise<T> {
			const hit = entries.get(key);
			if (hit && hit.expires > now()) return hit.value;
			const value = load();
			entries.set(key, { expires: now() + ttlMs, value });
			value.catch(() => entries.delete(key));
			return value;
		},
		clear() {
			entries.clear();
		},
	};
}

// --- Network ---

export class FootballDataError extends Error {
	readonly status?: number;

	constructor(message: string, status?: number) {
		super(message);
		this.name = 'FootballDataError';
		this.status = status;
	}
}

type FetchFn = typeof fetch;

async function getJson<T>(path: string, apiKey: string, fetchFn: FetchFn): Promise<T> {
	const response = await fetchFn(`${BASE_URL}${path}`, {
		headers: { 'X-Auth-Token': apiKey },
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new FootballDataError(`football-data.org responded ${response.status} for ${path}`, response.status);
	}
	return (await response.json()) as T;
}

/** Fetches the three endpoints in parallel (3 requests) and maps them into a summary. */
export async function fetchManUnitedSummary(apiKey: string, fetchFn: FetchFn = fetch): Promise<ManUnitedSummary> {
	const [matches, standings, scorers] = await Promise.all([
		getJson<{ matches: ApiMatch[] }>(`/teams/${MAN_UNITED_ID}/matches`, apiKey, fetchFn),
		getJson<ApiStandings>('/competitions/PL/standings', apiKey, fetchFn),
		getJson<{ scorers: ApiScorer[] }>('/competitions/PL/scorers?limit=100', apiKey, fetchFn),
	]);
	return {
		league: leagueSummary(standings),
		...summariseMatches(matches.matches),
		topScorers: teamScorers(scorers.scorers),
		updatedAt: new Date().toISOString(),
	};
}

export const SUMMARY_TTL_MS = 10 * 60 * 1000;
const summaryCache = createTtlCache<ManUnitedSummary>(SUMMARY_TTL_MS);

/** Cached summary: at most 3 API requests per 10 minutes per running server, well inside the free tier. */
export function getManUnitedSummary(apiKey: string): Promise<ManUnitedSummary> {
	return summaryCache.get('man-united', () => fetchManUnitedSummary(apiKey));
}
