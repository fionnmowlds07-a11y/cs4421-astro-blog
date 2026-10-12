import { defineMiddleware } from 'astro:middleware';

// Emits one structured JSON log line per request so logs can be queried by key (e.g. in CloudWatch).
export const onRequest = defineMiddleware(async (context, next) => {
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
