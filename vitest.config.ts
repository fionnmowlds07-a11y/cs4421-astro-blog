import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// cdk/ has its own Jest suite and dependencies, run by the cdk-test CI job
		exclude: [...configDefaults.exclude, 'cdk/**'],
	},
});
