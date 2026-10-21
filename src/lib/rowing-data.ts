// Everything the public Rowing page shows, loaded in one go with the public (read-only) Supabase client.
// Notes and heart rates stay private to the admin pages, so they're never selected here.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ERG_MACHINES } from './rowing-forms';

type Machine = (typeof ERG_MACHINES)[number];

export interface PersonalBest {
	session_id: string;
	machine: Machine;
	distance_m: number;
	label: string;
	duration_ds: number;
	avg_split_ds: number;
	avg_rate: number | null;
	session_date: string;
}

export interface SavedPiece {
	piece_no: number;
	distance_m: number;
	duration_ds: number;
	avg_split_ds: number;
	avg_rate: number | null;
}

export interface RecentSession {
	id: string;
	session_date: string;
	session_type: 'single' | 'intervals';
	description: string | null;
	distance_m: number;
	duration_ds: number;
	avg_split_ds: number;
	avg_rate: number | null;
	machine: Machine;
	is_test: boolean;
	erg_intervals: SavedPiece[];
}

export interface RecentOuting {
	id: string;
	outing_date: string;
	boat: string;
	crew: string | null;
	distance_m: number;
	duration_ds: number | null;
	avg_split_ds: number | null;
	conditions: string | null;
}

/** One 2k single piece, for the split-over-time chart. */
export interface TwoKPoint {
	session_date: string;
	duration_ds: number;
	avg_split_ds: number;
	machine: Machine;
	is_test: boolean;
}

export interface MachineBests {
	machine: Machine;
	bests: PersonalBest[];
}

export type RowingPageData =
	| {
			status: 'ok';
			personalBests: MachineBests[];
			sessions: RecentSession[];
			outings: RecentOuting[];
			twoK: TwoKPoint[];
	  }
	| { status: 'unavailable' };

export const RECENT_SESSIONS = 8;
export const RECENT_OUTINGS = 5;
/** A sleeping or unreachable database must not hold the page up for long. */
export const ROWING_TIMEOUT_MS = 3000;

const MACHINE_ORDER: Machine[] = ['concept2', 'rp3'];

/** PBs grouped by machine (Concept2 first), shortest distance first; machines without any PBs are left out. */
export function groupPersonalBests(rows: PersonalBest[]): MachineBests[] {
	return MACHINE_ORDER.map((machine) => ({
		machine,
		bests: rows.filter((r) => r.machine === machine).sort((a, b) => a.distance_m - b.distance_m),
	})).filter((group) => group.bests.length > 0);
}

/** Cache-Control for the Rowing page: a few minutes in shared caches, never when the data couldn't be loaded. */
export const rowingCacheControl = (status: RowingPageData['status']) =>
	status === 'ok' ? 'public, max-age=60, s-maxage=300' : 'no-store';

export function logRowingDataError(error: unknown) {
	console.error(
		JSON.stringify({
			timestamp: new Date().toISOString(),
			level: 'ERROR',
			event: 'rowing_data_failed',
			message: error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : String(error),
		}),
	);
}

/** Loads the Rowing page's data, or 'unavailable' if Supabase isn't set up, fails or takes too long. */
export async function loadRowingPage(
	client: SupabaseClient | null,
	timeoutMs = ROWING_TIMEOUT_MS,
): Promise<RowingPageData> {
	if (!client) return { status: 'unavailable' };
	const signal = AbortSignal.timeout(timeoutMs);
	try {
		const [pbs, sessions, outings, twoK] = await Promise.all([
			client.from('personal_bests').select('*').abortSignal(signal),
			client
				.from('erg_sessions')
				.select(
					'id, session_date, session_type, description, distance_m, duration_ds, avg_split_ds, avg_rate, machine, is_test, ' +
						'erg_intervals(piece_no, distance_m, duration_ds, avg_split_ds, avg_rate)',
				)
				.order('session_date', { ascending: false })
				.order('created_at', { ascending: false })
				.order('piece_no', { referencedTable: 'erg_intervals' })
				.limit(RECENT_SESSIONS)
				.abortSignal(signal),
			client
				.from('on_water_outings')
				.select('id, outing_date, boat, crew, distance_m, duration_ds, avg_split_ds, conditions')
				.order('outing_date', { ascending: false })
				.order('created_at', { ascending: false })
				.limit(RECENT_OUTINGS)
				.abortSignal(signal),
			client
				.from('erg_sessions')
				.select('session_date, duration_ds, avg_split_ds, machine, is_test')
				.eq('distance_m', 2000)
				.eq('session_type', 'single')
				.order('session_date', { ascending: true })
				.order('created_at', { ascending: true })
				.limit(200)
				.abortSignal(signal),
		]);
		const failed = [pbs, sessions, outings, twoK].find((result) => result.error);
		if (failed) {
			logRowingDataError(failed.error);
			return { status: 'unavailable' };
		}
		return {
			status: 'ok',
			personalBests: groupPersonalBests(pbs.data as PersonalBest[]),
			sessions: sessions.data as unknown as RecentSession[],
			outings: outings.data as RecentOuting[],
			twoK: twoK.data as TwoKPoint[],
		};
	} catch (error) {
		// e.g. the timeout, or no network at all.
		logRowingDataError(error);
		return { status: 'unavailable' };
	}
}
