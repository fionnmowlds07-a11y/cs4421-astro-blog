import type { APIRoute } from 'astro';

export const prerender = false;

const MAX_MESSAGE_LENGTH = 1000;

const json = (body: unknown, status: number) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});

export const POST: APIRoute = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Request body must be valid JSON' }, 400);
	}

	if (typeof body !== 'object' || body === null) {
		return json({ error: 'Request body must be a JSON object' }, 400);
	}

	const { message, rating } = body as Record<string, unknown>;

	if (typeof message !== 'string' || message.trim().length === 0) {
		return json({ error: '`message` is required and must be a non-empty string' }, 400);
	}
	if (message.length > MAX_MESSAGE_LENGTH) {
		return json({ error: `\`message\` must be at most ${MAX_MESSAGE_LENGTH} characters` }, 400);
	}
	if (rating !== undefined && (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5)) {
		return json({ error: '`rating` must be an integer from 1 to 5' }, 400);
	}

	const feedback = {
		id: crypto.randomUUID(),
		message: message.trim(),
		rating: rating ?? null,
		receivedAt: new Date().toISOString(),
	};

	// No datastore yet, so feedback is captured in the structured logs.
	console.log(JSON.stringify({ timestamp: feedback.receivedAt, level: 'INFO', event: 'feedback_received', ...feedback }));

	return json({ status: 'received', id: feedback.id }, 201);
};
