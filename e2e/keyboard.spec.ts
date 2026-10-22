// Using the site with only a keyboard: the menu can be reached with Tab, the focus outline can be seen
// against the black header in every section's colours, and Enter follows the link.
import { expect, test } from '@playwright/test';

/** WCAG contrast ratio between two "rgb(r, g, b)" colours (focus outlines need at least 3:1). */
function contrast(a: string, b: string): number {
	const luminance = (rgb: string) => {
		const [r, g, bl] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
			const c = Number(v) / 255;
			return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
	};
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (light + 0.05) / (dark + 0.05);
}

// One page per section colour theme: Home (white), Man United (yellow) and Rowing (green).
for (const path of ['/', '/man-united', '/rowing']) {
	test(`the menu on ${path} can be used with the keyboard and its focus outline is visible`, async ({ page }) => {
		await page.goto(path);
		const rowingTab = page.getByRole('navigation').getByRole('link', { name: 'Rowing', exact: true });

		// Tab until the Rowing tab has focus (the logo and the other tabs come first).
		for (let i = 0; i < 6 && !(await rowingTab.evaluate((link) => link === document.activeElement)); i++) {
			await page.keyboard.press('Tab');
		}
		await expect(rowingTab).toBeFocused();

		const { outline, width, header } = await rowingTab.evaluate((link) => ({
			outline: getComputedStyle(link).outlineColor,
			width: parseFloat(getComputedStyle(link).outlineWidth),
			header: getComputedStyle(link.closest('header')!).backgroundColor,
		}));
		expect(width).toBeGreaterThanOrEqual(2);
		expect(contrast(outline, header)).toBeGreaterThanOrEqual(3);

		await page.keyboard.press('Enter');
		await expect(page).toHaveURL(/\/rowing$/);
	});
}
