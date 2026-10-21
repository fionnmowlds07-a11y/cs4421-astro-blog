import { describe, expect, it } from 'vitest';
import { todayInIreland, validateErgSession, validateOnWaterOuting } from './rowing-forms';

const TODAY = '2026-10-21';

const form = (fields: Record<string, string>) => {
	const data = new FormData();
	for (const [name, value] of Object.entries(fields)) data.set(name, value);
	return data;
};

const erg = (overrides: Record<string, string> = {}) =>
	form({
		session_date: '2026-10-20',
		session_type: 'single',
		distance_m: '2000',
		time: '6:12.0',
		machine: 'concept2',
		...overrides,
	});

const outing = (overrides: Record<string, string> = {}) =>
	form({ outing_date: '2026-10-20', boat: '1x', distance_m: '12000', ...overrides });

describe('validateErgSession', () => {
	it('turns a filled-in form into a row for the database', () => {
		const result = validateErgSession(
			erg({ avg_rate: '32', avg_heart_rate: '185', is_test: 'on', notes: '  felt good  ' }),
			TODAY,
		);
		expect(result).toEqual({
			ok: true,
			row: {
				session_date: '2026-10-20',
				session_type: 'single',
				description: null,
				distance_m: 2000,
				duration_ds: 3720,
				avg_rate: 32,
				avg_heart_rate: 185,
				machine: 'concept2',
				is_test: true,
				notes: 'felt good',
			},
		});
	});

	it('accepts monitor-style digits for the time', () => {
		const result = validateErgSession(erg({ time: '6120' }), TODAY);
		expect(result.ok && result.row.duration_ds).toBe(3720);
	});

	it('works out the time from a split for a single piece', () => {
		const result = validateErgSession(erg({ time: '', split: '1:33.0' }), TODAY);
		expect(result.ok && result.row.duration_ds).toBe(3720);
	});

	it('uses the time if both a time and a split are filled in', () => {
		const result = validateErgSession(erg({ time: '6:12.0', split: '1:50.0' }), TODAY);
		expect(result.ok && result.row.duration_ds).toBe(3720);
	});

	it('gives a message per field and keeps what was typed', () => {
		const result = validateErgSession(erg({ avg_rate: '70', distance_m: '', notes: 'keep me' }), TODAY);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors).toEqual({
			avg_rate: 'Rate must be between 10 and 60.',
			distance_m: 'Enter a distance between 100 and 100000 metres.',
		});
		expect(result.values).toMatchObject({ avg_rate: '70', distance_m: '', time: '6:12.0', notes: 'keep me' });
	});

	it.each([
		['no time or split', { time: '' }, 'time'],
		['a time that is not a time', { time: 'six' }, 'time'],
		['a split that is not a split', { time: '', split: '1:75' }, 'split'],
		['a split for intervals', { session_type: 'intervals', description: '4x2k', time: '', split: '1:40.0' }, 'time'],
		['intervals without a description', { session_type: 'intervals' }, 'description'],
		['an impossible split', { distance_m: '2000', time: '1:00.0' }, 'time'],
		['a date in the future', { session_date: '2026-10-22' }, 'session_date'],
		['a date that does not exist', { session_date: '2026-02-30' }, 'session_date'],
		['an unknown machine', { machine: 'treadmill' }, 'machine'],
		['an unknown session type', { session_type: 'race' }, 'session_type'],
		['a decimal distance', { distance_m: '2000.5' }, 'distance_m'],
		['a heart rate of 300', { avg_heart_rate: '300' }, 'avg_heart_rate'],
		['a long description', { description: 'x'.repeat(81) }, 'description'],
	])('rejects %s', (_label, overrides, field) => {
		const result = validateErgSession(erg(overrides), TODAY);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(Object.keys(result.errors)).toEqual([field]);
	});

	it('accepts a session logged today', () => {
		expect(validateErgSession(erg({ session_date: TODAY }), TODAY).ok).toBe(true);
	});
});

describe('validateOnWaterOuting', () => {
	it('turns a filled-in form into a row, with the time optional', () => {
		expect(validateOnWaterOuting(outing({ crew: 'With Jack', conditions: 'Windy' }), TODAY)).toEqual({
			ok: true,
			row: {
				outing_date: '2026-10-20',
				boat: '1x',
				crew: 'With Jack',
				distance_m: 12000,
				duration_ds: null,
				avg_rate: null,
				conditions: 'Windy',
				notes: null,
			},
		});
	});

	it('reads the time when there is one', () => {
		const result = validateOnWaterOuting(outing({ time: '1:02:30.5' }), TODAY);
		expect(result.ok && result.row.duration_ds).toBe(37505);
	});

	it.each([
		['an unknown boat', { boat: '3x' }, 'boat'],
		['no distance', { distance_m: '' }, 'distance_m'],
		['a rate of 70', { avg_rate: '70' }, 'avg_rate'],
		['a time that is not a time', { time: 'long' }, 'time'],
		['a date in the future', { outing_date: '2027-01-01' }, 'outing_date'],
	])('rejects %s', (_label, overrides, field) => {
		const result = validateOnWaterOuting(outing(overrides), TODAY);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(Object.keys(result.errors)).toEqual([field]);
	});
});

describe('todayInIreland', () => {
	it('uses Irish time, not UTC', () => {
		// 23:30 UTC on 20 Oct is already 00:30 on 21 Oct in Irish summer time.
		expect(todayInIreland(new Date('2026-10-20T23:30:00Z'))).toBe('2026-10-21');
		// In winter Ireland is on UTC.
		expect(todayInIreland(new Date('2026-12-20T23:30:00Z'))).toBe('2026-12-20');
	});
});
