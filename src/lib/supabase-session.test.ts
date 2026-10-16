import { describe, expect, it, vi } from 'vitest';
import { cookieAdapter, createSessionClient, SESSION_COOKIE_OPTIONS } from './supabase-session';

const request = (cookie?: string) => new Request('http://localhost/rowing/admin', { headers: cookie ? { cookie } : {} });
const jar = () => ({ set: vi.fn() });

describe('cookieAdapter', () => {
	it('reads every cookie from the request', () => {
		const adapter = cookieAdapter(request('sb-auth-token=abc; theme=dark'), jar());
		expect(adapter.getAll()).toEqual([
			{ name: 'sb-auth-token', value: 'abc' },
			{ name: 'theme', value: 'dark' },
		]);
	});

	it('reads no cookies when the request has none', () => {
		expect(cookieAdapter(request(), jar()).getAll()).toEqual([]);
	});

	it('forces httpOnly, secure and sameSite=lax on every session cookie, even if asked for weaker settings', () => {
		const cookies = jar();
		cookieAdapter(request(), cookies).setAll([
			{ name: 'sb-auth-token', value: 'session', options: { httpOnly: false, secure: false, sameSite: 'none', maxAge: 3600 } },
		]);
		expect(cookies.set).toHaveBeenCalledWith('sb-auth-token', 'session', {
			maxAge: 3600,
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			path: '/',
		});
	});

	it('passes deletions through (an empty value with maxAge 0) with the same protections', () => {
		const cookies = jar();
		cookieAdapter(request(), cookies).setAll([{ name: 'sb-auth-token', value: '', options: { maxAge: 0 } }]);
		expect(cookies.set).toHaveBeenCalledWith('sb-auth-token', '', { maxAge: 0, ...SESSION_COOKIE_OPTIONS });
	});
});

describe('createSessionClient', () => {
	it('returns null when Supabase is not configured, so pages can show "login unavailable"', () => {
		expect(createSessionClient({}, request(), jar())).toBeNull();
	});

	it('returns a client acting for whoever the request cookies belong to', () => {
		const client = createSessionClient({ url: 'http://127.0.0.1:54321', publishableKey: 'sb_publishable_test' }, request(), jar());
		expect(client?.auth).toBeDefined();
	});
});
