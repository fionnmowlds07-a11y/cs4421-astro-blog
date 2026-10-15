import assert from 'node:assert/strict';
import { Then, When } from '@cucumber/cucumber';
import { send } from '../support/http.ts';
import type { ApiWorld } from '../support/world.ts';

function field(world: ApiWorld, name: string): unknown {
	assert.ok(world.body && typeof world.body === 'object', 'response body is not a JSON object');
	return (world.body as Record<string, unknown>)[name];
}

When('I send a GET request to {string}', async function (this: ApiWorld, path: string) {
	await send(this, 'GET', path);
});

When('I send a POST request to {string} with body:', async function (this: ApiWorld, path: string, body: string) {
	await send(this, 'POST', path, body);
});

When('I submit feedback with a message of {int} characters', async function (this: ApiWorld, length: number) {
	await send(this, 'POST', '/api/feedback', JSON.stringify({ message: 'a'.repeat(length) }));
});

Then('the response status should be {int}', function (this: ApiWorld, status: number) {
	assert.equal(this.response?.status, status);
});

Then('the response should be JSON', function (this: ApiWorld) {
	assert.match(this.response?.headers.get('content-type') ?? '', /application\/json/);
});

Then('the response should not be cacheable', function (this: ApiWorld) {
	const cacheControl = this.response?.headers.get('cache-control') ?? '';
	assert.doesNotMatch(cacheControl, /max-age|public/, `unexpected Cache-Control: ${cacheControl}`);
});

Then('the response field {string} should equal {string}', function (this: ApiWorld, name: string, expected: string) {
	assert.equal(String(field(this, name)), expected);
});

Then('the response field {string} should contain {string}', function (this: ApiWorld, name: string, expected: string) {
	assert.ok(String(field(this, name)).includes(expected), `expected "${String(field(this, name))}" to contain "${expected}"`);
});

Then('the response field {string} should be a UUID', function (this: ApiWorld, name: string) {
	assert.match(String(field(this, name)), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

Then('the response field {string} should be a number', function (this: ApiWorld, name: string) {
	assert.equal(typeof field(this, name), 'number');
});

Then('the response field {string} should be an ISO 8601 timestamp', function (this: ApiWorld, name: string) {
	const value = field(this, name);
	assert.equal(typeof value, 'string');
	assert.equal(new Date(value as string).toISOString(), value);
});
