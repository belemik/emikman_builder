import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(new URL('../../design-system/examples/renderer.v3.json', import.meta.url), 'utf8'));
async function openRenderer(page: import('@playwright/test').Page, value = fixture) {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.goto('./?view=laboratory'); await page.getByRole('button', { name: 'Открыть демоверсию' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'renderer.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await page.getByRole('button', { name: 'Строгий DS Renderer', exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
}
test('reviewed matrix snapshots, semantic states and assets', async ({ page }) => {
  await openRenderer(page);
  const renderer = page.locator('.wdeaf-renderer');
  await expect(renderer).toBeVisible();
  await expect(renderer.locator('[data-ds-component]')).toHaveCount(29);
  await expect(renderer.locator('button:disabled')).toHaveCount(1);
  await expect(renderer.locator('input[aria-invalid=true]')).toHaveCount(2);
  await expect.poll(() => renderer.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth === 20 && image.getBoundingClientRect().width === 20))).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('500 12px Manrope'))).toBe(true);
  await expect(renderer).toHaveScreenshot('reviewed-matrix.png', { animations: 'disabled' });
  const button = renderer.locator('button').first(); await button.hover();
  await expect(button).toHaveCSS('background-color', 'rgb(51, 119, 255)');
  await expect(button).toHaveScreenshot('button-hover.png');
  const checkbox = renderer.locator('input[type=checkbox]').first(); await checkbox.check(); await expect(checkbox).toBeChecked();
});
test('strict errors are visible and overrides do not leak; editor preview still works', async ({ page }) => {
  await openRenderer(page, { ...fixture, themeOverrides: { radiusPx: 8 } } as typeof fixture);
  await expect(page.locator('[data-renderer-valid=false]')).toContainText('UNVERIFIED_STYLE');
  await expect(page.locator('[data-ds-component]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Редакторский preview', exact: true }).click();
  await expect(page.locator('.canvas-elements')).toBeVisible();
});
