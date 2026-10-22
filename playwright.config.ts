// End-to-end tests in a real browser, on a desktop screen and a phone.
// Locally, Playwright builds the site and starts the real Node server itself, without the football API key or
// Supabase settings, so the pages show the same fallbacks as in CI. In CI, E2E_BASE_URL points at the Docker
// container the job has already started instead, so the tests run against exactly what ships.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4498;
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
	webServer: process.env.E2E_BASE_URL
		? undefined
		: {
				command: `npm run build && env -u FOOTBALL_DATA_API_KEY -u SUPABASE_URL -u SUPABASE_PUBLISHABLE_KEY HOST=127.0.0.1 PORT=${PORT} node dist/server/entry.mjs`,
				url: `${baseURL}/api/health`,
				timeout: 120_000,
				reuseExistingServer: false,
			},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
	],
});
