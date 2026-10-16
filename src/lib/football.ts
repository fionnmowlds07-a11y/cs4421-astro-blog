// Server-side client for the football-data.org v4 API (free tier: 10 requests/minute).
// The raw API shapes are mapped into a small summary that the page and API endpoint render.
// Mapping functions are pure (no network), so they can be unit tested with fixture data.

const BASE_URL = 'https://api.football-data.org/v4';
export const MAN_UNITED_ID = 66;
const RECENT_COUNT = 5;
const UPCOMING_COUNT = 5;
const REQUEST_TIMEOUT_MS = 8000;

// --- Raw API shapes (only the fields this site uses) ---

export interface ApiTeam {
	id: number;
	name: string;
	shortName: string;
	tla?: string;
	crest: string;
}

interface ApiScore {
	home: number | null;
	away: number | null;
}

export interface ApiMatch {
	id: number;
	utcDate: string;
	status: string;
	matchday?: number | null;
	competition: { code: string; name: string };
	homeTeam: ApiTeam;
	awayTeam: ApiTeam;
	score: { fullTime: ApiScore; halfTime?: ApiScore };
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
	player: { id: number; name: string; nationality?: string | null };
	team: { id: number };
	goals: number;
	assists: number | null;
	playedMatches?: number;
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

export interface CacheOptions {
	/** How long a value is fresh: served straight from the cache with no refresh. */
	freshMs: number;
	/** How long an old value may still be shown while it's refreshed in the background. */
	maxStaleMs: number;
	/** After a failed background refresh, how long to wait before trying again (protects the rate limit). */
	retryMs: number;
	/** Called when a background refresh fails (foreground failures reach the caller instead). */
	onRefreshError?: (error: unknown) => void;
	now?: () => number;
}

export interface CacheResult<T> {
	value: T;
	/** True when the value is old because the last refresh failed. */
	refreshFailed: boolean;
}

interface CacheEntry<T> {
	value?: T;
	loadedAt: number;
	refreshFailed: boolean;
	retryAfter: number;
	inFlight?: Promise<T>;
}

/**
 * A stale-while-revalidate cache. Fresh values are served as they are. Stale values (older than
 * freshMs, younger than maxStaleMs) are served instantly while one background refresh runs; if that
 * refresh fails, the old value stays and is flagged. Values older than maxStaleMs, or no value at all,
 * wait for a load, and a failed load is thrown and not cached, so the next call retries.
 * Concurrent callers always share one in-flight load.
 */
export function createRefreshingCache<T>(options: CacheOptions) {
	const { freshMs, maxStaleMs, retryMs, onRefreshError, now = Date.now } = options;
	const entries = new Map<string, CacheEntry<T>>();

	function entryFor(key: string): CacheEntry<T> {
		let entry = entries.get(key);
		if (!entry) {
			entry = { loadedAt: 0, refreshFailed: false, retryAfter: 0 };
			entries.set(key, entry);
		}
		return entry;
	}

	function startLoad(entry: CacheEntry<T>, load: () => Promise<T>): Promise<T> {
		if (!entry.inFlight) {
			entry.inFlight = load()
				.then((value) => {
					Object.assign(entry, { value, loadedAt: now(), refreshFailed: false, retryAfter: 0 });
					return value;
				})
				.finally(() => {
					entry.inFlight = undefined;
				});
		}
		return entry.inFlight;
	}

	return {
		async get(key: string, load: () => Promise<T>): Promise<CacheResult<T>> {
			const entry = entryFor(key);
			const age = now() - entry.loadedAt;

			if (entry.value !== undefined && age < freshMs) {
				return { value: entry.value, refreshFailed: false };
			}

			if (entry.value !== undefined && age < maxStaleMs) {
				if (!entry.inFlight && now() >= entry.retryAfter) {
					startLoad(entry, load).catch((error: unknown) => {
						entry.refreshFailed = true;
						entry.retryAfter = now() + retryMs;
						onRefreshError?.(error);
					});
				}
				return { value: entry.value, refreshFailed: entry.refreshFailed };
			}

			// Nothing usable: drop anything too old and wait for a load.
			entry.value = undefined;
			return { value: await startLoad(entry, load), refreshFailed: false };
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

export type FetchFn = typeof fetch;

export async function getJson<T>(path: string, apiKey: string, fetchFn: FetchFn): Promise<T> {
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

/** Writes one structured JSON log line for a failed football-data.org request. */
export function logFootballDataError(error: unknown) {
	console.error(
		JSON.stringify({
			timestamp: new Date().toISOString(),
			level: 'ERROR',
			event: 'football_data_failed',
			upstreamStatus: error instanceof FootballDataError ? (error.status ?? null) : null,
			message: error instanceof Error ? error.message : String(error),
		}),
	);
}

/**
 * Shared cache settings for football data: fresh for 10 minutes, then shown for up to 24 hours
 * while refreshing in the background, retrying a failed refresh at most once a minute.
 */
export const FOOTBALL_CACHE_OPTIONS = {
	freshMs: 10 * 60 * 1000,
	maxStaleMs: 24 * 60 * 60 * 1000,
	retryMs: 60 * 1000,
	onRefreshError: logFootballDataError,
} satisfies CacheOptions;

const summaryCache = createRefreshingCache<ManUnitedSummary>(FOOTBALL_CACHE_OPTIONS);

/** Cached summary: at most 3 API requests per 10 minutes per running server, well inside the free tier. */
export async function getManUnitedSummary(apiKey: string): Promise<ManUnitedSummary> {
	return (await summaryCache.get('man-united', () => fetchManUnitedSummary(apiKey))).value;
}
