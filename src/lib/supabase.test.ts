import { describe, expect, it } from 'vitest';
import { getSupabase } from './supabase';

const LOCAL = { url: 'http://127.0.0.1:54321', publishableKey: 'sb_publishable_test' };

describe('getSupabase', () => {
	it('returns null when Supabase is not configured, so pages can show a fallback', () => {
		expect(getSupabase({})).toBeNull();
		expect(getSupabase({ url: LOCAL.url })).toBeNull();
		expect(getSupabase({ publishableKey: LOCAL.publishableKey })).toBeNull();
	});

	it('reuses one client for the same settings', () => {
		const client = getSupabase(LOCAL);
		expect(client).not.toBeNull();
		expect(getSupabase({ ...LOCAL })).toBe(client);
	});

	it('creates a new client when the settings change', () => {
		const first = getSupabase(LOCAL);
		const second = getSupabase({ ...LOCAL, publishableKey: 'sb_publishable_other' });
		expect(second).not.toBe(first);
	});
});
