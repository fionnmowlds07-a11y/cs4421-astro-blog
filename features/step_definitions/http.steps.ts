import assert from 'node:assert/strict';
import { Then, When } from '@cucumber/cucumber';
import type { ApiWorld } from '../support/world.ts';

async function send(world: ApiWorld, method: string, path: string, body?: string) {
	world.response = await fetch(new URL(path, world.baseUrl), {
		method,
		headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
		body,
	});
	const text = await world.response.text();
	try {
		world.body = JSON.parse(text);
	} catch {
		world.body = text;
	}
}

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

Then('the response status should be {int}', function (this: ApiWorld, status: number) {
	assert.equal(this.response?.status, status);
});

Then('the response should be JSON', function (this: ApiWorld) {
	assert.match(this.response?.headers.get('content-type') ?? '', /application\/json/);
});

Then('the response field {string} should equal {string}', function (this: ApiWorld, name: string, expected: string) {
	assert.equal(String(field(this, name)), expected);
});

Then('the response field {string} should be a number', function (this: ApiWorld, name: string) {
	assert.equal(typeof field(this, name), 'number');
});

Then('the response field {string} should be an ISO 8601 timestamp', function (this: ApiWorld, name: string) {
	const value = field(this, name);
	assert.equal(typeof value, 'string');
	assert.equal(new Date(value as string).toISOString(), value);
});
