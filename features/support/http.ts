import type { ApiWorld } from './world.ts';

// Sends a request and stores the response; JSON bodies are parsed, anything else is kept as text.
// followRedirects=false lets a scenario assert on the redirect itself (status + Location) instead of the final page.
export async function send(world: ApiWorld, method: string, path: string, body?: string, followRedirects = true) {
	world.response = await fetch(new URL(path, world.baseUrl), {
		method,
		headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
		body,
		redirect: followRedirects ? 'follow' : 'manual',
	});
	const text = await world.response.text();
	try {
		world.body = JSON.parse(text);
	} catch {
		world.body = text;
	}
}
