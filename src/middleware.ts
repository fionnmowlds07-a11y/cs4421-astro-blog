import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from 'astro:env/server';
import { defineMiddleware, sequence } from 'astro:middleware';
import { decideAdminAccess, isAdminPath, loginRedirectPath, type AccessFacts } from './lib/admin-guard';
import { createSessionClient } from './lib/supabase-session';

// Emits one structured JSON log line per request so logs can be queried by key (e.g. in CloudWatch).
const logRequests = defineMiddleware(async (context, next) => {
	const start = performance.now();
	const response = await next();
	const statusCode = response.status;

	console.log(
		JSON.stringify({
			timestamp: new Date().toISOString(),
			level: statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO',
			route: context.url.pathname,
			method: context.request.method,
			statusCode,
			latencyMs: Math.round(performance.now() - start),
		}),
	);

	return response;
});

// Guards /rowing/admin: logged-out visitors go to the login page; pages get the decision in locals.admin.
const guardAdmin = defineMiddleware(async (context, next) => {
	if (!isAdminPath(context.url.pathname)) return next();

	const supabase = createSessionClient(
		{ url: SUPABASE_URL, publishableKey: SUPABASE_PUBLISHABLE_KEY },
		context.request,
		context.cookies,
	);
	const facts: AccessFacts = { configured: supabase !== null, user: 'signed_out', isAdmin: false };
	let email: string | undefined;

	if (supabase) {
		// getUser() checks the session with Supabase Auth, rather than trusting whatever the cookie says.
		const { data, error } = await supabase.auth.getUser();
		if (data.user) {
			facts.user = 'signed_in';
			email = data.user.email;
			const admin = await supabase.rpc('current_user_is_admin');
			facts.isAdmin = admin.error ? 'lookup_failed' : admin.data === true;
		} else if (error && error.name !== 'AuthSessionMissingError' && !(error.status && error.status < 500)) {
			facts.user = 'lookup_failed';
		}
	}

	const access = decideAdminAccess(facts);
	if (access === 'login') return context.redirect(loginRedirectPath(context.url), 303);

	context.locals.admin = { access, email, supabase: access === 'allow' ? (supabase ?? undefined) : undefined };
	const response = await next();
	// Private pages must never be stored by a browser or CDN.
	response.headers.set('Cache-Control', 'no-store');
	return response;
});

export const onRequest = sequence(logRequests, guardAdmin);
