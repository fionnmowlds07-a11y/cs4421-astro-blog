import { describe, expect, it } from 'vitest';
import type { TwoKPoint } from './rowing-data';
import { buildSplitChart, formatSplitTick } from './split-chart';

const point = (session_date: string, avg_split_ds: number, machine: TwoKPoint['machine'] = 'concept2'): TwoKPoint => ({
	session_date,
	avg_split_ds,
	duration_ds: avg_split_ds * 4,
	machine,
	is_test: true,
});

describe('formatSplitTick', () => {
	it('shows whole seconds as m:ss', () => {
		expect(formatSplitTick(930)).toBe('1:33');
		expect(formatSplitTick(1000)).toBe('1:40');
	});
});

describe('buildSplitChart', () => {
	const chart = buildSplitChart(
		[point('2026-09-01', 950), point('2026-09-11', 940), point('2026-10-01', 930), point('2026-09-21', 955, 'rp3')],
		400,
		200,
	);
	const [concept2, rp3] = chart.lines;

	it('puts faster splits higher up', () => {
		const ys = concept2.points.map((p) => p.y);
		expect(ys[0]).toBeGreaterThan(ys[1]);
		expect(ys[1]).toBeGreaterThan(ys[2]);
	});

	it('spaces dates by real time, from the left edge to the right edge of the plot', () => {
		const [a, b, c] = concept2.points.map((p) => p.x);
		expect(a).toBe(chart.pad.left);
		expect(c).toBe(chart.width - chart.pad.right);
		expect((b - a) / (c - a)).toBeCloseTo(10 / 30);
	});

	it('keeps one line per machine, Concept2 first, sharing the same dates axis', () => {
		expect(chart.lines.map((l) => l.machine)).toEqual(['concept2', 'rp3']);
		expect(rp3.points[0].x).toBeCloseTo(chart.pad.left + (20 / 30) * (400 - chart.pad.left - chart.pad.right));
		expect(chart.dates.map((d) => d.date)).toEqual(['2026-09-01', '2026-09-11', '2026-09-21', '2026-10-01']);
	});

	it('uses clean split ticks that cover every point', () => {
		expect(chart.yTicks.map((t) => t.label)).toEqual(['1:33', '1:34', '1:35', '1:36']);
		const top = chart.yTicks[0].y;
		const bottom = chart.yTicks[chart.yTicks.length - 1].y;
		for (const p of [...concept2.points, ...rp3.points]) {
			expect(p.y).toBeGreaterThanOrEqual(top);
			expect(p.y).toBeLessThanOrEqual(bottom);
		}
	});

	it('picks a wider tick step for a wide range of splits', () => {
		const wide = buildSplitChart([point('2026-09-01', 900), point('2026-10-01', 1050)], 400, 200);
		expect(wide.yTicks.map((t) => t.label)).toEqual(['1:30', '1:35', '1:40', '1:45']);
	});

	it('labels the first and last dates and the months in between', () => {
		expect(chart.xTicks.map((t) => t.label)).toEqual(['1 Sept', '1 Oct']);
		const long = buildSplitChart([point('2026-08-15', 950), point('2026-11-20', 930)], 600, 200);
		expect(long.xTicks.map((t) => t.label)).toEqual(['15 Aug', 'Sept', 'Oct', 'Nov', '20 Nov']);
	});

	it('copes with a single 2k: centred, with a range around it', () => {
		const one = buildSplitChart([point('2026-10-10', 930)], 400, 200);
		expect(one.lines[0].points[0].x).toBe(one.pad.left + (400 - one.pad.left - one.pad.right) / 2);
		expect(one.yTicks.length).toBeGreaterThanOrEqual(2);
		expect(one.xTicks.map((t) => t.label)).toEqual(['10 Oct']);
	});
});
