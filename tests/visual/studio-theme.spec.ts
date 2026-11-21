import { chromium, expect, test, type Locator, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const palettes = {
  light: { background: 'rgb(245, 244, 241)', panel: 'rgb(255, 255, 255)', field: 'rgb(255, 255, 255)' },
  dark: { background: 'rgb(20, 21, 23)', panel: 'rgb(27, 28, 30)', field: 'rgb(32, 33, 36)' },
};

async function pageAppearance(page: Page) {
  return page.locator('.zwp-page, .zwp-page *').evaluateAll(nodes => nodes.map(node => {
    const css = getComputedStyle(node);
    return [css.color, css.backgroundColor, css.fontFamily, css.fontSize, css.colorScheme];
  }));
}

async function contrast(element: Locator, surface: Locator, property = 'color') {
  const rgb = await element.evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property);
  const bg = await surface.evaluate(el => getComputedStyle(el).backgroundColor);
  const luminance = (value: string) => {
    const [r,g,b] = value.match(/[\d.]+/g)!.slice(0,3).map(Number).map(n => {
      const x = n / 255;
      return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
    });
    return .2126*r + .7152*g + .0722*b;
  };
  const [high, low] = [luminance(rgb), luminance(bg)].sort((a,b) => b-a);
  return (high+.05)/(low+.05);
}

for (const width of [1440, 1280, 768, 390, 320]) {
  test(`theme surfaces, WebPage isolation and custom viewport at ${width}px`, async ({ page }, info) => {
    const compact = width <= 800;
    await page.setViewportSize({ width, height: compact ? 844 : 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./?demo=workspace');
    const mode = page.getByLabel('Тема оболочки', { exact: true });
    const fit = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      for (const rect of await page.locator('.z-header, .ze-toolbar, .zs-home, .ze-stagebar, .zs-board-grid, dialog[open]').evaluateAll(nodes =>
        nodes.filter(n => n.getClientRects().length).map(n => [n.scrollWidth, n.clientWidth]))) expect(rect[0]).toBeLessThanOrEqual(rect[1] + 1);
    };
    for (const theme of ['light', 'dark'] as const) {
      const palette = palettes[theme];
      await mode.selectOption(theme);
      await expect(page.locator('.zs-platform')).toHaveCSS('background-color', palette.background);
      await expect(page.locator('.z-composer')).toHaveCSS('background-color', palette.panel);
      await fit();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: info.outputPath(`workspace-${theme}.png`) });
      await page.getByRole('button', { name: 'Добавить источник' }).click();
      await expect(page.getByRole('dialog', { name: 'Добавление источников' })).toHaveCSS('background-color', palette.panel);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Страница события', exact: true }).click();
      const canvas = page.locator('.zwp-page');
      await page.getByLabel('Масштаб').selectOption('1');
      const before = await pageAppearance(page);
      await mode.selectOption(theme === 'dark' ? 'light' : 'dark');
      expect(await pageAppearance(page)).toEqual(before);
      await mode.selectOption(theme);
      await page.getByLabel('Масштаб').selectOption('fit');
      await canvas.getByRole('heading').first().click();
      const inspector = compact ? page.getByRole('dialog', { name: 'Inspector' }) : page.locator('.ze-right');
      await expect(inspector).toHaveCSS('background-color', palette.panel);
      const field = inspector.getByRole('textbox', { name: /^Заголовок/ });
      await expect(field).toHaveCSS('background-color', palette.field);
      expect(await contrast(field, field)).toBeGreaterThanOrEqual(4.5);
      expect(await contrast(field, inspector, 'border-top-color')).toBeGreaterThanOrEqual(3);
      await field.fill('<>');
      await inspector.getByRole('button', { name: 'Применить' }).click();
      expect(await contrast(inspector.getByRole('alert'), inspector)).toBeGreaterThanOrEqual(4.5);
      await inspector.getByRole('button', { name: 'Отменить' }).click();
      await expect(inspector.getByRole('button', { name: 'Применить' })).toBeDisabled();
      await fit();
      if (compact) {
        await page.screenshot({ path: info.outputPath(`inspector-${theme}.png`) });
        await page.keyboard.press('Escape');
      }
      await page.screenshot({ path: info.outputPath(`editor-${theme}.png`) });
      if (!compact) {
        const tree = page.getByRole('navigation', { name: 'Слои страницы' });
        await tree.getByRole('button', { name: 'Hero', exact: true }).press('End');
        await expect(tree.getByRole('button', { name: 'Программа' })).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(inspector.getByText('Только просмотр')).toBeVisible();
      }
      await page.getByRole('button', { name: 'Custom' }).click();
      const input = page.getByRole('spinbutton', { name: 'Ширина Custom в пикселях' });
      await input.fill('319'); await input.press('Enter');
      expect(await input.evaluate((el: HTMLInputElement) => el.validity.rangeUnderflow)).toBe(true);
      await input.fill('1240'); await input.press('Enter');
      expect(await canvas.evaluate(el => el.clientWidth)).toBe(1240);
      await fit();
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Preview WebPage' })).toBeVisible();
      expect(await canvas.evaluate(el => el.clientWidth)).toBe(1240);
      await page.getByRole('button', { name: 'К Workspace' }).click();
      await page.getByRole('button', { name: 'Открыть компонентную доску ZARYA DS' }).click();
      const board = page.locator('.zs-board');
      await fit();
      await expect(board.locator('.zs-board-grid section').first()).toHaveCSS('background-color', palette.panel);
      await page.screenshot({ path: info.outputPath(`board-${theme}.png`) });
      await board.getByRole('button', { name: 'Компоненты', exact: true }).click();
      const dialogButton = board.getByRole('button', { name: 'Открыть диалог' });
      await dialogButton.hover();
      expect(await contrast(dialogButton, dialogButton)).toBeGreaterThanOrEqual(4.5);
      await dialogButton.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Пример диалога' });
      await expect(dialog).toHaveCSS('background-color', palette.panel);
      await page.keyboard.press('Escape');
      await expect(dialogButton).toBeFocused();
      expect(await contrast(dialogButton, board.locator('section').first(), 'outline-color')).toBeGreaterThanOrEqual(3);
      await board.getByRole('button', { name: 'Состояния' }).click();
      await board.getByLabel('Образец').selectOption('Черновик');
      expect(await contrast(board.getByRole('status'), board.locator('section').first())).toBeGreaterThanOrEqual(4.5);
      if (compact) await page.getByRole('button', { name: 'Открыть меню' }).click();
      await page.getByRole('button', { name: 'Главная', exact: true }).click();
    }
  });
}

test('laboratory preference survives a full Chromium restart and System tracks the OS', async ({ baseURL }) => {
  const directory = await mkdtemp(join(tmpdir(), 'zarya-theme-profile-'));
  const launch = () => chromium.launchPersistentContext(directory, { baseURL, colorScheme: 'dark' });
  let context = await launch();
  try {
    let page = await context.newPage();
    await page.goto('./?demo=workspace');
    await page.getByRole('link', { name: 'Попробовать редактор' }).click();
    await page.getByRole('button', { name: 'Настройки гостя' }).click();
    await page.getByLabel('Оформление интерфейса').selectOption('light');
    await page.getByRole('button', { name: 'Закрыть настройки гостя' }).click();
    await page.getByRole('link', { name: 'Вернуться в Workspace' }).click();
    await expect(page.locator('.zs-platform')).toHaveCSS('background-color', palettes.light.background);
    await context.close();
    context = await launch();
    page = await context.newPage();
    await page.goto('./?demo=workspace');
    await expect(page.getByLabel('Тема оболочки')).toHaveValue('light');
    await expect(page.locator('.zs-platform')).toHaveCSS('background-color', palettes.light.background);
    await page.getByLabel('Тема оболочки').selectOption('system');
    await expect(page.locator('.zs-platform')).toHaveCSS('background-color', palettes.dark.background);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('.zs-platform')).toHaveCSS('background-color', palettes.light.background);
  } finally {
    await context.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy appearance is honored and open tabs follow the next explicit choice', async ({ context, page }) => {
  await page.goto('./?demo=workspace');
  await page.evaluate(() => localStorage.setItem('wdeaf.appearance', 'light'));
  await page.reload();
  await expect(page.locator('.zs-platform')).toHaveCSS('background-color', palettes.light.background);
  const second = await context.newPage();
  await second.goto('./?demo=workspace');
  await page.getByLabel('Тема оболочки').selectOption('dark');
  await expect(second.locator('.zs-platform')).toHaveCSS('background-color', palettes.dark.background);
  await second.reload();
  await expect(second.getByLabel('Тема оболочки')).toHaveValue('dark');
});
