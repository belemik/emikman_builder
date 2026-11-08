import { test, expect, type Page } from '@playwright/test';

async function workspace(page: Page, mode: 'light' | 'dark' | 'system' = 'light') {
  await page.addInitScript(mode => { if (!localStorage.getItem('zarya-workspace-theme')) localStorage.setItem('zarya-workspace-theme', mode); }, mode);
  await page.goto('./?demo=workspace');
  await expect(page.getByRole('heading', { name: 'Что создадим сегодня?' })).toBeVisible();
}
async function settings(page: Page) {
  await page.getByRole('button', { name: 'Открыть демонстрационный профиль' }).click();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  return page.getByRole('dialog', { name: 'Настройки', exact: true });
}
async function createMock(page: Page, name: string) {
  await page.getByRole('button', { name: /^Сайт с нуля/ }).click();
  await page.getByLabel('Название проекта').fill(name);
  await page.getByLabel('Описание задачи').fill('Проверка локального mock, без модели.');
  await page.getByRole('button', { name: 'Открыть демонстрационный проект' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

for (const width of [1440, 1280, 800, 390, 375]) {
  for (const mode of ['light', 'dark'] as const) {
    test(`Workspace ${width}px ${mode}: computed isolation, responsive navigation and screenshot`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width > 800 ? 1000 : 844 });
      const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
      await workspace(page, mode);
      await expect(page.locator('.zarya')).toHaveAttribute('data-zarya-scheme', mode);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator('.z-scenario').first().evaluate(el => getComputedStyle(el).backgroundColor))
        .toBe(mode === 'dark' ? 'rgb(26, 33, 48)' : 'rgb(255, 255, 255)');
      await page.screenshot({ path: info.outputPath(`workspace-${width}-${mode}.png`), fullPage: true });
      if (width <= 800) {
        await page.getByRole('button', { name: 'Открыть меню' }).click();
        const nav = page.getByRole('dialog', { name: 'Мобильная навигация' });
        await expect(nav).toBeVisible();
        const box = await nav.boundingBox();
        expect(box?.x).toBe(0); expect(box?.y).toBe(0); expect(box?.width).toBe(width); expect(box?.height).toBe(844);
        await page.screenshot({ path: info.outputPath(`workspace-menu-${width}-${mode}.png`) });
        await page.keyboard.press('Escape'); await expect(nav).not.toBeVisible();
      } else await expect(page.getByRole('complementary', { name: 'Разделы Workspace' })).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}

test('Workspace desktop: collapsible sidebar sections, logo/home and mock switching', async ({ page }) => {
  await workspace(page);
  const nav = page.getByRole('navigation', { name: 'Проекты и недавние' });
  const projects = nav.getByRole('button', { name: 'Проекты', exact: true });
  await projects.click(); await expect(projects).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.getByRole('button', { name: /Северный свет/ })).toHaveCount(1);
  const recents = nav.getByRole('button', { name: 'Недавние', exact: true });
  await recents.click(); await expect(recents).toHaveAttribute('aria-expanded', 'false');
  await projects.click(); await nav.getByRole('button', { name: /Городские маршруты/ }).click();
  await expect(page.getByRole('heading', { name: 'Городские маршруты', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Открыть Canvas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Поиск рейса', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Вернуться к проектам' }).click();
  await nav.getByRole('button', { name: /Северный свет/ }).click();
  await expect(page.getByRole('heading', { name: 'Северный свет', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ЗАРЯ — главная Workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Что создадим сегодня?' })).toBeVisible();
  await page.getByRole('button', { name: 'Скрыть меню' }).click();
  await expect(page.locator('.z-sidebar')).toHaveCount(0);
  expect(await page.locator('.z-main').evaluate(el => el.getBoundingClientRect().width)).toBe(1440);
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await expect(page.locator('.z-sidebar')).toBeVisible();
});

test('Workspace desktop: middle navigation and content scroll independently of header/profile', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1280, height: 700 }); await workspace(page);
  for (let i = 0; i < 12; i++) {
    if (i) await page.getByRole('button', { name: 'Новый чат', exact: true }).click();
    await createMock(page, `Локальный проект ${i}`);
  }
  const before = await page.locator('.z-profile-trigger').boundingBox();
  const head = await page.locator('.z-side-head').boundingBox();
  await page.getByRole('button', { name: 'Все проекты' }).click();
  await page.locator('.z-content').evaluate(el => { el.scrollTop = 500; });
  expect(await page.locator('.z-content').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await page.locator('.z-side-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect(await page.locator('.z-side-scroll').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.locator('.z-profile-trigger').boundingBox()).toEqual(before);
  expect(await page.locator('.z-side-head').boundingBox()).toEqual(head);
  expect((await page.locator('.z-header').boundingBox())?.y).toBe(0);
});

test('Workspace mobile: focus trap, Escape, scroll lock/restoration and navigation close', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 }); await workspace(page);
  const content = page.locator('.z-content'); await content.evaluate(el => { el.scrollTop = 100; });
  const top = await content.evaluate(el => el.scrollTop);
  const trigger = page.getByRole('button', { name: 'Открыть меню' }); await trigger.click();
  const nav = page.getByRole('dialog', { name: 'Мобильная навигация' });
  await expect(nav.getByRole('button', { name: 'Закрыть меню' })).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  expect(await content.evaluate(el => (el as HTMLElement).style.overflow)).toBe('hidden');
  for (let i = 0; i < 22; i++) {
    await page.keyboard.press('Tab');
    expect(await nav.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  for (let i = 0; i < 22; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await nav.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await page.mouse.wheel(0, 600); expect(await content.evaluate(el => el.scrollTop)).toBe(top);
  await page.keyboard.press('Escape'); await expect(nav).not.toBeVisible(); await expect(trigger).toBeFocused();
  expect(await content.evaluate(el => el.scrollTop)).toBe(top);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await trigger.click(); await nav.getByRole('button', { name: 'Все проекты' }).click();
  await expect(nav).not.toBeVisible(); await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
});

test('Workspace mobile: enlarged text keeps close/profile visible and only list scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 }); await workspace(page);
  await page.addStyleTag({ content: '.zarya { font-size:28px!important; }' });
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  const nav = page.getByRole('dialog', { name: 'Мобильная навигация' });
  const close = await nav.getByRole('button', { name: 'Закрыть меню' }).boundingBox();
  const profile = await nav.getByRole('button', { name: 'Открыть демонстрационный профиль' }).boundingBox();
  expect(close!.y).toBeGreaterThanOrEqual(0); expect(close!.y + close!.height).toBeLessThanOrEqual(667);
  expect(profile!.y + profile!.height).toBeLessThanOrEqual(667);
  expect(await nav.evaluate(el => el.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.z-side-scroll').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
});

test('Workspace profile/settings: honest demo, end-demo action, system theme and focus restoration', async ({ page }) => {
  await workspace(page, 'system');
  await page.getByRole('button', { name: 'Открыть демонстрационный профиль' }).click();
  await expect(page.getByRole('button', { name: 'Завершить демо', exact: true })).toBeEnabled();
  await expect(page.getByText(/Публичная демоверсия без серверной сессии/)).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Открыть демонстрационный профиль' })).toBeFocused();
  const dialog = await settings(page);
  await dialog.getByRole('button', { name: 'Тёмная', exact: true }).click();
  await expect(page.locator('.zarya')).toHaveAttribute('data-zarya-scheme', 'dark');
  expect(await dialog.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(26, 33, 48)');
  await dialog.getByRole('button', { name: 'Системная', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'dark' }); await expect(page.locator('.zarya')).toHaveAttribute('data-zarya-scheme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' }); await expect(page.locator('.zarya')).toHaveAttribute('data-zarya-scheme', 'light');
  await dialog.getByRole('button', { name: 'Тёмная', exact: true }).click(); await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('.zarya')).toHaveAttribute('data-zarya-scheme', 'dark');
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Открыть демонстрационный профиль' })).toBeFocused();
  await page.reload(); await expect(page.locator('.zarya')).toHaveAttribute('data-zarya-mode', 'dark'); // Manual selection survives reload.
});

test('Workspace composer: multiline growth, Enter/Shift+Enter and truthful source actions', async ({ page }) => {
  await workspace(page);
  const input = page.getByRole('textbox', { name: 'Запрос', exact: true });
  const send = page.getByRole('button', { name: 'Отправить mock-сообщение' });
  await expect(send).toBeDisabled(); await input.fill('Первая'); await input.press('Shift+Enter'); await input.press('a');
  expect(await input.inputValue()).toContain('\n');
  await input.fill(Array(14).fill('Строка').join('\n'));
  expect((await input.boundingBox())!.height).toBeLessThanOrEqual(240);
  expect((await input.boundingBox())!.height).toBeGreaterThan(84);
  await input.press('Enter'); await expect(page.locator('.z-message-mock')).toHaveCount(1); await expect(send).toBeDisabled();
  await expect(page.getByRole('button', { name: /Остановить/ })).toHaveCount(0);
  const plus = page.getByRole('button', { name: 'Добавить источник' });
  for (const name of ['Прикрепить файл', 'Добавить макет Figma', 'Выбрать дизайн-систему', 'Добавить ссылку на сайт', 'Добавить референс']) {
    await plus.click(); await page.getByRole('dialog', { name: 'Добавление источников' }).getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible();
    await expect(page.getByText('Пока недоступно', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape'); await expect(plus).toBeFocused();
  }
});

test('Workspace full path: New chat → form → mock project → Canvas → Layers → Inspector → project', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/')) requests.push(request.url()); });
  await workspace(page);
  await createMock(page, 'Проект для проверки');
  await page.getByRole('button', { name: 'Открыть Canvas', exact: true }).click();
  await page.locator('.z-layers').getByRole('button', { name: /Input \/ Email/ }).click();
  await expect(page.locator('.z-inspector h3')).toHaveText('Input / Email');
  await expect(page.getByRole('button', { name: 'Применить к холсту' })).toBeDisabled();
  await page.getByRole('tab', { name: 'Проверка', exact: true }).click();
  await expect(page.getByText(/Политика JSON здесь не запускается/)).toBeVisible();
  await page.getByRole('button', { name: 'Mobile', exact: true }).click(); await expect(page.getByTestId('workspace-artboard')).toHaveClass(/mobile/);
  const before = await page.getByTestId('workspace-artboard').evaluate(el => getComputedStyle(el).backgroundColor);
  const modal = await settings(page); await modal.getByRole('button', { name: 'Тёмная', exact: true }).click(); await page.keyboard.press('Escape');
  expect(await page.getByTestId('workspace-artboard').evaluate(el => getComputedStyle(el).backgroundColor)).toBe(before);
  await page.getByRole('button', { name: 'Вернуться к проектам' }).click(); await expect(page.getByRole('heading', { name: 'Проект для проверки' })).toBeVisible();
  await page.getByRole('button', { name: 'Новый чат', exact: true }).click();
  await page.getByRole('button', { name: 'Все проекты' }).click(); await expect(page.locator('.z-project-grid').getByRole('button', { name: /Проект для проверки/ })).toBeVisible();
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key !== 'zarya-workspace-theme'))).toEqual([]);
  await page.reload(); await page.getByRole('button', { name: 'Все проекты' }).click(); await expect(page.getByRole('button', { name: /Проект для проверки/ })).toHaveCount(0);
});

for (const [name, description] of [['По макету Figma', 'Описание ожидаемой реализации'], ['Редизайн сайта', 'Что требуется изменить'], ['Прототип приложения', 'Описание сценария']] as const) {
  test(`Workspace scenario ${name} keeps source/reference metadata local`, async ({ page }) => {
    await workspace(page); await page.getByRole('button', { name: new RegExp('^' + name) }).click();
    await page.getByLabel('Название проекта').fill(name + ' demo'); await page.getByLabel(description).fill('Только демонстрация');
    if (name === 'По макету Figma') await page.getByLabel('Ссылка на Figma').fill('https://www.figma.com/design/demo/Example');
    if (name === 'Редизайн сайта') await page.getByLabel('URL существующего сайта').fill('https://example.com');
    if (name !== 'По макету Figma') await page.getByLabel(/^Референсы/).fill('Текст без анализа');
    await page.getByRole('button', { name: 'Открыть демонстрационный проект' }).click();
    await expect(page.getByRole('heading', { name: name + ' demo', exact: true })).toBeVisible();
    await page.getByRole('navigation', { name: 'Разделы проекта' }).getByRole('button', { name: 'Источники', exact: true }).click();
    await expect(page.getByText(/Ничего не загружалось и не анализировалось/)).toBeVisible();
  });
}

test('Workspace mobile project menu closes after navigation; settings and help are accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await workspace(page, 'dark');
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  const dialog = await settings(page); await dialog.getByRole('button', { name: 'Светлая', exact: true }).click(); await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Открыть меню' })).toBeFocused();
  await page.getByRole('button', { name: 'Открыть меню' }).click(); await page.getByRole('button', { name: 'Открыть демонстрационный профиль' }).click();
  await page.getByRole('button', { name: 'Справка', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Ограничения демонстрационного режима' })).toBeVisible();
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.getByRole('dialog', { name: 'Мобильная навигация' }).getByRole('button', { name: /Городские маршруты/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Мобильная навигация' })).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Городские маршруты', exact: true })).toBeVisible();
});

test('Workspace technical section opens the separate component laboratory and returns', async ({ page }) => {
  await workspace(page);
  await page.getByRole('button', { name: 'Открыть демонстрационный профиль' }).click();
  await page.getByRole('button', { name: 'Технический раздел', exact: true }).click();
  await page.getByRole('link', { name: 'Открыть лабораторию компонентов' }).click();
  expect(new URL(page.url()).search).toBe('?view=laboratory');
  await expect(page.locator('.zarya')).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Компоненты', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Вернуться в Workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Что создадим сегодня?' })).toBeVisible();
});

test('Workspace composer: IME Enter is not submitted as a mock message', async ({ page }) => {
  await workspace(page);
  const input = page.getByRole('textbox', { name: 'Запрос', exact: true });
  await input.fill('Ввод с IME');
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  await expect(page.locator('.z-message-mock')).toHaveCount(0);
  await expect(input).toHaveValue('Ввод с IME');
  await input.press('Enter'); await expect(page.locator('.z-message-mock')).toHaveCount(1);
});

test('Workspace mobile: complete mock path, inspector keyboard tabs and truthful project sections', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 }); await workspace(page, 'dark');
  await createMock(page, 'Мобильная проверка');
  const nav = page.getByRole('navigation', { name: 'Разделы проекта' });
  for (const [section, reason] of [
    ['Файлы', /загрузка и сохранение файлов не подключены/],
    ['Референсы', /Анализ референсов пока недоступен/],
    ['История', /Постоянная история не ведётся/],
    ['Настройки проекта', /Изменение настроек пока недоступно/],
  ] as const) {
    await nav.getByRole('button', { name: section, exact: true }).click();
    await expect(page.getByText(reason)).toBeVisible();
  }
  await nav.getByRole('button', { name: 'Дизайн-системы', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Autodata', exact: true }).click();
  await expect(page.getByText('Визуальный ориентир концепта. Макет не импортирован.').last()).toBeVisible();
  await page.getByRole('button', { name: 'Открыть Canvas', exact: true }).click();
  await page.locator('.z-layers').getByRole('button', { name: /Input \/ Email/ }).click();
  await expect(page.locator('.z-inspector h3')).toHaveText('Input / Email');
  await page.getByRole('tab', { name: 'Параметры', exact: true }).focus();
  await page.keyboard.press('End'); await expect(page.getByRole('tab', { name: 'Проверка', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel')).toContainText('Статус проверки не выдан');
  await page.getByRole('button', { name: 'Контекстный чат' }).click();
  await page.getByRole('textbox', { name: 'Сообщение к макету' }).fill('Только mock');
  await page.getByRole('button', { name: 'Отправить mock-сообщение' }).click();
  await expect(page.getByText('Демонстрационный ответ. Модель не вызывалась, холст не изменён, запись не сохранена.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Вернуться к проектам' }).click();
  await expect(page.getByRole('heading', { name: 'Мобильная проверка', exact: true })).toBeVisible();
});


test('Workspace chat regression: home and project A/B stay isolated; New chat closes reopened Canvas chat', async ({ page }) => {
  await workspace(page);
  await page.getByRole('textbox', { name: 'Запрос', exact: true }).fill('Only general chat');
  await page.getByRole('button', { name: 'Отправить mock-сообщение' }).click();
  const openProject = async (name: string) => {
    await page.getByRole('navigation', { name: 'Проекты и недавние' }).getByRole('button', { name: new RegExp(name) }).first().click();
    await page.getByRole('button', { name: 'Открыть Canvas', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Контекстный чат', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Контекстный чат', exact: true }).click();
  };
  await openProject('Северный свет');
  const draft = page.getByRole('textbox', { name: 'Сообщение к макету', exact: true });
  await expect(draft).toHaveValue(''); await expect(page.getByText('Only general chat', { exact: true })).toHaveCount(0);
  await draft.fill('Only project A'); await draft.press('Enter'); await draft.fill('Draft A');
  await openProject('Городские маршруты');
  await expect(draft).toHaveValue(''); await expect(page.getByText('Only project A', { exact: true })).toHaveCount(0);
  await draft.fill('Only project B'); await draft.press('Enter');
  await openProject('Северный свет');
  await expect(draft).toHaveValue('Draft A'); await expect(page.getByText('Only project A', { exact: true })).toBeVisible();
  await expect(page.getByText('Only project B', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Новый чат', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Запрос', exact: true })).toHaveValue('');
  await expect(page.locator('.z-message')).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Проекты и недавние' }).getByRole('button', { name: /Северный свет/ }).first().click();
  await page.getByRole('button', { name: 'Открыть Canvas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Контекстный чат', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Сообщение к макету', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Контекстный чат', exact: true }).click();
  await expect(page.getByText('Only project A', { exact: true })).toBeVisible();
  await expect(page.getByText('Only project B', { exact: true })).toHaveCount(0);
});
