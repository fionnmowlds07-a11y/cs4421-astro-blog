import { describe, expect, it } from 'vitest';
import { formatDate, formatDistance } from './rowing-format';

describe('formatDate', () => {
	it('shows the day the session was on, whatever the time zone', () => {
		expect(formatDate('2026-10-20')).toBe('20 Oct 2026');
		expect(formatDate('2026-01-01')).toBe('1 Jan 2026');
	});
});

describe('formatDistance', () => {
	it('adds thousands separators and metres', () => {
		expect(formatDistance(500)).toBe('500 m');
		expect(formatDistance(12000)).toBe('12,000 m');
	});
});
