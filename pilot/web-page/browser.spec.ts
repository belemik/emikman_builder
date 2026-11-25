import { createHash } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

type Info = { url: string; credentials: string; state: string; pid: number };
type Instance = { info: Info; close: () => Promise<void> };
const program = fileURLToPath(new URL('./start.ts', import.meta.url));

async function start(children: Instance[], args: readonly string[] = []): Promise<Instance> {
  const child: ChildProcess = spawn(process.execPath, ['--import', 'tsx', program, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stderr!.setEncoding('utf8').on('data', value => { stderr += value; });
  const closed = new Promise<void>(resolve => { child.once('close', () => resolve()); });
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 2500);
    try { await closed; } finally { clearTimeout(timer); }
  };
  try {
    const info = await new Promise<Info>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Pilot did not start. ' + stderr)), 5000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      void closed.then(() => { clearTimeout(timer); reject(Error('Pilot stopped. ' + stderr)); });
      child.stdout!.setEncoding('utf8').on('data', value => {
        stdout += value;
        if (!stdout.includes('\n')) return;
        clearTimeout(timer);
        try { resolve(JSON.parse(stdout.split('\n')[0])); }
        catch { reject(Error('Missing pilot start metadata')); }
      });
    });
    const instance = { info, close: stop };
    children.push(instance);
    return instance;
  } catch (error) { await stop(); throw error; }
}

async function cleanup(children: Instance[]) {
  await Promise.all(children.map(child => child.close()));
  const directories = new Set<string>();
  for (const child of children) {
    directories.add(dirname(child.info.credentials));
    directories.add(dirname(child.info.state));
    const state: { main: string; ledger: string } = JSON.parse(readFileSync(child.info.state, 'utf8'));
    directories.add(state.main);
    directories.add(state.ledger);
  }
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
}

async function enterSecret(field: Locator, token: string) {
  // Avoid Playwright fill call logs containing a synthetic bearer on test failure.
  await field.evaluate((element, value) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!(element instanceof HTMLInputElement) || element.type !== 'password' || !set) throw Error('Missing password field');
    set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, token);
}

async function enter(page: Page, pilot: Instance, role: 'ownerCode' | 'foreignCode' = 'ownerCode') {
  const credentials: Record<typeof role, string> = JSON.parse(readFileSync(pilot.info.credentials, 'utf8'));
  await page.goto(pilot.info.url);
  await enterSecret(page.getByLabel('Одноразовый код доступа'), credentials[role]);
  await page.getByRole('button', { name: 'Открыть Workspace' }).click();
}

async function reauthorize(page: Page, pilot: Instance, role: 'ownerCode' | 'foreignCode') {
  const credentials: Record<typeof role, string> = JSON.parse(readFileSync(pilot.info.credentials, 'utf8'));
  await enterSecret(page.getByLabel('Новый одноразовый код доступа'), credentials[role]);
  await page.getByRole('button', { name: 'Проверить новую сессию' }).click();
}

async function create(page: Page) {
  await page.getByRole('button', { name: 'Создать страницу события' }).click();
  const docs = page.getByRole('region', { name: 'Мои документы' });
  await docs.getByRole('button', { name: 'День открытых мастерских', exact: true }).press('Enter');
  await expect(page.getByTestId('pilot-revision')).not.toBeEmpty();
}

async function edit(page: Page, heading: string, text = 'Описание · é · 🌅') {
  const compact = (page.viewportSize()?.width ?? 1280) <= 800;
  if (compact) await page.getByRole('button', { name: 'Слои', exact: true }).press('Enter');
  await page.getByRole('navigation', { name: 'Слои страницы' }).getByRole('button', { name: 'Hero', exact: true }).press('Enter');
  const inspector = compact ? page.getByRole('dialog', { name: 'Inspector' }) : page.getByRole('complementary', { name: 'Inspector WebPage' });
  await inspector.getByLabel(/^Заголовок/).fill(heading);
  await inspector.getByLabel(/^Основной текст/).fill(text);
  await inspector.getByRole('button', { name: 'Применить', exact: true }).press('Enter');
  if (compact) await page.keyboard.press('Escape');
}

function pinned(result: { contract: string; validator: string; renderer: string; assetCatalog: string }) {
  const { contract, validator, renderer, assetCatalog } = result;
  return { contract, validator, renderer, assetCatalog };
}

async function evidence(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(name + '.png'), fullPage: true });
}

test('browser edits, saves and reopens the same revision on a restarted process', async ({ browser, page }, info) => {
  const children: Instance[] = [];
  try {
    const first = await start(children);
    const unexpected: string[] = [];
    page.on('request', req => {
      const url = new URL(req.url());
      if (url.origin !== first.info.url || req.method() === 'POST' && !url.pathname.startsWith('/c-test/web-page/v2/')) {
        unexpected.push(req.method() + ' ' + url.pathname);
      }
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await enter(page, first);
    const myDocs = page.getByRole('region', { name: 'Мои документы' });
    await expect(myDocs.getByText('У вас пока нет документов.')).toBeVisible();
    const createReceipt = page.waitForResponse(r => r.url().endsWith('/commands/create-web-page-project-v1'));
    await create(page);
    const initialContext = pinned((await (await createReceipt).json()).result.receipt.document);
    expect(initialContext.contract).toBe('0.1');
    const oldId = (await page.getByTestId('pilot-revision').textContent())!;
    await page.getByRole('navigation', { name: 'Слои страницы' }).getByRole('button', { name: 'Hero', exact: true }).press('Enter');
    await page.getByLabel(/^Заголовок/).fill('Неприменённый заголовок');
    await expect(page.getByTestId('storage-status')).toHaveText('Черновик');
    await page.getByRole('button', { name: 'Отменить', exact: true }).press('Enter');
    await expect(page.getByLabel(/^Заголовок/)).toHaveValue('День открытых мастерских');
    await edit(page, '');
    await expect(page.getByRole('alert')).toContainText('/hero/heading');
    await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled();
    await edit(page, 'Подтверждённый Hero');
    await page.getByRole('button', { name: 'Preview', exact: true }).press('Enter');
    for (const device of ['Tablet', 'Mobile', 'Desktop']) {
      await page.getByRole('button', { name: device, exact: true }).press('Enter');
      await expect(page.getByRole('region', { name: 'Preview WebPage' }).locator('[data-viewport]')).toHaveAttribute('data-viewport', device);
    }
    const saveReceipt = page.waitForResponse(r => r.url().endsWith('/commands/save-web-page-v1'));
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    const savedResponse = await saveReceipt;
    const savedBytes = Buffer.from(JSON.parse(savedResponse.request().postData()!).payload, 'utf8');
    expect(pinned((await savedResponse.json()).result.receipt.document)).toEqual(initialContext);
    await expect(page.getByTestId('storage-status')).toHaveText('Сохранено');
    await expect(page.getByTestId('pilot-revision')).not.toHaveText(oldId);
    const id = (await page.getByTestId('pilot-revision').textContent())!;
    const digest = (await page.getByTestId('pilot-digest').textContent())!;
    await evidence(page, info, 'saved-desktop');
    expect(unexpected).toEqual([]);
    expect(await page.evaluate(() => ({
      keys: Object.keys(localStorage).filter(key => key !== 'zarya-workspace-theme'), session: sessionStorage.length,
    }))).toEqual({ keys: [], session: 0 });
    await page.close();
    await first.close();

    const restarted = await start(children, ['--resume', first.info.state]);
    const mobile = await browser.newPage({ viewport: { width: 320, height: 900 } });
    await enter(mobile, restarted);
    const ownedDocuments = mobile.getByRole('region', { name: 'Мои документы' });
    await expect(ownedDocuments.getByRole('button', { name: 'Подтверждённый Hero' })).toBeVisible();
    await evidence(mobile, info, 'workspace-after-restart');
    const readResponse = mobile.waitForResponse(r => r.url().endsWith('/commands/read-web-page-v1'));
    await ownedDocuments.getByRole('button', { name: 'Подтверждённый Hero' }).click();
    await expect(mobile.getByTestId('pilot-revision')).toHaveText(id);
    await expect(mobile.getByTestId('pilot-digest')).toHaveText(digest);
    const reopened = (await (await readResponse).json()).result.document;
    expect(pinned(reopened)).toEqual(initialContext);
    expect(Buffer.from(reopened.payload, 'base64')).toEqual(savedBytes);
    expect(createHash('sha256').update(savedBytes).digest('hex')).toBe(digest);
    await mobile.getByRole('button', { name: 'Preview', exact: true }).press('Enter');
    const preview = mobile.getByRole('region', { name: 'Preview WebPage' });
    await expect(preview.getByRole('heading', { name: 'Подтверждённый Hero' })).toBeVisible();
    await expect(preview.getByText('Описание · e\u0301 · 🌅')).toBeVisible();
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await evidence(mobile, info, 'reopened-mobile');
    await mobile.getByRole('button', { name: 'В редактор' }).press('Enter');
    await edit(mobile, 'Продолжение после открытия');
    await mobile.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(mobile.getByTestId('storage-status')).toHaveText('Сохранено');
    await expect(mobile.getByTestId('pilot-revision')).not.toHaveText(id);
    await expect(mobile.getByTestId('pilot-digest')).not.toHaveText(digest);
    const foreign = await browser.newPage();
    await enter(foreign, restarted, 'foreignCode');
    const foreignList = foreign.getByRole('region', { name: 'Мои документы' });
    await expect(foreignList.getByText('У вас пока нет документов.')).toBeVisible();
    await expect(foreignList.getByRole('button', { name: 'Продолжение после открытия' })).toHaveCount(0);
    await foreign.close(); await mobile.close();
  } finally { await cleanup(children); }
});

test('browser preserves CAS conflict edits and saves only after manual transfer to the latest revision', async ({ browser, page }) => {
  const children: Instance[] = [];
  try {
    const h = await start(children);
    await enter(page, h); await create(page);
    const path = h.info.credentials;
    const previousFile = readFileSync(path, 'utf8');
    process.kill(h.info.pid, 'SIGUSR2');
    await expect.poll(() => readFileSync(path, 'utf8') !== previousFile).toBe(true);
    const second = await browser.newPage();
    await second.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await enter(second, h);
    await second.getByRole('region', { name: 'Мои документы' }).getByRole('button', { name: 'День открытых мастерских' }).press('Enter');
    await expect(second.getByTestId('pilot-revision')).not.toBeEmpty();
    let writes = 0;
    second.on('request', request => {
      if (request.url().endsWith('/commands/save-web-page-v1')) writes++;
    });
    await edit(page, 'Первое сохранение', 'Текст победившей вкладки');
    const winnerResponse = page.waitForResponse(response => response.url().endsWith('/commands/save-web-page-v1'));
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    const winner = (await (await winnerResponse).json()).result.receipt;
    await expect(page.getByTestId('storage-status')).toHaveText('Сохранено');
    await edit(second, 'Мой конфликтующий заголовок', 'Мой конфликтующий текст');
    await second.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(second.getByTestId('storage-status')).toContainText('Конфликт ревизий');
    await expect(second.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled();

    const heading = second.getByRole('complementary', { name: 'Inspector WebPage' }).getByLabel(/^Заголовок/);
    await expect(heading).toHaveValue('Мой конфликтующий заголовок');
    await heading.fill('Мой новый неприменённый заголовок');
    const recovery = second.getByRole('region', { name: 'Восстановление после конфликта' });
    await expect(recovery).toContainText('Ваши правки сохранены в текущей вкладке');
    await recovery.getByText('Как продолжить работу', { exact: true }).press('Enter');
    const myDocuments = recovery.getByRole('button', { name: 'Перейти в «Мои документы»' });
    second.once('dialog', dialog => dialog.dismiss());
    await myDocuments.press('Enter');
    await expect(heading).toHaveValue('Мой новый неприменённый заголовок');
    expect(writes).toBe(1);

    await second.bringToFront();
    await second.evaluate(() => {
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true, value: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
      });
    });
    await recovery.getByRole('button', { name: 'Скопировать все правки' }).press('Enter');
    await expect(recovery.getByText('Не удалось скопировать.', { exact: false })).toBeVisible();
    await expect(recovery.getByText('Скопировано в буфер обмена.', { exact: true })).toHaveCount(0);
    await expect(recovery.getByLabel('Все правки Hero', { exact: true })).toBeFocused();
    const expectedCopy = 'Заголовок Hero\nМой новый неприменённый заголовок\n\nОсновной текст Hero\nМой конфликтующий текст';
    await expect(recovery.getByLabel('Все правки Hero', { exact: true })).toHaveValue(expectedCopy);
    await second.evaluate(() => Reflect.deleteProperty(navigator.clipboard, 'writeText'));
    await recovery.getByRole('button', { name: 'Скопировать все правки' }).press('Enter');
    await expect(recovery.getByText('Скопировано в буфер обмена.', { exact: true })).toBeVisible();

    second.once('dialog', dialog => dialog.accept());
    await myDocuments.press('Enter');
    await second.getByRole('region', { name: 'Мои документы' }).getByRole('button', { name: 'Первое сохранение' }).press('Enter');
    await expect(second.getByTestId('pilot-revision')).toHaveText(winner.document.revisionId);
    await expect(second.getByRole('region', { name: 'Canvas WebPage' })).toContainText('Текст победившей вкладки');
    const copied = await second.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(expectedCopy);
    const [, copiedHeading, , , copiedBody] = copied.split('\n');
    await edit(second, copiedHeading, copiedBody);
    expect(writes).toBe(1);
    const response = second.waitForResponse(r => r.url().endsWith('/commands/save-web-page-v1'));
    await second.getByRole('button', { name: 'Сохранить', exact: true }).press('Enter');
    const { receipt } = (await (await response).json()).result;
    expect(receipt.parentRevisionId).toBe(winner.revision.id);
    expect(receipt.document.revisionId).not.toBe(winner.document.revisionId);
    await expect(second.getByTestId('storage-status')).toHaveText('Сохранено');
    await expect(second.getByTestId('pilot-revision')).toHaveText(receipt.document.revisionId);
    expect(writes).toBe(2);
    await second.close();
  } finally { await cleanup(children); }
});

test('invalid one-time code format is keyboard-accessible and can be corrected in both forms', async ({ page }) => {
  const children: Instance[] = [];
  try {
    const h = await start(children);
    let claims = 0;
    page.on('request', request => { if (request.url().endsWith('/session/claim')) claims++; });
    await page.goto(h.info.url);
    const originalCode = page.getByLabel('Одноразовый код доступа', { exact: true });
    const feedback = page.getByRole('alert').filter({ hasText: 'Неверный формат кода' });
    async function rejectInvalid(field: Locator, expectedClaims: number) {
      await field.fill('неверный код');
      await field.press('Enter');
      await expect(feedback).toBeVisible();
      await expect(field).toBeFocused();
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(field).toHaveAccessibleDescription(/Неверный формат кода/);
      expect(claims).toBe(expectedClaims);
    }
    await rejectInvalid(originalCode, 0);
    const first = readFileSync(h.info.credentials, 'utf8');
    await enterSecret(originalCode, JSON.parse(first).ownerCode);
    await expect(feedback).toHaveCount(0);
    await expect(originalCode).not.toHaveAttribute('aria-invalid');
    await originalCode.press('Enter');
    await create(page);
    await page.getByText('Повторная авторизация', { exact: true }).press('Enter');
    const replacement = page.getByLabel('Новый одноразовый код доступа', { exact: true });
    await rejectInvalid(replacement, 1);
    process.kill(h.info.pid, 'SIGUSR2');
    await expect.poll(() => readFileSync(h.info.credentials, 'utf8') !== first).toBe(true);
    await enterSecret(replacement, JSON.parse(readFileSync(h.info.credentials, 'utf8')).ownerCode);
    await expect(feedback).toHaveCount(0);
    await expect(replacement).not.toHaveAttribute('aria-invalid');
    await replacement.press('Enter');
    await expect(page.getByText('Сессия обновлена для владельца этой ревизии.')).toBeVisible();
    expect(claims).toBe(2);
  } finally { await cleanup(children); }
});

test('browser reauthenticates the owner after restart, then recovers the original receipt', async ({ page }) => {
  const children: Instance[] = [];
  try {
    const h = await start(children, ['--test-drop-edit']);
    await enter(page, h); await create(page);
    const previous = (await page.getByTestId('pilot-revision').textContent())!;
    await edit(page, 'Hero после потери ответа');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByTestId('storage-status')).toContainText('Исход сохранения неизвестен');
    await expect(page.getByLabel(/^Заголовок/)).toHaveValue('Hero после потери ответа');
    await h.close();
    const restarted = await start(children, ['--resume', h.info.state, '--port', new URL(h.info.url).port]);
    expect(restarted.info.url).toBe(h.info.url);
    await page.getByRole('button', { name: 'Проверить receipt' }).click();
    await expect(page.getByTestId('storage-status')).toContainText('Исход сохранения неизвестен');
    await page.getByText('Повторная авторизация', { exact: true }).click();
    await reauthorize(page, restarted, 'foreignCode');
    await expect(page.getByText('Сессию для этой ревизии подтвердить не удалось.')).toBeVisible();
    await expect(page.getByLabel(/^Заголовок/)).toHaveValue('Hero после потери ответа');
    await reauthorize(page, restarted, 'ownerCode');
    await expect(page.getByText('Сессия обновлена для владельца этой ревизии.')).toBeVisible();
    await expect(page.getByTestId('pilot-revision')).toHaveText(previous);
    await page.getByLabel(/^Заголовок/).fill('Новый черновик перед сверкой');
    await page.getByRole('button', { name: 'Проверить receipt' }).click();
    await expect(page.getByTestId('storage-status')).toHaveText('Изменено · предыдущая ревизия подтверждена по receipt');
    await expect(page.getByTestId('pilot-revision')).not.toHaveText(previous);
    await expect(page.getByLabel(/^Заголовок/)).toHaveValue('Новый черновик перед сверкой');
    await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Применить', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByTestId('storage-status')).toHaveText('Сохранено');
  } finally { await cleanup(children); }
});


test('an interrupted network request preserves the draft and never repeats Save automatically', async ({ page }) => {
  const children: Instance[] = [];
  try {
    const h = await start(children);
    await enter(page, h);
    await create(page);
    const revision = (await page.getByTestId('pilot-revision').textContent())!;
    let writes = 0;
    await page.route('**/commands/save-web-page-v1', async route => { writes++; await route.abort('failed'); });
    await edit(page, 'Черновик при сетевой ошибке');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByTestId('storage-status')).toContainText('Исход сохранения неизвестен');
    await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled();
    await expect(page.getByLabel(/^Заголовок/)).toHaveValue('Черновик при сетевой ошибке');
    await expect(page.getByTestId('pilot-revision')).toHaveText(revision);
    const statusResponse = page.waitForResponse(response => response.url().endsWith('/status/save-web-page-v1'));
    await page.getByRole('button', { name: 'Проверить receipt' }).click();
    expect((await statusResponse).status()).toBe(503);
    await expect(page.getByTestId('storage-status')).toContainText('Исход сохранения неизвестен');
    await expect(page.getByTestId('pilot-revision')).toHaveText(revision);
    expect(writes).toBe(1);
  } finally { await cleanup(children); }
});


test('document discovery exposes bounded loading and error states and supports safe retry', async ({ page }) => {
  const children: Instance[] = [];
  try {
    const h = await start(children);
    let allowRequest!: () => void;
    const gate = new Promise<void>(resolve => { allowRequest = resolve; });
    const pattern = '**/commands/list-web-page-documents-v1';
    await page.route(pattern, async route => { await gate; await route.abort('failed'); }, { times: 1 });
    await enter(page, h);
    const list = page.getByRole('region', { name: 'Мои документы' });
    try {
      await expect(list).toHaveAttribute('aria-busy', 'true');
      await expect(list.getByText('Загружаем документы…')).toBeVisible();
    } finally { allowRequest(); }
    await expect(list.getByText('Не удалось загрузить документы.', { exact: false })).toBeVisible();
    await list.getByRole('button', { name: 'Обновить список' }).click();
    await expect(list.getByText('У вас пока нет документов.')).toBeVisible();
  } finally { await cleanup(children); }
});


for (const width of [1440, 768, 390, 320]) {
  for (const [theme, scheme] of [['Светлая','light'], ['Тёмная','dark']] as const) {
    test('live Astra Workspace & Editor keyboard and fit ' + width + ' ' + scheme, async ({ page }, info) => {
      const children: Instance[] = [];
      try {
        await page.setViewportSize({ width, height: 900 });
        const h = await start(children);
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        const assets: string[] = [];
        page.on('response', response => { if (response.request().method() === 'GET' && response.status() >= 400) assets.push(response.url()); });
        await enter(page, h);
        const themeControl = page.getByLabel('Тема оболочки');
        if (width === 1440) {
          await page.emulateMedia({ colorScheme: scheme });
          await themeControl.selectOption('system');
          await expect(page.locator('.zs-platform')).toHaveAttribute('data-zarya-mode', 'system');
          await expect(page.locator('.zs-platform')).toHaveAttribute('data-zarya-scheme', scheme);
        }
        await themeControl.selectOption({ label: theme });
        const surface = page.locator('.zs-platform');
        await expect(surface).toHaveAttribute('data-zarya-scheme', scheme);
        const fits = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await fits();
        await create(page);
        await expect(page.getByRole('heading', { level: 1, name: 'Страница события' })).toBeFocused();
        await edit(page, 'Новая программа');
        await page.getByRole('button', { name: 'Preview', exact: true }).press('Enter');
        const preview = page.getByRole('region', { name: 'Preview WebPage' });
        await expect(preview.getByRole('heading', { name: 'Новая программа' })).toBeVisible();
        await preview.getByRole('link', { name: 'Посмотреть программу' }).press('Enter');
        await expect(preview.locator('.zwp-program')).toBeFocused();
        await fits();
        await page.getByRole('button', { name: 'Сохранить', exact: true }).press('Enter');
        await expect(page.getByTestId('storage-status')).toHaveText('Сохранено');
        await page.getByRole('button', { name: 'В редактор' }).press('Enter');
        if (width === 1440 && scheme === 'dark' || width === 390 && scheme === 'light') {
          await evidence(page, info, 'editor-' + width + '-' + scheme);
        }
        await page.getByRole('button', { name: 'К Workspace' }).press('Enter');
        await expect(page.getByRole('region', { name: 'Мои документы' }).getByRole('button', { name: 'Новая программа' })).toBeVisible();
        if (width === 1440 && scheme === 'dark' || width === 390 && scheme === 'light') {
          await evidence(page, info, 'workspace-' + width + '-' + scheme);
        }
        expect(errors).toEqual([]);
        expect(assets).toEqual([]);
      } finally { await cleanup(children); }
    });
  }
}
