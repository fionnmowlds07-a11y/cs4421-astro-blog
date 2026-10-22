// Every public page, opened in a real browser on a desktop screen and a phone (see playwright.config.ts).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const SITE = "Fionn Mowlds's blog";

const PAGES = [
	{ path: '/', title: SITE },
	{ path: '/man-united', title: `Man United | ${SITE}` },
	{ path: '/man-united/table', title: `Premier League table | ${SITE}` },
	{ path: '/man-united/stats', title: `Premier League stats | ${SITE}` },
	{ path: '/man-united/compare', title: `Compare teams | ${SITE}` },
	{ path: '/man-united/squad', title: `Man United squad | ${SITE}` },
	{ path: '/man-united/scorers', title: `Premier League top scorers | ${SITE}` },
	{ path: '/rowing', title: `Rowing | ${SITE}` },
	{ path: '/rowing/login', title: `Admin login | ${SITE}` },
	{ path: '/about-me', title: `About Me | ${SITE}` },
];

for (const { path, title } of PAGES) {
	test(`${path} loads cleanly and passes an accessibility scan`, async ({ page }, testInfo) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));

		const response = await page.goto(path);
		expect(response?.ok() || response?.status() === 503, `unexpected status ${response?.status()}`).toBe(true);
		await expect(page).toHaveTitle(title);
		await expect(page.locator('h1')).toHaveCount(1);
		await page.evaluate(() => document.fonts.ready);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
		expect(errors).toEqual([]);

		// axe checks the page against the WCAG 2.1 A and AA rules (contrast, labels, headings, and so on).
		const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
		expect(scan.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);

		await page.screenshot({ path: testInfo.outputPath('page.png'), fullPage: true });
	});
}
