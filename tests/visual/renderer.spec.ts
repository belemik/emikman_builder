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

test('laboratory has no horizontal overflow at 320 px before or after adding the accepted components', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('./?view=laboratory');
  await page.getByRole('button', { name: 'Открыть демоверсию' }).click();
  await page.evaluate(() => document.fonts.ready);
  const documentWidth = () => page.evaluate(() => document.documentElement.scrollWidth);
  await expect.poll(documentWidth).toBe(320);
  await page.getByRole('button', { name: /TextArea.*Добавить на холст/ }).click();
  await page.getByRole('button', { name: /ButtonIcon.*Добавить на холст/ }).click();
  await expect.poll(documentWidth).toBe(320);
  await page.getByRole('button', { name: 'Строгий DS Renderer', exact: true }).click();
  await expect.poll(documentWidth).toBe(320);
  await expect(page.locator('.canvas-paper').getByRole('textbox', { name: 'Описание' })).toHaveCSS('height', '80px');
  await expect(page.locator('.canvas-paper').getByRole('button', { name: 'Дополнительные действия' })).toHaveCSS('width', '44px');
});

test('TextArea preserves multiline input between Inspector and Preview in both themes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('zarya-workspace-theme', 'system'));
  await page.goto('./?view=laboratory');
  await page.getByRole('button', { name: 'Открыть демоверсию' }).click();
  await page.getByRole('button', { name: /TextArea.*Добавить на холст/ }).click();
  const canvas = page.locator('.canvas-paper');
  const field = canvas.getByRole('textbox', { name: 'Описание', exact: true });
  const inspector = page.locator('.inspector-fields');
  await expect(field).toHaveAttribute('placeholder', 'Введите текст');
  await expect(field).toHaveAccessibleDescription('Добавьте подробности');
  await field.fill('Первая строка');
  await field.press('End');
  await field.press('Enter');
  await field.pressSequentially('Вторая строка');
  const content = 'Первая строка\nВторая строка';
  await expect(field).toBeFocused();
  await expect(inspector.getByRole('textbox', { name: 'Содержимое поля' })).toHaveValue(content);
  await inspector.getByRole('combobox', { name: /Состояние предпросмотра/ }).selectOption('error');
  await page.getByRole('button', { name: 'Строгий DS Renderer', exact: true }).click();
  await expect(field).toHaveValue(content);
  await expect(field).toHaveAccessibleDescription('Ошибка: Проверьте введённый текст.');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme as 'light' | 'dark', reducedMotion: 'reduce' });
    await expect(page.locator('html')).toHaveAttribute('data-appearance', theme);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await field.focus();
      await expect(field).toHaveCSS('outline-style', 'solid');
      await expect(field).toHaveCSS('outline-offset', '2px');
      await expect(field).toHaveCSS('border-top-color', theme === 'light' ? 'rgb(245, 23, 67)' : 'rgb(247, 69, 105)');
      const handle = await field.evaluate(element => {
        const background = getComputedStyle(element).backgroundColor;
        const placeholder = getComputedStyle(element, '::placeholder').color;
        const relative = (color: string) => color.match(/\d+/g)!.slice(0, 3).map(value => Number(value) / 255)
          .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
          .reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0);
        const values = [relative(background), relative(placeholder)].sort((a, b) => b - a);
        const bounds = element.getBoundingClientRect();
        return { width: bounds.width, right: bounds.right, viewport: window.innerWidth,
          contrast: (values[0] + .05) / (values[1] + .05) };
      });
      expect(handle.width).toBeLessThanOrEqual(280);
      expect(handle.right).toBeLessThanOrEqual(handle.viewport);
      expect(handle.contrast).toBeGreaterThanOrEqual(4.5);
    }
  }
  const longContent = content + '\n' + 'Длинныйтекст'.repeat(150);
  await field.fill(longContent);
  await page.reload();
  await page.getByRole('button', { name: 'Открыть демоверсию' }).click();
  await expect(field).toHaveValue(longContent);
});

test('ButtonIcon uses native activation, a 44px target and the exact state samples', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('zarya-workspace-theme', 'system'));
  await page.goto('./?view=laboratory');
  await page.getByRole('button', { name: 'Открыть демоверсию' }).click();
  await page.getByRole('button', { name: /ButtonIcon.*Добавить на холст/ }).click();
  const inspector = page.locator('.inspector-fields');
  const tool = inspector.getByRole('button', { name: 'Образцы ButtonIcon в Figma' });
  await expect(tool).toHaveAttribute('aria-expanded', 'false');
  await tool.press('Enter');
  await expect(tool).toHaveAttribute('aria-expanded', 'true');
  await expect(inspector.getByText('109:7736', { exact: true })).toBeVisible();
  await tool.press('Space');
  await expect(tool).toHaveAttribute('aria-expanded', 'false');
  await expect(inspector.getByText('109:7736', { exact: true })).toBeHidden();
  await expect(tool).toBeFocused();
  const state = inspector.getByRole('combobox', { name: /Состояние предпросмотра/ });
  await page.getByRole('button', { name: 'Строгий DS Renderer', exact: true }).click();
  const button = page.locator('.canvas-paper').getByRole('button', { name: 'Дополнительные действия' });
  const surface = button.locator('.wdr-icon-surface');
  const glyph = button.locator('.wdr-icon-glyph');
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [value, node] of [['default', '109:7632'], ['hover', '109:7644'], ['pressed', '109:7659'], ['disabled', '109:7736']]) {
        await state.selectOption(value);
        await expect(button).toHaveAttribute('data-figma-node', node);
        if (value === 'disabled') await expect(button).toBeDisabled();
        else await expect(button).toBeEnabled();
      }
      await state.selectOption('default');
      await button.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(button).toBeFocused();
      await expect(button).toHaveCSS('outline-style', 'solid');
      await expect(button).toHaveCSS('outline-color', theme === 'light' ? 'rgb(0, 85, 255)' : 'rgb(51, 119, 255)');
      await expect(button).toHaveCSS('width', '44px');
      await expect(surface).toHaveCSS('width', '35px');
      await expect(glyph).toHaveCSS('width', '20px');
      await button.hover();
      await expect(button).toHaveCSS('color', theme === 'light' ? 'rgb(105, 117, 141)' : 'rgb(143, 152, 170)');
      await page.mouse.down();
      await expect(button).toHaveCSS('color', theme === 'light' ? 'rgb(57, 69, 95)' : 'rgb(180, 186, 198)');
      await page.mouse.up();
    }
  }
});
