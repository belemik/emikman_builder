import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { initialDocument, validatePilot } from '../../src/ux-pilot/model';

async function openEditor(page: Page, visitWorkspace = true) {
  if (visitWorkspace) await page.goto('./?demo=workspace');
  await page.getByRole('button', { name: 'Открыть визуальный пилот EMIKMAN' }).click();
  return {
    inspector: page.getByRole('complementary', { name: 'Инспектор пилота' }),
    layers: page.getByRole('complementary', { name: 'Слои страницы' }),
    canvas: page.getByRole('region', { name: 'Canvas пилота' }),
    dirty: page.getByText('Есть несохранённые изменения', { exact: true }),
  };
}

async function readExport(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт JSON' }).click();
  const result: unknown = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(validatePilot(result)).toBe(true);
  if (!validatePilot(result)) throw new Error('Invalid document exported');
  return result;
}

for (const width of [1440, 390]) {
  test(`Inspector draft survives context changes and exports applied edits only at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const { inspector, layers, canvas, dirty } = await openEditor(page);
    const text = inspector.getByRole('textbox', { name: 'Текст' });
    const apply = inspector.getByRole('button', { name: 'Применить', exact: true });
    const undo = page.getByRole('button', { name: 'Отменить', exact: true });
    await expect(apply).toBeDisabled();
    await text.fill('Новый заголовок');
    await expect(dirty).toBeVisible();
    await expect(undo).toBeDisabled();
    await expect(canvas.getByRole('button', { name: initialDocument.hero.ru })).toBeVisible();
    expect((await readExport(page)).hero).toEqual(initialDocument.hero);
    await canvas.getByRole('button', { name: 'EN', exact: true }).click();
    await text.fill('Separate English draft');
    await canvas.getByRole('button', { name: 'RU', exact: true }).click();
    await layers.getByRole('button', { name: 'Header', exact: true }).click();
    await expect(dirty).toBeVisible();
    await layers.getByRole('button', { name: 'Hero / Text' }).click();
    await inspector.getByRole('button', { name: 'AI Chat' }).click();
    await inspector.getByRole('button', { name: 'Comments' }).click();
    await inspector.getByRole('button', { name: 'Code' }).click();
    await inspector.getByRole('button', { name: 'Properties' }).click();
    await canvas.getByRole('button', { name: 'Mobile' }).click();
    await expect(text).toHaveValue('Новый заголовок');
    if (width === 1440) {
      await page.locator('.z-content').evaluate(el => el.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath('draft.png') });
    }

    await apply.focus();
    await page.keyboard.press('Enter');
    await expect(text).toBeFocused();
    await expect(canvas.getByRole('button', { name: 'Новый заголовок' })).toBeVisible();
    await expect(inspector.getByText('Черновики слоя: EN')).toBeVisible();
    await expect(inspector.getByRole('button', { name: 'Отменить изменения' })).toHaveCount(0);
    const afterApply = await readExport(page);
    expect(afterApply.hero).toEqual({ ru: 'Новый заголовок', en: initialDocument.hero.en });
    await undo.click();
    await expect(canvas.getByRole('button', { name: initialDocument.hero.ru })).toBeVisible();
    await page.getByRole('button', { name: 'Повторить', exact: true }).click();
    await expect(canvas.getByRole('button', { name: 'Новый заголовок' })).toBeVisible();

    await canvas.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(text).toHaveValue('Separate English draft');
    await text.fill('   ');
    await apply.click();
    await expect(inspector.getByRole('alert')).toBeVisible();
    await expect(dirty).toBeVisible();
    await inspector.getByRole('button', { name: 'Отменить изменения' }).click();
    await expect(text).toBeFocused();
    await expect(text).toHaveValue(initialDocument.hero.en);
    await expect(dirty).toBeHidden();
    await expect(page.getByText('Неприменённые изменения отменены.')).toBeVisible();
    if (width === 1440) {
      await page.locator('.z-content').evaluate(el => el.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath('discarded.png') });
    }

    await text.fill('Applied English headline');
    await apply.click();
    await expect(dirty).toBeHidden();
    await expect(page.getByText('Изменения применены к документу.')).toBeVisible();
    if (width === 1440) {
      await page.locator('.z-content').evaluate(el => el.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath('applied.png') });
    }
    expect((await readExport(page)).hero.en).toBe('Applied English headline');
  });
}

test('deleting a menu layer or undoing its creation protects drafts across locales', async ({ page }) => {
  const { inspector, layers, canvas, dirty } = await openEditor(page);
  const input = inspector.getByRole('textbox', { name: 'Текст' });
  const remove = inspector.getByRole('button', { name: 'Удалить пункт' });
  await layers.getByRole('button', { name: 'Главная', exact: true }).click();
  const id = await inspector.locator('code').textContent();
  await input.fill('Не применено');
  await canvas.getByRole('button', { name: 'EN', exact: true }).click();
  await inspector.getByRole('combobox', { name: 'Цель ссылки' }).selectOption('#contact');
  await inspector.getByRole('button', { name: 'Переместить пункт ниже' }).click();
  await expect(inspector.locator('code')).toHaveText(id!);
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(inspector.getByRole('combobox', { name: 'Цель ссылки' })).toHaveValue('#contact');
  await canvas.getByRole('button', { name: 'RU', exact: true }).click();
  await expect(input).toHaveValue('Не применено');
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('на всех языках'); await dialog.dismiss(); });
  await remove.click();
  await expect(input).toHaveValue('Не применено');
  page.once('dialog', dialog => dialog.accept());
  await remove.click();
  await expect(layers.getByRole('button', { name: 'Главная', exact: true })).toHaveCount(0);
  await expect(dirty).toBeHidden();
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await layers.getByRole('button', { name: 'Главная', exact: true }).click();
  await expect(input).toHaveValue('Главная');
  await input.fill('Черновик пункта после Undo');
  const redo = page.getByRole('button', { name: 'Повторить', exact: true });
  page.once('dialog', dialog => dialog.dismiss());
  await redo.click();
  await expect(input).toHaveValue('Черновик пункта после Undo');
  await inspector.getByRole('button', { name: 'Отменить изменения' }).click();

  await layers.getByRole('button', { name: 'Добавить пункт меню' }).click();
  await input.fill('Черновик нового пункта');
  const undo = page.getByRole('button', { name: 'Отменить', exact: true });
  page.once('dialog', dialog => dialog.dismiss());
  await undo.click();
  await expect(input).toHaveValue('Черновик нового пункта');
  page.once('dialog', dialog => dialog.accept());
  await undo.click();
  await expect(layers.getByRole('button', { name: 'Новый пункт', exact: true })).toHaveCount(0);
  await expect(dirty).toBeHidden();
});

test('editor warns on project navigation, exit and reload while keeping a cancelled draft', async ({ page }) => {
  const { inspector, dirty } = await openEditor(page);
  const input = inspector.getByRole('textbox', { name: 'Текст' });
  await input.fill('Остаться в редакторе');
  const back = page.getByRole('button', { name: 'К Workspace' });
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('Inspector'); await dialog.dismiss(); });
  await back.focus();
  await page.keyboard.press('Enter');
  await expect(back).toBeFocused();
  await expect(input).toHaveValue('Остаться в редакторе');
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  const nav = page.getByRole('complementary', { name: 'Разделы Workspace' });
  page.once('dialog', dialog => dialog.dismiss());
  await nav.getByRole('button', { name: 'Все проекты' }).click();
  await expect(dirty).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await back.click();
  await expect(page.getByRole('button', { name: 'Открыть визуальный пилот EMIKMAN' })).toBeFocused();
  await openEditor(page, false);
  await expect(input).toHaveValue('Остаться в редакторе');

  await input.click();
  const seen = page.waitForEvent('dialog');
  page.once('dialog', dialog => dialog.dismiss());
  await page.evaluate(() => window.location.reload());
  expect((await seen).type()).toBe('beforeunload');
  await expect(input).toHaveValue('Остаться в редакторе');
});

test('browser Back to the laboratory respects cancel and preserves drafts on an accepted return', async ({ page }) => {
  await page.goto('./?demo=workspace');
  await page.getByRole('link', { name: 'Попробовать редактор' }).click();
  await page.getByRole('link', { name: 'Вернуться в Workspace' }).click();
  const { inspector, dirty } = await openEditor(page, false);
  const input = inspector.getByRole('textbox', { name: 'Текст' });
  await input.fill('Черновик при переходе');
  await expect(dirty).toBeVisible();
  const warning = page.waitForEvent('dialog');
  page.once('dialog', dialog => dialog.dismiss());
  await page.evaluate(() => window.history.back());
  expect((await warning).message()).toContain('Inspector');
  await expect(page).toHaveURL(/view=workspace/);
  await expect(input).toHaveValue('Черновик при переходе');

  page.once('dialog', dialog => dialog.accept());
  await page.evaluate(() => window.history.back());
  await expect(page.getByRole('heading', { name: 'Экспериментальный холст' })).toBeVisible();
  await page.getByRole('link', { name: 'Вернуться в Workspace' }).click();
  await expect(input).toHaveValue('Черновик при переходе');
});

test('cancelled Forward leaves the laboratory entry available for a later Forward', async ({ page }) => {
  await page.goto('./?demo=workspace');
  await page.getByRole('link', { name: 'Попробовать редактор' }).click();
  await page.evaluate(() => window.history.back());
  await expect(page).toHaveURL(/demo=workspace/);
  const { inspector, dirty } = await openEditor(page, false);
  const input = inspector.getByRole('textbox', { name: 'Текст' });
  await input.fill('Черновик после Forward');
  await expect(dirty).toBeVisible();
  const length = await page.evaluate(() => window.history.length);
  const warning = page.waitForEvent('dialog');
  page.once('dialog', dialog => dialog.dismiss());
  await page.evaluate(() => window.history.forward());
  expect((await warning).message()).toContain('Inspector');
  await expect(page).toHaveURL(/demo=workspace/);
  expect(await page.evaluate(() => window.history.length)).toBe(length);
  await expect(input).toHaveValue('Черновик после Forward');

  page.once('dialog', dialog => dialog.accept());
  await page.evaluate(() => window.history.forward());
  await expect(page.getByRole('heading', { name: 'Экспериментальный холст' })).toBeVisible();
});

test('applying a shared menu target keeps the other locale text draft', async ({ page }) => {
  const { inspector, layers, canvas } = await openEditor(page);
  const target = inspector.getByRole('combobox', { name: 'Цель ссылки' });
  const text = inspector.getByRole('textbox', { name: 'Текст' });
  await layers.getByRole('button', { name: 'Главная', exact: true }).click();
  await target.selectOption('#contact');
  await canvas.getByRole('button', { name: 'EN', exact: true }).click();
  await target.selectOption('#contact');
  await text.fill('Unapplied navigation text');
  await canvas.getByRole('button', { name: 'RU', exact: true }).click();
  await inspector.getByRole('button', { name: 'Применить', exact: true }).click();
  await canvas.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(text).toHaveValue('Unapplied navigation text');
  await expect(target).toHaveValue('#contact');
  await inspector.getByRole('button', { name: 'Отменить изменения' }).click();
  await expect(target).toHaveValue('#contact');
  expect((await readExport(page)).menu[0]).toMatchObject({ target: '#contact', label: initialDocument.menu[0].label });
});

test('Undo clears matching dirty state and Redo restores the unapplied difference', async ({ page }) => {
  const { inspector, dirty } = await openEditor(page);
  const input = inspector.getByRole('textbox', { name: 'Текст' });
  const apply = inspector.getByRole('button', { name: 'Применить', exact: true });
  const original = await input.inputValue();
  const committed = 'Применённый заголовок для истории';

  await input.fill(committed);
  await apply.press('Enter');
  await input.fill(original);
  await expect(dirty).toBeVisible();
  await page.getByRole('button', { name: 'Отменить', exact: true }).press('Enter');
  await expect(input).toHaveValue(original);
  await expect(apply).toBeDisabled();
  await expect(dirty).toBeHidden();
  expect((await readExport(page)).hero.ru).toBe(original);

  const unexpected: string[] = [];
  const dismissUnexpected = async (dialog: import('@playwright/test').Dialog) => {
    unexpected.push(dialog.message());
    await dialog.dismiss();
  };
  page.on('dialog', dismissUnexpected);
  await page.getByRole('button', { name: 'К Workspace' }).press('Enter');
  expect(unexpected).toEqual([]);
  page.off('dialog', dismissUnexpected);
  await page.getByRole('button', { name: 'Открыть визуальный пилот EMIKMAN' }).press('Enter');
  await page.getByRole('button', { name: 'Повторить', exact: true }).press('Enter');
  await expect(input).toHaveValue(original);
  await expect(apply).toBeEnabled();
  await expect(dirty).toBeVisible();
  expect((await readExport(page)).hero.ru).toBe(committed);

  const warning = page.waitForEvent('dialog');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'К Workspace' }).press('Enter');
  expect((await warning).message()).toContain('Inspector');
  await expect(input).toHaveValue(original);
});
