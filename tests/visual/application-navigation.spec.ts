import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const laboratoryKey = 'wdeaf.demo.emikman_builder.canvas.v2';
async function laboratory(page: Page, mobile = false) {
  if (mobile) await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.getByRole('button', { name: 'Открыть демонстрационный профиль' }).click();
  await page.getByRole('button', { name: 'Технический раздел', exact: true }).click();
  await page.getByRole('link', { name: 'Открыть лабораторию компонентов' }).click();
  await expect(page.getByRole('heading', { name: 'Экспериментальный холст' })).toBeVisible();
}

test('W03 Pages root opens Workspace after guest entry; laboratory and project Canvas stay separate', async ({ page }) => {
  const api: string[] = []; page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) api.push(request.url()); });
  await page.goto('./'); await expect(page.getByRole('heading', { name: 'ЗАРЯ Workspace' })).toBeVisible();
  await page.getByRole('button', { name: 'Открыть демоверсию' }).click();
  await expect(page.getByRole('heading', { name: 'Что создадим сегодня?' })).toBeVisible();
  await expect(page.locator('.catalog')).toHaveCount(0); // No laboratory load/save on entering Workspace.
  expect(await page.evaluate(key => localStorage.getItem(key), laboratoryKey)).toBeNull();
  await page.getByRole('button', { name: /^Сайт с нуля/ }).click();
  await page.getByLabel('Название проекта').fill('Сохранить mock при переходе'); await page.getByLabel('Описание задачи').fill('Проверка независимых холстов');
  await page.getByRole('button', { name: 'Открыть демонстрационный проект' }).click();
  await page.getByRole('button', { name: 'Открыть Canvas', exact: true }).click();
  await page.locator('.z-layers').getByRole('button', { name: /Input \/ Email/ }).click();
  const artboard = await page.getByTestId('workspace-artboard').innerText();
  await laboratory(page); await expect(page).toHaveURL(/\/emikman_builder\/\?view=laboratory$/);
  await expect(page.getByRole('button', { name: 'Импорт JSON', exact: true })).toBeVisible();
  const fixture = readFileSync(new URL('../../design-system/examples/renderer.v3.json', import.meta.url));
  await page.locator('input[type=file]').setInputFiles({ name: 'renderer.json', mimeType: 'application/json', buffer: fixture });
  await page.getByRole('button', { name: 'Строгий DS Renderer', exact: true }).click();
  await expect(page.locator('.wdeaf-renderer [data-ds-component]')).toHaveCount(29);
  const stored = await page.evaluate(key => localStorage.getItem(key), laboratoryKey); expect(stored).not.toBeNull();
  await page.getByRole('link', { name: 'Вернуться в Workspace' }).click();
  await expect(page.locator('.z-inspector h3')).toHaveText('Input / Email');
  expect(await page.getByTestId('workspace-artboard').innerText()).toBe(artboard);
  await expect(page.locator('.z-work-title')).toContainText('Сохранить mock при переходе');
  await expect(page.locator('.catalog')).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), laboratoryKey)).toBe(stored);
  await page.goBack(); await expect(page.getByRole('heading', { name: 'Экспериментальный холст' })).toBeVisible();
  await page.goForward(); await expect(page.locator('.z-inspector h3')).toHaveText('Input / Email');
  expect(api).toEqual([]);
});

test('W03 Pages laboratory deep link, reload and unknown route require no server rewrites', async ({ page }) => {
  await page.goto('./?view=laboratory'); await page.getByRole('button', { name: 'Открыть демоверсию' }).click();
  await expect(page.getByRole('heading', { name: 'Экспериментальный холст' })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Открыть демоверсию' }).click();
  await expect(page.getByRole('heading', { name: 'Экспериментальный холст' })).toBeVisible();
  await page.getByRole('link', { name: 'Вернуться в Workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Что создадим сегодня?' })).toBeVisible();
  await page.goto('./?view=unknown'); await page.getByRole('button', { name: 'Открыть демоверсию' }).click();
  await expect(page.getByRole('heading', { name: 'Раздел не найден' })).toBeVisible();
  await expect(page.locator('.catalog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Открыть Workspace' }).click(); await expect(page.getByRole('heading', { name: 'Что создадим сегодня?' })).toBeVisible();
});

test('W03 mobile technical navigation closes dialogs, returns to Workspace and keeps mock state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('./?demo=workspace');
  await page.getByRole('textbox', { name: 'Запрос', exact: true }).fill('Черновик без перезагрузки');
  await laboratory(page, true);
  await expect(page.getByRole('dialog', { name: 'Технический раздел', exact: true })).not.toBeVisible();
  await page.getByRole('link', { name: 'Вернуться в Workspace' }).click();
  await expect(page.getByRole('textbox', { name: 'Запрос', exact: true })).toHaveValue('Черновик без перезагрузки');
  await expect(page.getByRole('dialog', { name: 'Мобильная навигация' })).not.toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const mobile of [false, true]) test(`W03a ${mobile ? 'Mobile' : 'Desktop'}: end demo from profile without server auth, preserve lab data`, async ({ page }) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const api: string[] = []; page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) api.push(request.url()); });
  await page.goto('./?demo=workspace');
  await laboratory(page, mobile);
  const lab = await page.evaluate(key => localStorage.getItem(key), laboratoryKey); expect(lab).not.toBeNull();
  await page.getByRole('link', { name: 'Вернуться в Workspace' }).click();
  if (mobile) await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.getByRole('button', { name: 'Открыть демонстрационный профиль' }).click();
  await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toHaveCount(0);
  await page.keyboard.press('End'); await expect(page.getByRole('button', { name: 'Завершить демо', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Публичная демоверсия' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Открыть демоверсию' })).toBeFocused();
  await expect(page.locator('.zarya, .catalog')).toHaveCount(0);
  expect(new URL(page.url()).search).toBe('?view=workspace');
  expect(await page.evaluate(key => localStorage.getItem(key), laboratoryKey)).toBe(lab);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await page.goBack(); await expect(page.getByRole('heading', { name: 'Публичная демоверсия' })).toBeVisible();
  await page.goForward(); await expect(page.getByRole('heading', { name: 'Публичная демоверсия' })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Публичная демоверсия' })).toBeVisible();
  await page.getByRole('button', { name: 'Открыть демоверсию' }).click();
  await expect(page.getByRole('heading', { name: 'Что создадим сегодня?' })).toBeVisible();
  expect(api).toEqual([]);
});
