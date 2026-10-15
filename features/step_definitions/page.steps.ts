import assert from 'node:assert/strict';
import { Then, When } from '@cucumber/cucumber';
import { send } from '../support/http.ts';
import type { ApiWorld } from '../support/world.ts';

function html(world: ApiWorld): string {
	assert.equal(typeof world.body, 'string', 'response body is not an HTML page');
	return world.body as string;
}

// Decodes the few entities Astro emits in titles (e.g. the apostrophe in "Mowlds's").
function decode(text: string): string {
	return text.replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

When('I visit {string}', async function (this: ApiWorld, path: string) {
	await send(this, 'GET', path);
});

When('I visit {string} without following redirects', async function (this: ApiWorld, path: string) {
	await send(this, 'GET', path, undefined, false);
});

Then('the page title should be {string}', function (this: ApiWorld, expected: string) {
	const title = html(this).match(/<title>([^<]*)<\/title>/)?.[1];
	assert.equal(decode(title ?? ''), expected);
});

Then('the page should link to {string}', function (this: ApiWorld, href: string) {
	assert.ok(html(this).includes(`href="${href}"`), `no link to ${href}`);
});

Then('the page should not link to anything on {string}', function (this: ApiWorld, domain: string) {
	const links = [...html(this).matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
	const offending = links.filter((link) => link.includes(domain));
	assert.deepEqual(offending, [], `found links to ${domain}`);
});

Then('I should be permanently redirected to {string}', function (this: ApiWorld, path: string) {
	assert.equal(this.response?.status, 301);
	const location = this.response?.headers.get('location') ?? '';
	assert.equal(new URL(location, this.baseUrl).pathname, path);
});
