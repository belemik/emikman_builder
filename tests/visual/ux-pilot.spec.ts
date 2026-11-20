import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { validatePilot } from '../../src/ux-pilot/model';

for (const width of [1440, 768, 390]) {
  test(`Unified Editor text and navigation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const api: string[] = [];
    page.on('request', request => {
      if (/\/api(?:\/|$)/.test(new URL(request.url()).pathname)) api.push(request.url());
    });
    await page.goto('./');
    await page.getByRole('button', { name: 'Открыть демоверсию' }).click();
    const directions = page.getByRole('complementary', { name: 'Направление работы' });
    await directions.getByRole('button', { name: 'Product Design' }).click();
    await expect(directions.getByRole('status')).toContainText('Product Design');
    await expect(page.locator('.z-composer-note')).toContainText('Product Design');
    await expect(page.locator('.z-composer-note')).toContainText('Остановка недоступна');
    const entry = page.getByRole('button', { name: 'Открыть визуальный пилот EMIKMAN' });
    if (width === 1440) {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: testInfo.outputPath('workspace.png') });
    }
    await entry.focus();
    await page.keyboard.press('Enter');
    const title = page.getByRole('heading', { name: 'EMIKMAN · первый экран' });
    await expect(title).toBeFocused();
    await expect(page.getByRole('button', { name: 'Открыть меню' })).toBeVisible();
    const canvas = page.getByRole('region', { name: 'Canvas пилота' });
    const inspector = page.getByRole('complementary', { name: 'Инспектор пилота' });
    const layers = page.getByRole('complementary', { name: 'Слои страницы' });
    const input = inspector.getByRole('textbox', { name: 'Текст' });
    const apply = inspector.getByRole('button', { name: 'Применить' });
    await input.fill('Новый заголовок');
    await apply.click();
    await expect(canvas.getByRole('button', { name: 'Новый заголовок' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Отменить' }).click();
    await expect(input).not.toHaveValue('Новый заголовок');
    await page.getByRole('button', { name: 'Повторить' }).click();
    await expect(input).toHaveValue('Новый заголовок');
    await canvas.getByRole('button', { name: 'EN', exact: true }).click();
    await input.fill('New headline');
    await apply.click();
    await canvas.getByRole('button', { name: 'RU', exact: true }).click();
    await expect(input).toHaveValue('Новый заголовок');

    await layers.getByRole('button', { name: 'Добавить пункт меню' }).click();
    const itemId = await inspector.locator('code').textContent();
    await input.fill('О студии');
    const target = inspector.getByRole('combobox', { name: 'Цель ссылки' });
    await expect(target.locator('option')).toHaveText(['#hero', '#contact']);
    await target.selectOption('#contact');
    await apply.click();
    await inspector.getByRole('button', { name: 'Переместить пункт выше' }).click();
    const menu = canvas.getByRole('navigation', { name: 'Меню макета' });
    await expect(menu.getByRole('button').nth(1)).toHaveText('О студии');
    await inspector.getByRole('button', { name: 'Показать цель' }).click();
    await expect(canvas.getByRole('button', { name: 'Обсудить проект' })).toBeFocused();
    await menu.getByRole('button', { name: 'О студии' }).click();
    await inspector.getByRole('button', { name: 'Удалить пункт' }).click();
    await expect(menu.getByRole('button', { name: 'О студии' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Отменить' }).click();
    await expect(menu.getByRole('button', { name: 'О студии' })).toBeVisible();
    await menu.getByRole('button', { name: 'О студии' }).click();
    await expect(inspector.locator('code')).toHaveText(itemId!);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Экспорт JSON' }).click();
    const file = await (await download).path();
    const exported: unknown = JSON.parse(await readFile(file!, 'utf8'));
    expect(validatePilot(exported)).toBe(true);
    if (validatePilot(exported)) expect(exported.menu[1]).toMatchObject({ id: itemId, target: '#contact' });

    await canvas.getByRole('button', { name: width === 390 ? 'Mobile' : width === 768 ? 'Tablet' : 'Desktop' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(canvas.locator('.zp-artboard')).toBeVisible();
    expect(await page.locator('.z-content').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await canvas.getByRole('button', { name: 'Инструменты' }).click();
    await expect(page.getByRole('dialog', { name: 'Доступность инструментов' })).toContainText('Image');
    await page.keyboard.press('Escape');
    await expect(canvas.getByRole('button', { name: 'Инструменты' })).toBeFocused();
    await page.locator('.z-content').evaluate(element => element.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`editor-${width}.png`) });

    await page.getByRole('button', { name: 'К Workspace' }).click();
    await expect(entry).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(canvas.getByRole('button', { name: 'Новый заголовок' })).toBeVisible();
    expect(api).toEqual([]);
  });
}
