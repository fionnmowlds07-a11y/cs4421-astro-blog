import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// cdk/ has its own Jest suite and dependencies, run by the cdk-test CI job;
		// e2e/ holds the Playwright browser tests (npm run test:e2e)
		exclude: [...configDefaults.exclude, 'cdk/**', 'e2e/**'],
	},
});
