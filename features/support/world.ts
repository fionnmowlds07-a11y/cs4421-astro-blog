import { setWorldConstructor, World } from '@cucumber/cucumber';

// Per-scenario state: where the server lives and the last response received.
export class ApiWorld extends World {
	baseUrl = process.env.BASE_URL ?? 'http://localhost:4321';
	response?: Response;
	body: unknown;
}

setWorldConstructor(ApiWorld);
