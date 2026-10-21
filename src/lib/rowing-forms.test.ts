import { describe, expect, it } from 'vitest';
import {
	describePieces,
	ergSessionValues,
	onWaterOutingValues,
	todayInIreland,
	validateErgSession,
	validateOnWaterOuting,
} from './rowing-forms';

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
				session: {
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
				pieces: [],
			},
		});
	});

	it('accepts monitor-style digits for the time', () => {
		const result = validateErgSession(erg({ time: '6120' }), TODAY);
		expect(result.ok && result.row.session.duration_ds).toBe(3720);
	});

	it('works out the time from a split for a single piece', () => {
		const result = validateErgSession(erg({ time: '', split: '1:33.0' }), TODAY);
		expect(result.ok && result.row.session.duration_ds).toBe(3720);
	});

	it('uses the time if both a time and a split are filled in', () => {
		const result = validateErgSession(erg({ time: '6:12.0', split: '1:50.0' }), TODAY);
		expect(result.ok && result.row.session.duration_ds).toBe(3720);
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

describe('validateErgSession with pieces', () => {
	// A 5x1k typed piece by piece: the distance only on the first piece, then copied down.
	const fiveByOneK = (overrides: Record<string, string> = {}) =>
		erg({
			session_type: 'intervals',
			distance_m: '',
			time: '',
			piece_count: '5',
			piece_1_distance: '1000',
			piece_1_time: '3:10.0',
			piece_1_rate: '30',
			piece_2_time: '3:08.5',
			piece_3_time: '3:09.0',
			piece_4_time: '3:07.5',
			piece_5_time: '3:05.0',
			...overrides,
		});

	it('reads every piece, copying the distance down from the first one', () => {
		const result = validateErgSession(fiveByOneK(), TODAY);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.row.pieces).toEqual([
			{ distance_m: 1000, duration_ds: 1900, avg_rate: 30 },
			{ distance_m: 1000, duration_ds: 1885, avg_rate: null },
			{ distance_m: 1000, duration_ds: 1890, avg_rate: null },
			{ distance_m: 1000, duration_ds: 1875, avg_rate: null },
			{ distance_m: 1000, duration_ds: 1850, avg_rate: null },
		]);
	});

	it('works out the session totals from the pieces and suggests a description', () => {
		const result = validateErgSession(fiveByOneK(), TODAY);
		expect(result.ok && result.row.session).toMatchObject({ distance_m: 5000, duration_ds: 9400, description: '5x1k' });
	});

	it('keeps a description that was typed in', () => {
		const result = validateErgSession(fiveByOneK({ description: "5x1k r3'" }), TODAY);
		expect(result.ok && result.row.session.description).toBe("5x1k r3'");
	});

	it('copies the latest distance typed, so a pyramid can change part way', () => {
		const result = validateErgSession(
			erg({
				session_type: 'intervals',
				piece_count: '3',
				piece_1_distance: '500',
				piece_1_time: '1:30.0',
				piece_2_distance: '1000',
				piece_2_time: '3:05.0',
				piece_3_time: '3:06.0',
			}),
			TODAY,
		);
		expect(result.ok && result.row.pieces.map((p) => p.distance_m)).toEqual([500, 1000, 1000]);
	});

	it('gives the message on the piece that is wrong and keeps everything typed', () => {
		const result = validateErgSession(fiveByOneK({ piece_3_time: '3:75.0' }), TODAY);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors).toEqual({ piece_3_time: 'Enter a time like 6:12.0, 1:02:30.5 or 6120.' });
		expect(result.values).toMatchObject({ piece_3_time: '3:75.0', piece_4_time: '3:07.5', piece_1_distance: '1000' });
	});

	it.each([
		['too few pieces', { piece_count: '1' }, 'piece_count'],
		['too many pieces', { piece_count: '21' }, 'piece_count'],
		['a missing time', { piece_5_time: '' }, 'piece_5_time'],
		['no distance on the first piece', { piece_1_distance: '' }, 'piece_1_distance'],
		['an impossible split', { piece_2_time: '0:50.0' }, 'piece_2_time'],
		['a rate of 70', { piece_4_rate: '70' }, 'piece_4_rate'],
	])('rejects %s', (_label, overrides, field) => {
		const result = validateErgSession(fiveByOneK(overrides), TODAY);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(Object.keys(result.errors)).toEqual([field]);
	});

	it('ignores piece fields on a single piece', () => {
		const result = validateErgSession(erg({ piece_count: '5', piece_1_time: 'nonsense' }), TODAY);
		expect(result.ok && result.row.pieces).toEqual([]);
	});

	it('still accepts intervals with just a total, like older sessions', () => {
		const result = validateErgSession(erg({ session_type: 'intervals', description: "4x2k r5'", distance_m: '8000', time: '25:34.0' }), TODAY);
		expect(result.ok && result.row).toMatchObject({ pieces: [], session: { distance_m: 8000, duration_ds: 15340 } });
	});

	it('fills the edit form so saving it unchanged gives back the same session and pieces', () => {
		const first = validateErgSession(fiveByOneK({ description: '5x1k' }), TODAY);
		expect(first.ok).toBe(true);
		if (!first.ok) return;
		const values = ergSessionValues(first.row.session, first.row.pieces);
		expect(values).toMatchObject({ piece_count: '5', piece_2_distance: '1000', piece_5_time: '3:05.0' });
		expect(validateErgSession(form(values), TODAY)).toEqual(first);
	});
});

describe('describePieces', () => {
	const piece = (distance_m: number, duration_ds: number) => ({ distance_m, duration_ds, avg_rate: null });

	it('names equal distances like rowers write them', () => {
		expect(describePieces([piece(1000, 1900), piece(1000, 1880)])).toBe('2x1k');
		expect(describePieces([piece(500, 900), piece(500, 900), piece(500, 900)])).toBe('3x500m');
	});

	it('names equal whole minutes when the distances differ', () => {
		expect(describePieces([piece(1520, 3000), piece(1505, 3000), piece(1490, 3000), piece(1500, 3000)])).toBe("4x5'");
	});

	it('falls back to the number of pieces', () => {
		expect(describePieces([piece(500, 900), piece(1000, 1900)])).toBe('2 pieces');
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

describe('ergSessionValues and onWaterOutingValues', () => {
	it('fill the edit form so saving it unchanged gives back the same erg session', () => {
		const first = validateErgSession(
			erg({ session_type: 'intervals', description: "4x2k r5'", distance_m: '8000', time: '25:34.0', is_test: 'on' }),
			TODAY,
		);
		expect(first.ok).toBe(true);
		if (!first.ok) return;
		const values = ergSessionValues(first.row.session);
		expect(values).toMatchObject({ time: '25:34.0', distance_m: '8000', is_test: 'on', avg_rate: '' });
		expect(validateErgSession(form(values), TODAY)).toEqual(first);
	});

	it('leave the test box unticked for a normal session', () => {
		const result = validateErgSession(erg(), TODAY);
		expect(result.ok && ergSessionValues(result.row.session)).not.toHaveProperty('is_test');
	});

	it('fill the edit form so saving it unchanged gives back the same outing, with or without a time', () => {
		for (const time of ['', '1:02:30.5']) {
			const first = validateOnWaterOuting(outing({ time, crew: 'With Jack', avg_rate: '20' }), TODAY);
			expect(first.ok).toBe(true);
			if (!first.ok) return;
			expect(validateOnWaterOuting(form(onWaterOutingValues(first.row)), TODAY)).toEqual(first);
		}
	});
});
