import assert from 'node:assert/strict';
import { Then, When } from '@cucumber/cucumber';
import { send, submitForm } from '../support/http.ts';
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

Then('the page should use the {string} theme', function (this: ApiWorld, theme: string) {
	const htmlTag = html(this).match(/<html\b[^>]*>/)?.[0] ?? '';
	const declared = htmlTag.match(/data-theme="([^"]*)"/)?.[1] ?? 'neutral';
	assert.equal(declared, theme);
});

Then('the page should have smooth page transitions enabled', function (this: ApiWorld) {
	assert.match(html(this), /<meta name="astro-view-transitions-enabled" content="true"/);
});

Then('the page should have a {string} card linking to {string}', function (this: ApiWorld, card: string, href: string) {
	const anchors = [...html(this).matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
	const match = anchors.find((a) => {
		const classes = a.match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? [];
		return classes.includes('card') && classes.includes(card) && a.includes(`href="${href}"`);
	});
	assert.ok(match, `no "${card}" card linking to ${href}`);
});

Then('the page should show the {string} element', function (this: ApiWorld, testId: string) {
	assert.ok(html(this).includes(`data-testid="${testId}"`), `no element with data-testid="${testId}"`);
});

Then('the page should not show the {string} element', function (this: ApiWorld, testId: string) {
	assert.ok(!html(this).includes(`data-testid="${testId}"`), `unexpected element with data-testid="${testId}"`);
});

Then('the section menu should mark {string} as the current page', function (this: ApiWorld, href: string) {
	const current = [...html(this).matchAll(/<a\b[^>]*aria-current="page"[^>]*>/g)].map(
		(m) => m[0].match(/href="([^"]*)"/)?.[1],
	);
	assert.deepEqual(current, [href]);
});

const LOGIN_FIELDS = { email: 'someone@example.test', password: 'not-the-real-password' };

When('I submit the login form on {string}', async function (this: ApiWorld, path: string) {
	await submitForm(this, path, LOGIN_FIELDS, new URL(this.baseUrl).origin);
});

When('another website submits a login form to {string}', async function (this: ApiWorld, path: string) {
	await submitForm(this, path, LOGIN_FIELDS, 'https://evil.example');
});

Then('the page should ask search engines not to list it', function (this: ApiWorld) {
	assert.match(html(this), /<meta name="robots" content="noindex/);
});

Then('I should be permanently redirected to {string}', function (this: ApiWorld, path: string) {
	assert.equal(this.response?.status, 301);
	const location = this.response?.headers.get('location') ?? '';
	assert.equal(new URL(location, this.baseUrl).pathname, path);
});
