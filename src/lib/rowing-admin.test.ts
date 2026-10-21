import { describe, expect, it } from 'vitest';
import { adminStatus, formValues, saveFailure } from './rowing-admin';

describe('adminStatus', () => {
	it('matches the status code to the access decision', () => {
		expect(adminStatus('allow')).toBe(200);
		expect(adminStatus('forbidden')).toBe(403);
		expect(adminStatus('unavailable')).toBe(503);
	});
});

describe('formValues', () => {
	it('keeps the text fields exactly as typed and skips files', () => {
		const form = new FormData();
		form.set('time', ' 6:12.0 ');
		form.set('avg_rate', '70');
		form.set('photo', new Blob(['x']));
		expect(formValues(form)).toEqual({ time: ' 6:12.0 ', avg_rate: '70' });
	});
});

describe('saveFailure', () => {
	it('says forbidden when row level security refuses the save', () => {
		expect(saveFailure({ code: '42501' }).status).toBe(403);
	});

	it.each(['23514', '23502', '22P02'])('says the values were refused for database error %s', (code) => {
		expect(saveFailure({ code }).status).toBe(422);
	});

	it('says unavailable for anything else, like Supabase being down', () => {
		expect(saveFailure({}).status).toBe(503);
		expect(saveFailure({ code: 'PGRST301' }).status).toBe(503);
	});
});
