// The geometry of the 2k split-over-time chart on the Rowing page: where each point goes and which ticks
// to draw. Pure, so it can be unit tested; SplitChart.astro only draws what this returns.
// Faster splits are higher up (up = better), and dates are spaced by real time, not one step per session.
import type { TwoKPoint } from './rowing-data';

type Machine = TwoKPoint['machine'];

export interface ChartPoint {
	x: number;
	y: number;
	date: string;
	split: number;
	time: number;
	isTest: boolean;
}

export interface ChartLine {
	machine: Machine;
	points: ChartPoint[];
}

export interface SplitChartGeometry {
	width: number;
	height: number;
	pad: { left: number; right: number; top: number; bottom: number };
	/** Every date with at least one 2k, oldest first, and its x position. */
	dates: { date: string; x: number }[];
	lines: ChartLine[];
	yTicks: { y: number; label: string }[];
	xTicks: { x: number; label: string }[];
}

const MACHINE_ORDER: Machine[] = ['concept2', 'rp3'];
/** Tick spacing on the split axis, in tenths of a second: 1 s, 2 s, 5 s, 10 s, 20 s, 50 s. */
const SPLIT_STEPS = [10, 20, 50, 100, 200, 500];
const MIN_TICK_GAP = 48;

const time = (date: string) => Date.parse(`${date}T00:00:00Z`);
const dayMonth = (ms: number, options: Intl.DateTimeFormatOptions) =>
	new Date(ms).toLocaleDateString('en-IE', { ...options, timeZone: 'UTC' });

/** 930 -> "1:33" (ticks are whole seconds). */
export function formatSplitTick(ds: number): string {
	const seconds = Math.round(ds / 10);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function buildSplitChart(points: TwoKPoint[], width: number, height: number): SplitChartGeometry {
	// top leaves room for the "faster" note above the plot.
	const pad = { left: 40, right: width < 500 ? 72 : 110, top: 24, bottom: 30 };
	const plotWidth = width - pad.left - pad.right;
	const plotHeight = height - pad.top - pad.bottom;

	const dates = [...new Set(points.map((p) => p.session_date))].sort();
	const first = time(dates[0] ?? '1970-01-01');
	const last = time(dates[dates.length - 1] ?? '1970-01-01');
	const x = (date: string) =>
		last === first ? pad.left + plotWidth / 2 : pad.left + ((time(date) - first) / (last - first)) * plotWidth;

	// A clean split range with at most 4 steps, wide enough for every point.
	const splits = points.map((p) => p.avg_split_ds);
	const fastest = Math.min(...splits);
	const slowest = Math.max(...splits);
	const step = SPLIT_STEPS.find((s) => Math.ceil(slowest / s) - Math.floor(fastest / s) <= 4) ?? 1000;
	let low = Math.floor(fastest / step) * step;
	let high = Math.ceil(slowest / step) * step;
	if (low === high) {
		low -= step;
		high += step;
	}
	// The fastest split (the lowest number) sits at the top.
	const y = (split: number) => pad.top + ((split - low) / (high - low)) * plotHeight;

	const yTicks = [];
	for (let v = low; v <= high; v += step) yTicks.push({ y: y(v), label: formatSplitTick(v) });

	// The first and last dates, plus the start of each month in between, skipping any that would crowd.
	const candidates = [{ ms: first, label: dayMonth(first, { day: 'numeric', month: 'short' }) }];
	const month = new Date(first);
	month.setUTCDate(1);
	for (month.setUTCMonth(month.getUTCMonth() + 1); month.getTime() < last; month.setUTCMonth(month.getUTCMonth() + 1)) {
		candidates.push({ ms: month.getTime(), label: dayMonth(month.getTime(), { month: 'short' }) });
	}
	if (last !== first) candidates.push({ ms: last, label: dayMonth(last, { day: 'numeric', month: 'short' }) });
	const xTicks: { x: number; label: string }[] = [];
	for (const c of candidates) {
		const tick = { x: last === first ? pad.left + plotWidth / 2 : pad.left + ((c.ms - first) / (last - first)) * plotWidth, label: c.label };
		const previous = xTicks[xTicks.length - 1];
		if (!previous || tick.x - previous.x >= MIN_TICK_GAP) xTicks.push(tick);
		// The last date matters more than a month label just before it.
		else if (c.ms === last && xTicks.length > 1) xTicks[xTicks.length - 1] = tick;
	}

	const lines = MACHINE_ORDER.map((machine) => ({
		machine,
		points: points
			.filter((p) => p.machine === machine)
			.map((p) => ({
				x: x(p.session_date),
				y: y(p.avg_split_ds),
				date: p.session_date,
				split: p.avg_split_ds,
				time: p.duration_ds,
				isTest: p.is_test,
			})),
	})).filter((line) => line.points.length > 0);

	return { width, height, pad, dates: dates.map((date) => ({ date, x: x(date) })), lines, yTicks, xTicks };
}
