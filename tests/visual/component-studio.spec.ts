import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const demoKey = 'wdeaf.demo.emikman_builder.canvas.v2';

async function openStudio(page: Page) {
  await page.goto('./?view=laboratory');
  await page.getByRole('button', { name: 'Открыть демоверсию' }).click();
  await page.locator('.catalog-card').filter({ hasText: 'Button' }).click();
  return page.getByRole('region', { name: 'Component Studio · Button' });
}

for (const width of [1440, 390]) {
  test(`Button studio follows Inspector, Renderer and export at ${width}px`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const apiRequests: string[] = [];
    page.on('request', request => {
      if (/\/api(?:\/|$)/.test(new URL(request.url()).pathname)) apiRequests.push(request.url());
    });
    const studio = await openStudio(page);
    const fields = page.locator('.inspector-fields');
    const label = fields.getByRole('textbox', { name: /^Текст label/ });
    await label.fill('');
    await expect(studio.locator('.studio-stage')).toHaveAttribute('inert', '');
    await expect(studio).toContainText('Добавьте текст');
    await label.fill('Сохранить макет');

    const live = studio.getByRole('button', { name: 'Сохранить макет', exact: true });
    await expect(live).toHaveAttribute('data-figma-node', '15:17377');
    const code = studio.getByRole('textbox', { name: 'Демонстрационный JSX' });
    await expect(code).toHaveAttribute('readonly', '');
    await expect(code).toHaveValue(/"label": "Сохранить макет"/);

    const copy = studio.getByRole('button', { name: 'Скопировать JSX' });
    await code.focus();
    await page.keyboard.press('Tab');
    await expect(copy).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(studio.getByRole('status')).toHaveText('Код скопирован.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await code.inputValue());

    const size = fields.getByRole('combobox', { name: /size/ });
    await size.selectOption('xl');
    await expect(studio).toContainText('RENDERER_UNSUPPORTED');
    await expect(live).toHaveCount(0);
    await expect(code).toHaveCount(0);
    await expect(copy).toHaveCount(0);
    const strict = page.getByRole('button', { name: 'Строгий DS Renderer' });
    await strict.click();
    const canvas = page.locator('.canvas-paper');
    await expect(canvas.getByRole('alert')).toContainText('RENDERER_UNSUPPORTED');
    await size.selectOption('m');
    await expect(canvas.getByRole('button', { name: 'Сохранить макет', exact: true })).toHaveAttribute('data-figma-node', '15:17377');

    const draft = await page.evaluate(key => localStorage.getItem(key), demoKey);
    expect(draft).not.toBeNull();
    const motion = studio.getByRole('checkbox', { name: 'CSS-переходы hover и pressed' });
    await motion.focus();
    await page.keyboard.press('Space');
    await expect(motion).toBeChecked();
    await expect(live).toHaveCSS('transition-duration', '0.16s, 0.16s');
    await live.hover();
    await expect(live).toHaveAttribute('data-state', 'hover');
    await page.mouse.down();
    await expect(live).toHaveAttribute('data-state', 'pressed');
    await expect(live).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 1)');
    if (width === 1440) await studio.screenshot({ path: testInfo.outputPath('studio-pressed-1440.png') });
    await page.mouse.up();
    await live.focus();
    await page.keyboard.down('Space');
    await expect(live).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 1)');
    await page.keyboard.up('Space');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(live).toHaveCSS('transition-duration', '0s');
    await page.keyboard.down('Space');
    await expect(live).toHaveCSS('transform', 'none');
    await page.keyboard.up('Space');
    expect(await page.evaluate(key => localStorage.getItem(key), demoKey)).toBe(draft);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Экспорт JSON' }).click();
    const file = await (await download).path();
    const exported = JSON.parse(await readFile(file!, 'utf8'));
    expect(exported).toEqual(JSON.parse(draft!));

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await studio.screenshot({ path: testInfo.outputPath(`studio-${width}.png`) });
    if (width === 1440) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath('canvas-studio-1440.png'), fullPage: true });
    }
    expect(apiRequests).toEqual([]);
  });
}

test('Button studio preserves manually selectable code when clipboard is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined });
  });
  const studio = await openStudio(page);
  const code = studio.getByRole('textbox', { name: 'Демонстрационный JSX' });
  await studio.getByRole('button', { name: 'Скопировать JSX' }).click();
  await expect(studio.getByRole('status')).toContainText('скопируйте вручную');
  await code.selectText();
  expect(await code.evaluate((element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart))
    .toBe((await code.inputValue()).length);
});
