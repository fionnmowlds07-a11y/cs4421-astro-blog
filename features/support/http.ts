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

// Submits an HTML form the way a browser does: URL-encoded fields plus the Origin of the page it came from,
// which is what Astro's security.checkOrigin compares against the site's own address.
export async function submitForm(world: ApiWorld, path: string, fields: Record<string, string>, origin: string) {
	world.response = await fetch(new URL(path, world.baseUrl), {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin },
		body: new URLSearchParams(fields).toString(),
		redirect: 'manual',
	});
	world.body = await world.response.text();
}
