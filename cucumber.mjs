// Acceptance tests run against a live server: BASE_URL (default http://localhost:4321).
export default {
	paths: ['features/**/*.feature'],
	import: ['features/support/**/*.ts', 'features/step_definitions/**/*.ts'],
	format: ['progress', 'html:reports/cucumber-report.html'],
};
