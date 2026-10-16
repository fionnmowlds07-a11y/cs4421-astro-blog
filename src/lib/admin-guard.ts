// Who may see the rowing admin area. Pure functions, so the rules can be unit tested;
// src/middleware.ts applies them to every request under /rowing/admin.

export const ADMIN_PATH = '/rowing/admin';
export const LOGIN_PATH = '/rowing/login';

/** allow: show the page · login: send to the login page · forbidden: logged in, not an admin · unavailable: Supabase isn't set up or isn't answering */
export type AdminAccess = 'allow' | 'login' | 'forbidden' | 'unavailable';

export interface AccessFacts {
	/** false when SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY aren't set (e.g. in CI). */
	configured: boolean;
	/** The result of asking Supabase who the session belongs to. */
	user: 'signed_in' | 'signed_out' | 'lookup_failed';
	/** Whether the database says this user is in admins (only asked when signed in). */
	isAdmin: boolean | 'lookup_failed';
}

export const isAdminPath = (pathname: string) => pathname === ADMIN_PATH || pathname.startsWith(`${ADMIN_PATH}/`);

export function decideAdminAccess({ configured, user, isAdmin }: AccessFacts): AdminAccess {
	if (!configured) return 'unavailable';
	// If Supabase can't be reached, say so, rather than telling someone already logged in to log in again.
	if (user === 'lookup_failed') return 'unavailable';
	if (user === 'signed_out') return 'login';
	if (isAdmin === 'lookup_failed') return 'unavailable';
	return isAdmin ? 'allow' : 'forbidden';
}

/**
 * Where to go after logging in. Only this site's own admin pages are allowed, so a link like
 * /rowing/login?next=https://evil.example can't bounce someone to another site (an "open redirect").
 */
export function safeNextPath(next: string | null | undefined): string {
	if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return ADMIN_PATH;
	try {
		// Resolving against a dummy origin catches tricks like "/%2F%2Fevil.example" or "/\t/evil.example".
		const url = new URL(next, 'https://site.invalid');
		if (url.origin !== 'https://site.invalid' || !isAdminPath(url.pathname)) return ADMIN_PATH;
		return `${url.pathname}${url.search}`;
	} catch {
		return ADMIN_PATH;
	}
}

/** The login page URL that brings the visitor back to where they were heading. */
export function loginRedirectPath(requested: URL): string {
	const next = safeNextPath(`${requested.pathname}${requested.search}`);
	return next === ADMIN_PATH ? LOGIN_PATH : `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}
