import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';

const demoKey = 'wdeaf.demo.emikman_builder.canvas.v2';
const privateKey = 'wdeaf.canvas.v1.synthetic-test-user';

async function activateWithKeyboard(page: Page, target: Locator, tab = 'Tab') {
  for (let index = 0; index < 60; index++) {
    if (await target.evaluate(element => element === element.ownerDocument.activeElement)) {
      await page.keyboard.press('Enter');
      return;
    }
    await page.keyboard.press(tab);
  }
  throw new Error('The action was unreachable with Tab.');
}

for (const width of [1440, 390]) {
  test(`Guest tries the editor and returns to Workspace at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const apiRequests: string[] = [];
    page.on('request', request => {
      if (/\/api(?:\/|$)/.test(new URL(request.url()).pathname)) apiRequests.push(request.url());
    });
    await page.addInitScript(key => {
      localStorage.setItem(key, 'synthetic private draft sentinel');
    }, privateKey);
    await page.goto('./');
    const enter = page.getByRole('button', { name: 'Открыть демоверсию', exact: true });
    await expect(enter).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Создать проект', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Мои проекты', exact: true })).toHaveCount(0);
    const tryEditor = page.getByRole('link', { name: 'Попробовать редактор', exact: true });
    await activateWithKeyboard(page, tryEditor);
    await expect(page).toHaveURL(/\?view=laboratory$/);
    await expect(page.getByRole('heading', { name: 'Экспериментальный холст' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Как попробовать редактор' })).toContainText('Рабочие проекты на сервере не сохраняются');
    await expect(page.locator('.canvas-item')).toHaveCount(0);

    const sample = page.getByRole('button', { name: 'Загрузить пример', exact: true });
    await activateWithKeyboard(page, sample);
    await expect(page.locator('.canvas-item')).toHaveCount(3);
    await page.getByRole('button', { name: '03 Button', exact: true }).click();
    await page.locator('.inspector-fields label').filter({ has: page.getByText('label', { exact: true }) })
      .getByRole('textbox').fill('Готово');
    const draft = await page.evaluate(key => localStorage.getItem(key), demoKey);
    expect(draft).not.toBeNull();
    page.once('dialog', dialog => dialog.dismiss());
    await sample.click();
    expect(await page.evaluate(key => localStorage.getItem(key), demoKey)).toBe(draft);

    const strict = page.getByRole('button', { name: 'Строгий DS Renderer', exact: true });
    await strict.click();
    const renderer = page.locator('.canvas-paper [data-renderer-valid="true"]');
    await expect(renderer.locator('.wdr-host-slot')).toHaveCount(3);
    await expect(renderer.getByRole('button', { name: 'Готово', exact: true })).toBeVisible();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Экспорт JSON', exact: true }).click();
    const file = await (await pending).path();
    const exported = JSON.parse(await readFile(file!, 'utf8'));
    expect(exported).toEqual(JSON.parse(draft!));

    const edited = { ...exported, elements: exported.elements.map((element: { component: string }) =>
      element.component === 'button' ? { ...element, editorProps: { label: 'Импортированная кнопка' } } : element) };
    page.once('dialog', dialog => dialog.accept());
    await page.locator('input[type=file]').setInputFiles({
      name: 'guest-demo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(edited)),
    });
    await expect(renderer.getByRole('button', { name: 'Импортированная кнопка', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const screenshot = testInfo.outputPath(`editor-${width}.png`);
    await page.locator('.canvas-area').screenshot({ path: screenshot });
    await testInfo.attach(`editor-${width}`, { path: screenshot, contentType: 'image/png' });

    const back = page.getByRole('link', { name: 'Вернуться в Workspace' });
    await activateWithKeyboard(page, back, 'Shift+Tab');
    await expect(page.getByRole('heading', { name: 'Что создадим сегодня?' })).toBeVisible();
    await tryEditor.click();
    await strict.click();
    await expect(renderer.getByRole('button', { name: 'Импортированная кнопка', exact: true })).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), privateKey)).toBe('synthetic private draft sentinel');
    expect(apiRequests).toEqual([]);
  });
}
