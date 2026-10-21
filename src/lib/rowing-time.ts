// Rowing times and splits, stored as whole tenths of a second like the database (1:47.7 = 1077).
// Pure functions, so the admin forms and the public page share one set of rules.

/**
 * Reads a time typed on the admin forms, or null if it isn't one.
 * Accepts 6:12.0, 6:12, 1:02:30.5, 45.3, or digits only like on an erg monitor,
 * where the last digit is tenths, the two before are seconds and the rest is minutes (6120 = 6:12.0).
 */
export function parseTime(input: string): number | null {
	const text = input.trim();

	const digits = /^\d{1,7}$/.exec(text);
	if (digits) {
		const padded = text.padStart(4, '0');
		const minutes = Number(padded.slice(0, -3));
		const seconds = Number(padded.slice(-3, -1));
		const tenths = Number(padded.slice(-1));
		if (seconds > 59) return null;
		return (minutes * 60 + seconds) * 10 + tenths;
	}

	// h:mm:ss(.t), m:ss(.t) or ss(.t)
	const clock = /^(?:(?:(\d+):)?(\d+):)?(\d+)(?:\.(\d))?$/.exec(text);
	if (!clock) return null;
	const [, h, m, s, t] = clock;
	const hours = Number(h ?? 0);
	const minutes = Number(m ?? 0);
	const seconds = Number(s);
	// Each part after the first must stay under 60, and needs two digits (1:2:30 is a typo).
	if (m !== undefined && (seconds > 59 || s.length !== 2)) return null;
	if (h !== undefined && (minutes > 59 || m!.length !== 2)) return null;
	return ((hours * 60 + minutes) * 60 + seconds) * 10 + Number(t ?? 0);
}

/** 3720 → "6:12.0", 37505 → "1:02:30.5". */
export function formatTime(ds: number): string {
	const tenths = ds % 10;
	const totalSeconds = Math.floor(ds / 10);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor(totalSeconds / 60) % 60;
	const seconds = String(totalSeconds % 60).padStart(2, '0');
	if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}.${tenths}`;
	return `${minutes}:${seconds}.${tenths}`;
}

/** Average split per 500 m, rounded the same way as the database's generated avg_split_ds column. */
export function splitFor(distanceM: number, durationDs: number): number {
	return Math.round((durationDs * 500) / distanceM);
}

/** Total time from a split, for single pieces entered as a split instead of a time. */
export function durationFromSplit(distanceM: number, splitDs: number): number {
	return Math.round((splitDs * distanceM) / 500);
}
