import { describe, expect, it } from 'vitest';
import { decideAdminAccess, isAdminPath, loginRedirectPath, safeNextPath } from './admin-guard';

describe('isAdminPath', () => {
	it('covers the admin page and everything under it, and nothing else', () => {
		expect(isAdminPath('/rowing/admin')).toBe(true);
		expect(isAdminPath('/rowing/admin/erg/new')).toBe(true);
		expect(isAdminPath('/rowing')).toBe(false);
		expect(isAdminPath('/rowing/login')).toBe(false);
		expect(isAdminPath('/rowing/administrator')).toBe(false);
	});
});

describe('decideAdminAccess', () => {
	it('lets an admin in', () => {
		expect(decideAdminAccess({ configured: true, user: 'signed_in', isAdmin: true })).toBe('allow');
	});

	it('sends logged-out visitors to the login page', () => {
		expect(decideAdminAccess({ configured: true, user: 'signed_out', isAdmin: false })).toBe('login');
	});

	it('refuses a logged-in account that is not an admin', () => {
		expect(decideAdminAccess({ configured: true, user: 'signed_in', isAdmin: false })).toBe('forbidden');
	});

	it('says unavailable when Supabase is not set up or not answering, instead of asking to log in again', () => {
		expect(decideAdminAccess({ configured: false, user: 'signed_out', isAdmin: false })).toBe('unavailable');
		expect(decideAdminAccess({ configured: true, user: 'lookup_failed', isAdmin: false })).toBe('unavailable');
		expect(decideAdminAccess({ configured: true, user: 'signed_in', isAdmin: 'lookup_failed' })).toBe('unavailable');
	});
});

describe('safeNextPath', () => {
	it('keeps admin pages, including their query string', () => {
		expect(safeNextPath('/rowing/admin')).toBe('/rowing/admin');
		expect(safeNextPath('/rowing/admin/erg/new?date=2026-10-16')).toBe('/rowing/admin/erg/new?date=2026-10-16');
	});

	it.each([
		['missing', null],
		['empty', ''],
		['another site', 'https://evil.example/rowing/admin'],
		['protocol-relative', '//evil.example/rowing/admin'],
		['backslash trick', '/\\evil.example'],
		['encoded slashes', '/%2F%2Fevil.example'],
		['a non-admin page', '/about-me'],
		['javascript: URL', 'javascript:alert(1)'],
	])('falls back to the admin page for %s', (_label, next) => {
		expect(safeNextPath(next)).toBe('/rowing/admin');
	});
});

describe('loginRedirectPath', () => {
	it('sends visitors to the login page and remembers deeper admin pages', () => {
		expect(loginRedirectPath(new URL('http://localhost/rowing/admin'))).toBe('/rowing/login');
		expect(loginRedirectPath(new URL('http://localhost/rowing/admin/erg/new?x=1'))).toBe(
			'/rowing/login?next=%2Frowing%2Fadmin%2Ferg%2Fnew%3Fx%3D1',
		);
	});
});
