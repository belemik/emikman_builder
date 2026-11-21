import { expect, test } from '@playwright/test';

for (const width of [1440, 320]) {
  test(`WebPage template edits one accepted model at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./?demo=workspace');
    const entry = page.getByRole('button', { name: 'Страница события' });
    const demo = page.getByRole('button', { name: 'Открыть демоверсию' });
    if (await demo.isVisible()) await demo.click();
    await entry.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Страница события' })).toBeFocused();

    const canvas = page.getByRole('region', { name: 'Canvas WebPage' });
    const preview = page.getByRole('region', { name: 'Preview WebPage' });
    const inspector = page.getByRole('complementary', { name: 'Inspector WebPage' });
    const select = canvas.getByRole('button', { name: 'Выбрать Hero' });
    await select.press('Enter');
    await expect(inspector.getByRole('heading')).toBeFocused();
    const heading = inspector.getByLabel('Заголовок', { exact: true });
    const body = inspector.getByLabel('Основной текст', { exact: true });
    const apply = inspector.getByRole('button', { name: 'Подтвердить локальную правку' });
    await heading.fill('Новая программа');
    await body.fill('');
    await apply.press('Enter');
    await expect(inspector.getByRole('alert')).toContainText('/hero/body/text');
    await expect(body).toHaveAttribute('aria-invalid', 'true');
    for (const view of [canvas, preview]) await expect(view.getByRole('heading', { name: 'День открытых мастерских' })).toBeVisible();

    await heading.fill('<Новая программа>');
    await body.fill('Текст обновлён');
    await apply.press('Enter');
    await expect(inspector.getByRole('alert')).toContainText('/hero/heading');
    for (const view of [canvas, preview]) await expect(view.getByText('Посмотрите, как работают художники и дизайнеры.')).toBeVisible();

    await heading.fill('Новая программа');
    await apply.press('Enter');
    await expect(inspector.getByRole('alert')).toHaveCount(0);
    for (const view of [canvas, preview]) {
      await expect(view.getByRole('heading', { name: 'Новая программа' })).toBeVisible();
      await expect(view.getByText('Текст обновлён')).toBeVisible();
      await expect(view.getByText('Экскурсия по мастерским')).toBeVisible();
      const image = view.getByRole('img', { name: 'Знак мероприятия' });
      await expect(image).toHaveAttribute('src', '/emikman_builder/icons/globe-01.svg');
      await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    }

    const columns = () => preview.locator('.zwp-hero').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    await expect.poll(columns).toBe(width === 1440 ? 2 : 1);
    await page.getByRole('button', { name: 'Mobile', exact: true }).press('Enter');
    await expect(preview.locator('[data-viewport]')).toHaveAttribute('data-viewport', 'Mobile');
    await expect.poll(columns).toBe(1);
    await page.getByRole('button', { name: 'Desktop', exact: true }).press('Enter');
    await expect.poll(columns).toBe(width === 1440 ? 2 : 1);
    for (const view of [canvas, preview]) {
      expect(await view.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    const canvasCta = canvas.getByRole('link', { name: 'Посмотреть программу' });
    const previewCta = preview.getByRole('link', { name: 'Посмотреть программу' });
    const canvasAnchor = (await canvasCta.getAttribute('href'))!;
    const previewAnchor = (await previewCta.getAttribute('href'))!;
    expect(canvasAnchor).not.toBe(previewAnchor);
    for (const [link, target, view] of [[canvasCta, canvasAnchor, canvas], [previewCta, previewAnchor, preview]] as const) {
      const program = view.locator('section[id=' + JSON.stringify(target.slice(1)) + ']');
      await expect(program).toHaveCount(1);
      await link.press('Enter');
      expect(decodeURIComponent(new URL(page.url()).hash)).toBe(target);
      await expect(program).toBeFocused();
    }
    await page.getByRole('button', { name: 'К Workspace' }).press('Enter');
    await expect(entry).toBeFocused();
  });
}
