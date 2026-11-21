import { expect, test } from '@playwright/test';

for (const width of [1440, 1280, 768, 390, 320]) {
  test(`WebPage editing and separate preview at ${width}px`, async ({ page }, info) => {
    const compact = width <= 800;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: compact ? 844 : 900 });
    await page.goto('./?demo=workspace');
    const entry = page.getByRole('button', { name: 'Страница события', exact: true });
    await expect(entry).toBeVisible();
    const fitsWindow = async () => {
      const size = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
      expect(size[0]).toBeLessThanOrEqual(width);
      expect(size[1]).toBeLessThanOrEqual(compact ? 844 : 900);
    };
    await page.evaluate(() => document.fonts.ready);
    await fitsWindow();
    await page.screenshot({ path: info.outputPath('workspace.png') });
    await entry.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Страница события' })).toBeFocused();
    const canvas = page.getByRole('region', { name: 'Canvas WebPage' });
    const preview = page.getByRole('region', { name: 'Preview WebPage' });
    const inspector = compact ? page.getByRole('dialog', { name: 'Inspector' }) : page.getByRole('complementary', { name: 'Inspector WebPage' });
    const closePanel = async () => { if (compact) await page.keyboard.press('Escape'); };
    await canvas.getByRole('heading', { name: 'День открытых мастерских' }).click();
    await expect(inspector).toBeVisible();
    const heading = inspector.getByRole('textbox', { name: /^Заголовок/ });
    const body = inspector.getByRole('textbox', { name: /^Основной текст/ });
    const apply = inspector.getByRole('button', { name: 'Применить' });
    await heading.fill('<Новая программа>');
    await apply.press('Enter');
    await expect(inspector.getByRole('alert')).toContainText('/hero/heading');
    await heading.fill('Вечер открытых мастерских');
    await body.fill('');
    await apply.press('Enter');
    await expect(inspector.getByRole('alert')).toContainText('/hero/body/text');
    await expect(body).toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.locator('h3')).toHaveText('День открытых мастерских');
    await inspector.getByRole('button', { name: 'Отменить' }).press('Enter');
    await expect(apply).toBeDisabled();
    await body.fill('Встреча с художниками и экскурсия по мастерским.');
    if (compact) {
      expect((await body.boundingBox())!.height).toBeLessThan(180);
      await page.screenshot({ path: info.outputPath('inspector.png') });
    }
    await closePanel();
    await fitsWindow();
    await page.screenshot({ path: info.outputPath('editor.png') });
    await page.getByRole('button', { name: 'Preview', exact: true }).press('Enter');
    await expect(canvas).toHaveCount(0);
    await expect(page.locator('.zwp-page')).toHaveCount(1);
    await expect(preview.getByText('Посмотрите, как работают художники и дизайнеры.')).toBeVisible();
    await page.getByRole('button', { name: 'В редактор' }).press('Enter');
    if (compact) await page.getByRole('button', { name: 'Inspector' }).click();
    await expect(body).toHaveValue('Встреча с художниками и экскурсия по мастерским.');
    await heading.fill('Вечер открытых мастерских');
    await apply.press('Enter');
    await expect(inspector.getByRole('alert')).toHaveCount(0);
    await closePanel();
    await page.getByRole('button', { name: 'Preview', exact: true }).press('Enter');
    await expect(preview.getByRole('heading', { name: 'Вечер открытых мастерских' })).toBeVisible();
    await expect(preview.getByText('Встреча с художниками и экскурсия по мастерским.')).toBeVisible();
    if (!compact) await expect.poll(() => preview.locator('.zwp-viewport').evaluate(el => el.getBoundingClientRect().width)).toBe(1080);
    await page.screenshot({ path: info.outputPath('preview.png') });
    const image = preview.getByRole('img', { name: 'Знак мероприятия' });
    await expect(image).toHaveAttribute('src', '/emikman_builder/icons/globe-01.svg');
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(24);
    for (const [device, pixels] of [['Mobile', 390], ['Tablet', 768], ['Desktop', 1080]] as const) {
      await page.getByRole('button', { name: device, exact: true }).press('Enter');
      const viewport = preview.locator('[data-viewport]');
      await expect(viewport).toHaveAttribute('data-viewport', device);
      expect(await viewport.evaluate(el => el.clientWidth)).toBe(pixels);
      const columns = await preview.locator('.zwp-hero').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      expect(columns).toBe(device === 'Mobile' ? 1 : 2);
      await fitsWindow();
    }
    await preview.getByLabel('Масштаб').selectOption('1');
    await fitsWindow();
    await preview.getByLabel('Масштаб').selectOption('fit');
    const cta = preview.getByRole('link', { name: 'Посмотреть программу' });
    await cta.press('Enter');
    await expect(preview.locator('.zwp-program')).toBeFocused();
    await page.getByRole('button', { name: 'К Workspace' }).press('Enter');
    await expect(entry).toBeFocused();
    await entry.press('Enter');
    await expect(canvas.locator('h3')).toHaveText('Вечер открытых мастерских');
    if (compact) await page.getByRole('button', { name: 'Слои', exact: true }).press('Enter');
    await page.getByRole('navigation', { name: 'Слои страницы' }).getByRole('button', { name: 'Программа' }).press('Enter');
    await expect(inspector.getByText('Экскурсия по мастерским')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('ZARYA DS board uses interactive shell components', async ({ page }, info) => {
  await page.goto('./?demo=workspace');
  await page.getByRole('button', { name: 'Открыть компонентную доску ZARYA DS' }).click();
  const board = page.getByRole('region', { name: 'Компонентная доска ZARYA DS' });
  await expect(board.getByRole('heading', { name: 'Цвет' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('board.png') });
  await board.getByRole('button', { name: 'Компоненты', exact: true }).click();
  await board.getByRole('button', { name: 'Открыть диалог' }).press('Enter');
  await expect(page.getByRole('dialog', { name: 'Пример диалога' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(board.getByRole('button', { name: 'Открыть диалог' })).toBeFocused();
  await board.getByRole('button', { name: 'Состояния', exact: true }).click();
  await board.getByLabel('Образец').selectOption('Ошибка');
  await expect(board.getByRole('status')).toHaveText('Ошибка');
});

for (const width of [320, 390]) {
  test(`temporary mobile Inspector keeps selection, draft and keyboard focus at ${width}px`, async ({ page }, info) => {
    const height = width === 320 ? 568 : 844;
    await page.setViewportSize({ width, height });
    await page.goto('./?demo=workspace');
    await page.getByRole('button', { name: 'Страница события', exact: true }).click();
    const canvas = page.getByRole('region', { name: 'Canvas WebPage' });
    const preview = page.getByRole('region', { name: 'Preview WebPage' });
    const inspector = page.getByRole('dialog', { name: 'Inspector' });
    const launch = page.getByRole('button', { name: 'Inspector', exact: true });
    const close = inspector.getByRole('button', { name: 'На холст' });
    const showPreview = inspector.getByRole('button', { name: 'Открыть Preview' });
    const body = inspector.getByRole('textbox', { name: /^Основной текст/ });
    const draft = 'Художники приглашают вас в мастерские.';
    const original = await canvas.locator('.zwp-hero p').innerText();

    await page.getByRole('button', { name: 'Слои', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Текст', exact: true }).press('Enter');
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(showPreview).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await body.fill(draft);
    await close.press('Enter');
    await expect(launch).toBeFocused();
    await expect(canvas.locator('[data-selection]')).toHaveAttribute('data-selection', 'body');
    await expect(canvas.locator('.zwp-hero p')).toHaveText(original);

    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Тема оболочки').selectOption(theme);
      await launch.press('Enter');
      await expect(body).toHaveValue(draft);
      await expect(inspector.getByRole('button', { name: 'Применить' })).toBeEnabled();
      await page.screenshot({ path: info.outputPath(`draft-${theme}.png`), animations: 'disabled' });
      await close.press('Enter');
    }
    await launch.press('Enter');
    await expect(body).toHaveValue(draft);
    await body.press('Escape');
    await expect(launch).toBeFocused();
    await canvas.locator('.zwp-hero p').click();
    await expect(close).toBeFocused();
    await showPreview.press('Enter');
    const back = page.getByRole('button', { name: 'В редактор' });
    await expect(back).toBeFocused();
    await expect(preview.locator('.zwp-hero p')).toHaveText(original);
    await expect(inspector).toHaveCount(0);
    await expect(page.locator('.zwp-page')).toHaveCount(1);

    await back.press('Enter');
    await expect(canvas.locator('[data-selection]')).toHaveAttribute('data-selection', 'body');
    await launch.press('Enter');
    await expect(body).toHaveValue(draft);
    await page.setViewportSize({ width, height: 320 });
    const apply = inspector.getByRole('button', { name: 'Применить' });
    const cancel = inspector.getByRole('button', { name: 'Отменить' });
    await body.fill('');
    await apply.click();
    await expect(body).toBeFocused();
    await expect(body).toHaveAttribute('aria-invalid', 'true');
    for (const button of [close, apply, cancel, showPreview]) {
      await expect(button).toBeInViewport({ ratio: 1 });
      expect(await button.evaluate(el => {
        const box = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      })).toBe(true);
    }
    await cancel.click();
    await expect(body).toHaveValue(original);
    await expect(body).toBeFocused();
    await body.fill(draft);
    await apply.press('Enter');
    await expect(showPreview).toBeFocused();
    await expect(inspector.getByRole('status')).toHaveText('Применено в сессии');
    await page.setViewportSize({ width, height });
    await showPreview.click();
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Тема оболочки').selectOption(theme);
      await expect(preview.locator('.zwp-hero p')).toHaveText(draft);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.screenshot({ path: info.outputPath(`preview-${theme}.png`), animations: 'disabled' });
    }
  });
}
