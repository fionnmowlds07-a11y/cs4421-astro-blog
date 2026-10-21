// Checks the admin forms before anything is saved. Pure functions, so every rule can be unit tested;
// the limits match the check constraints in supabase/migrations/*_rowing_tables.sql and *_erg_intervals.sql.
import { durationFromSplit, formatTime, parseTime } from './rowing-time';

export const ERG_MACHINES = ['concept2', 'rp3'] as const;
export const ERG_SESSION_TYPES = ['single', 'intervals'] as const;
export const BOAT_CLASSES = ['1x', '2x', '2-', '4x', '4-', '4+', '8+'] as const;

export interface ErgSessionRow {
	session_date: string;
	session_type: (typeof ERG_SESSION_TYPES)[number];
	description: string | null;
	distance_m: number;
	duration_ds: number;
	avg_rate: number | null;
	avg_heart_rate: number | null;
	machine: (typeof ERG_MACHINES)[number];
	is_test: boolean;
	notes: string | null;
}

/** One piece of an interval session; its split is worked out by the database. */
export interface ErgPiece {
	distance_m: number;
	duration_ds: number;
	avg_rate: number | null;
}

/** What save_erg_session() takes: the session, plus its pieces for an interval session entered piece by piece. */
export interface ErgSessionInput {
	session: ErgSessionRow;
	pieces: ErgPiece[];
}

export const MIN_PIECES = 2;
export const MAX_PIECES = 20;

export interface OnWaterOutingRow {
	outing_date: string;
	boat: (typeof BOAT_CLASSES)[number];
	crew: string | null;
	distance_m: number;
	duration_ds: number | null;
	avg_rate: number | null;
	conditions: string | null;
	notes: string | null;
}

/** Either a row ready to save, or a message per field plus what was typed so the form can be shown again. */
export type FormResult<Row> =
	| { ok: true; row: Row }
	| { ok: false; errors: Record<string, string>; values: Record<string, string> };

/** Today's date in Ireland as YYYY-MM-DD, so a late-evening session isn't "in the future" in UTC. */
export const todayInIreland = (now = new Date()) =>
	new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin' }).format(now);

/** Reads a form field for both the checks and the "keep what I typed" values. */
class Fields {
	readonly values: Record<string, string> = {};
	readonly errors: Record<string, string> = {};

	constructor(private readonly form: FormData) {}

	text(name: string): string {
		const value = this.form.get(name);
		const text = typeof value === 'string' ? value.trim() : '';
		this.values[name] = text;
		return text;
	}

	date(name: string, today: string): string {
		const text = this.text(name);
		const valid = /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`));
		// Date.parse accepts 2026-02-30, so check the date survives a round trip.
		if (!valid || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text) {
			this.errors[name] = 'Enter a date.';
		} else if (text > today) {
			this.errors[name] = "The date can't be in the future.";
		}
		return text;
	}

	choice<T extends string>(name: string, options: readonly T[], message: string): T {
		const text = this.text(name);
		if (!options.includes(text as T)) this.errors[name] = message;
		return text as T;
	}

	/** A whole number in a range; null when left empty and optional. */
	whole(name: string, min: number, max: number, message: string, required = false): number | null {
		const text = this.text(name);
		if (text === '') {
			if (required) this.errors[name] = message;
			return null;
		}
		const value = Number(text);
		if (!/^\d+$/.test(text) || value < min || value > max) {
			this.errors[name] = message;
			return null;
		}
		return value;
	}

	/** Optional free text; empty becomes null. */
	note(name: string, max: number, message: string): string | null {
		const text = this.text(name);
		if (text.length > max) this.errors[name] = message;
		return text === '' ? null : text;
	}

	time(name: string, message: string): number | null {
		const text = this.text(name);
		if (text === '') return null;
		const ds = parseTime(text);
		if (ds === null || ds < 100 || ds > 360000) {
			this.errors[name] = message;
			return null;
		}
		return ds;
	}

	result<Row>(row: Row): FormResult<Row> {
		return Object.keys(this.errors).length === 0
			? { ok: true, row }
			: { ok: false, errors: this.errors, values: this.values };
	}
}

const TIME_MESSAGE = 'Enter a time like 6:12.0, 1:02:30.5 or 6120.';
const DISTANCE_MESSAGE = 'Enter a distance between 100 and 100000 metres.';
const RATE_MESSAGE = 'Rate must be between 10 and 60.';

/** A split outside 1:00.0 to 10:00.0 per 500 m is almost certainly a typing mistake (same rule as the database). */
const splitIsPlausible = (distanceM: number, durationDs: number) => {
	const split = (durationDs * 500) / distanceM;
	return split >= 600 && split <= 6000;
};

const SPLIT_MESSAGE = 'That works out at a split outside 1:00.0 to 10:00.0 per 500 m. Check the time and distance.';

/** "1k", "500m", "1500m": how rowers write piece distances. */
const pieceDistance = (metres: number) => (metres % 1000 === 0 ? `${metres / 1000}k` : `${metres}m`);

/** A description for the pieces if none was typed: 5x1k for equal distances, 4x5' for equal whole minutes. */
export function describePieces(pieces: ErgPiece[]): string {
	const [first] = pieces;
	if (pieces.every((p) => p.distance_m === first.distance_m)) return `${pieces.length}x${pieceDistance(first.distance_m)}`;
	if (first.duration_ds % 600 === 0 && pieces.every((p) => p.duration_ds === first.duration_ds)) {
		return `${pieces.length}x${first.duration_ds / 600}'`;
	}
	return `${pieces.length} pieces`;
}

/** piece_1_distance, piece_1_time, piece_1_rate, … An empty distance copies the piece above (so 5x1k is one 1000). */
function readPieces(f: Fields, count: number): ErgPiece[] {
	const pieces: ErgPiece[] = [];
	let previousDistance: number | null = null;
	for (let n = 1; n <= count; n++) {
		const distanceName = `piece_${n}_distance`;
		const timeName = `piece_${n}_time`;
		const typed = f.whole(distanceName, 100, 100000, DISTANCE_MESSAGE);
		const distance = typed ?? (f.errors[distanceName] ? null : previousDistance);
		// Only the first piece without a distance gets the message; the ones below it would copy it once fixed.
		const copiesAMissingDistance = n > 1 && typed === null && previousDistance === null;
		if (distance === null && !f.errors[distanceName] && !copiesAMissingDistance) {
			f.errors[distanceName] = DISTANCE_MESSAGE;
		}
		if (typed !== null) previousDistance = typed;

		const duration = f.time(timeName, TIME_MESSAGE);
		if (duration === null && !f.errors[timeName]) f.errors[timeName] = TIME_MESSAGE;
		const rate = f.whole(`piece_${n}_rate`, 10, 60, RATE_MESSAGE);

		if (distance !== null && duration !== null) {
			if (!splitIsPlausible(distance, duration)) f.errors[timeName] = SPLIT_MESSAGE;
			pieces.push({ distance_m: distance, duration_ds: duration, avg_rate: rate });
		}
	}
	return pieces;
}


export function validateErgSession(form: FormData, today = todayInIreland()): FormResult<ErgSessionInput> {
	const f = new Fields(form);
	const session_date = f.date('session_date', today);
	const session_type = f.choice('session_type', ERG_SESSION_TYPES, 'Pick single piece or intervals.');
	let description = f.note('description', 80, 'Keep the description under 80 characters.');
	const avg_rate = f.whole('avg_rate', 10, 60, RATE_MESSAGE);
	const avg_heart_rate = f.whole('avg_heart_rate', 40, 230, 'Heart rate must be between 40 and 230.');
	const machine = f.choice('machine', ERG_MACHINES, 'Pick Concept2 or RP3.');
	const notes = f.note('notes', 1000, 'Keep the notes under 1000 characters.');
	const is_test = f.text('is_test') === 'on';

	// Intervals entered piece by piece: the totals come from the pieces.
	const byPiece = session_type === 'intervals' && f.text('piece_count') !== '';
	if (byPiece) {
		const count = f.whole('piece_count', MIN_PIECES, MAX_PIECES, `Enter ${MIN_PIECES} to ${MAX_PIECES} pieces.`, true);
		const pieces = count === null ? [] : readPieces(f, count);
		const complete = count !== null && pieces.length === count;
		if (complete && !description) description = describePieces(pieces);
		return f.result({
			session: {
				session_date,
				session_type,
				description,
				distance_m: pieces.reduce((sum, p) => sum + p.distance_m, 0),
				duration_ds: pieces.reduce((sum, p) => sum + p.duration_ds, 0),
				avg_rate,
				avg_heart_rate,
				machine,
				is_test,
				notes,
			},
			pieces,
		});
	}

	const distance_m = f.whole('distance_m', 100, 100000, DISTANCE_MESSAGE, true);
	const time = f.time('time', TIME_MESSAGE);
	const split = f.time('split', 'Enter a split like 1:45.0 or 1450.');

	if (session_type === 'intervals' && !description) {
		f.errors.description = 'Describe the intervals, e.g. 4x2k r5\'.';
	}

	// The time wins if both are filled in. A split alone only makes sense for a single piece.
	let duration_ds = time;
	if (duration_ds === null && !f.errors.time && !f.errors.split) {
		if (split !== null && session_type === 'intervals') {
			f.errors.time = 'Enter the total time for intervals.';
		} else if (split !== null && distance_m !== null) {
			duration_ds = durationFromSplit(distance_m, split);
		} else if (split === null) {
			f.errors.time = TIME_MESSAGE;
		}
	}

	if (duration_ds !== null && distance_m !== null && !splitIsPlausible(distance_m, duration_ds)) {
		f.errors.time = SPLIT_MESSAGE;
	}

	return f.result({
		session: {
			session_date,
			session_type,
			description,
			distance_m: distance_m ?? 0,
			duration_ds: duration_ds ?? 0,
			avg_rate,
			avg_heart_rate,
			machine,
			is_test,
			notes,
		},
		pieces: [],
	});
}

export function validateOnWaterOuting(form: FormData, today = todayInIreland()): FormResult<OnWaterOutingRow> {
	const f = new Fields(form);
	const outing_date = f.date('outing_date', today);
	const boat = f.choice('boat', BOAT_CLASSES, 'Pick a boat.');
	const crew = f.note('crew', 200, 'Keep the crew under 200 characters.');
	const distance_m = f.whole('distance_m', 100, 100000, DISTANCE_MESSAGE, true);
	const duration_ds = f.time('time', TIME_MESSAGE);
	const avg_rate = f.whole('avg_rate', 10, 60, RATE_MESSAGE);
	const conditions = f.note('conditions', 80, 'Keep the conditions under 80 characters.');
	const notes = f.note('notes', 1000, 'Keep the notes under 1000 characters.');

	return f.result({ outing_date, boat, crew, distance_m: distance_m ?? 0, duration_ds, avg_rate, conditions, notes });
}

const text = (value: string | number | null) => (value === null ? '' : String(value));

/** A saved erg session (and its pieces) as form values, for the edit page. The opposite of validateErgSession. */
export function ergSessionValues(row: ErgSessionRow, pieces: ErgPiece[] = []): Record<string, string> {
	const pieceValues: Record<string, string> = pieces.length > 0 ? { piece_count: String(pieces.length) } : {};
	pieces.forEach((piece, i) => {
		pieceValues[`piece_${i + 1}_distance`] = text(piece.distance_m);
		pieceValues[`piece_${i + 1}_time`] = formatTime(piece.duration_ds);
		pieceValues[`piece_${i + 1}_rate`] = text(piece.avg_rate);
	});
	return {
		...pieceValues,
		session_date: row.session_date,
		session_type: row.session_type,
		description: text(row.description),
		distance_m: text(row.distance_m),
		time: formatTime(row.duration_ds),
		split: '',
		avg_rate: text(row.avg_rate),
		avg_heart_rate: text(row.avg_heart_rate),
		machine: row.machine,
		notes: text(row.notes),
		...(row.is_test ? { is_test: 'on' } : {}),
	};
}

/** A saved on-water outing as form values, for the edit page. The opposite of validateOnWaterOuting. */
export function onWaterOutingValues(row: OnWaterOutingRow): Record<string, string> {
	return {
		outing_date: row.outing_date,
		boat: row.boat,
		crew: text(row.crew),
		distance_m: text(row.distance_m),
		time: row.duration_ds === null ? '' : formatTime(row.duration_ds),
		avg_rate: text(row.avg_rate),
		conditions: text(row.conditions),
		notes: text(row.notes),
	};
}
