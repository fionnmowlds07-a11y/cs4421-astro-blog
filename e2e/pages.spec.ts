// Every public page, opened in a real browser on a desktop screen and a phone (see playwright.config.ts).
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
	test(`${path} loads with one heading, its title, no sideways scrolling and no script errors`, async ({ page }, testInfo) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));

		const response = await page.goto(path);
		expect(response?.ok() || response?.status() === 503, `unexpected status ${response?.status()}`).toBe(true);
		await expect(page).toHaveTitle(title);
		await expect(page.locator('h1')).toHaveCount(1);
		await page.evaluate(() => document.fonts.ready);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
		expect(errors).toEqual([]);

		await page.screenshot({ path: testInfo.outputPath('page.png'), fullPage: true });
	});
}
