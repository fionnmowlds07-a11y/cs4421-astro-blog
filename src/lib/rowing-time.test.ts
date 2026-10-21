import { describe, expect, it } from 'vitest';
import { durationFromSplit, formatTime, parseTime, splitFor } from './rowing-time';

describe('parseTime', () => {
	it.each([
		['6:12.0', 3720],
		['6:12', 3720],
		['1:47.7', 1077],
		['1:02:30.5', 37505],
		['45.3', 453],
		[' 6:12.0 ', 3720],
	])('reads %s as %i tenths', (input, expected) => {
		expect(parseTime(input)).toBe(expected);
	});

	it.each([
		['6120', 3720],
		['1477', 1077],
		['62305', 37505],
		['453', 453],
		['5', 5],
	])('reads monitor-style digits %s as %i tenths', (input, expected) => {
		expect(parseTime(input)).toBe(expected);
	});

	it.each([
		['empty', ''],
		['letters', 'six minutes'],
		['60 seconds in a clock time', '6:60.0'],
		['60 seconds in digits', '6600'],
		['60 minutes after hours', '1:60:00.0'],
		['one-digit seconds', '6:2.0'],
		['hundredths', '6:12.05'],
		['negative', '-6:12.0'],
		['too many parts', '1:02:03:04'],
	])('rejects %s', (_label, input) => {
		expect(parseTime(input)).toBeNull();
	});
});

describe('formatTime', () => {
	it('formats minutes and hours with tenths', () => {
		expect(formatTime(3720)).toBe('6:12.0');
		expect(formatTime(1077)).toBe('1:47.7');
		expect(formatTime(453)).toBe('0:45.3');
		expect(formatTime(37505)).toBe('1:02:30.5');
	});

	it('round-trips with parseTime', () => {
		for (const ds of [100, 1077, 3720, 37505, 360000]) expect(parseTime(formatTime(ds))).toBe(ds);
	});
});

describe('splitFor and durationFromSplit', () => {
	it('works out the split like the database does', () => {
		expect(splitFor(2000, 3720)).toBe(930); // 6:12.0 for 2k = 1:33.0
		expect(splitFor(5000, 11234)).toBe(1123); // 1123.4 rounds down
		expect(splitFor(1000, 2003)).toBe(1002); // 1001.5 rounds up, like Postgres round()
	});

	it('turns a split back into a total time', () => {
		expect(durationFromSplit(2000, 930)).toBe(3720);
		expect(durationFromSplit(6000, 1050)).toBe(12600); // 1:45.0 for 6k = 21:00.0
	});
});
