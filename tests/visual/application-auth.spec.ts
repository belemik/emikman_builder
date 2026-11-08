import { test, expect } from '@playwright/test';
import { spawn, execFile } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';

// A disposable server/users directory: no real accounts, production storage or auth changes.
async function disposableServer(dev = true) {
  const data = await mkdtemp(join(tmpdir(), 'zarya-w03-auth-'));
  const child = spawn(process.execPath, ['--input-type=module', '-'], { cwd: process.cwd(), env: { ...process.env, DATA_DIR: data }, stdio: ['pipe', 'pipe', 'pipe'] });
  let diagnostics = ''; child.stderr.on('data', value => { diagnostics += value; });
  const closed = new Promise<void>(resolve => child.once('exit', () => resolve()));
  const lines = createInterface({ input: child.stdout });
  const ready = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Disposable server did not start: ' + diagnostics)), 20000);
    lines.on('line', line => { if (line.startsWith('W03_READY ')) { clearTimeout(timer); resolve(line.slice(10)); } });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Disposable server exited ${code}: ${diagnostics}`)); });
  });
  child.stdin.end(`
    import { createServer } from 'node:net';
    import { addUser } from './server/auth.mjs';
    import { createApp } from './server/index.mjs';
    const probe = createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r));
    const port = probe.address().port; await new Promise(r => probe.close(r));
    const origin = 'http://127.0.0.1:' + port;
    await addUser('w03-tester', 'disposable-test-password-2026');
    const app = await createApp({ dev: ${dev}, origin });
    await new Promise(r => app.server.listen(port, '127.0.0.1', r));
    console.log('W03_READY ' + origin);
    process.on('SIGTERM', async () => { await app.close(); process.exit(0); });
  `);
  const close = async () => { child.kill('SIGTERM'); await closed; lines.close(); await rm(data, { recursive: true, force: true }); };
  try { return { origin: await ready, data, close }; } catch (error) { await close(); throw error; }
}
async function login(page: import('@playwright/test').Page, origin: string) {
  await page.goto(origin + '/?demo=workspace');
  await expect(page.getByRole('heading', { name: 'Вход в ЗАРЮ' })).toBeVisible();
  await expect(page).toHaveTitle('Вход · ЗАРЯ');
  await page.getByLabel('Логин', { exact: true }).fill('w03-tester');
  await page.getByLabel('Пароль', { exact: true }).fill('disposable-test-password-2026');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Что создадим сегодня?' })).toBeVisible();
  await expect(page).toHaveTitle('ЗАРЯ Workspace');
}

for (const mobile of [false, true]) test(`W03a ${mobile ? 'Mobile' : 'Desktop'}: direct Workspace logout, keyboard, history and protected deep links`, async ({ page }) => {
  test.setTimeout(60000);
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const server = await disposableServer();
  const openProfile = async () => {
    if (mobile) await page.getByRole('button', { name: 'Открыть меню' }).click();
    const trigger = page.getByRole('button', { name: 'Открыть профиль w03-tester' });
    await trigger.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toBeEnabled();
  };
  try {
    expect((await page.request.get(server.origin + '/api/me')).status()).toBe(401);
    await login(page, server.origin);
    await expect(page.locator('.catalog')).toHaveCount(0);
    // Exercise protected document history without visiting the laboratory at all.
    await page.goto(server.origin + '/?view=workspace');
    await expect(page.getByRole('heading', { name: 'Что создадим сегодня?' })).toBeVisible();
    await page.goBack(); await expect(page.getByRole('heading', { name: 'Что создадим сегодня?' })).toBeVisible();
    await page.goForward(); await expect(page.getByRole('heading', { name: 'Что создадим сегодня?' })).toBeVisible();
    await expect(page.locator('.catalog')).toHaveCount(0);
    await openProfile();
    if (!mobile) {
      // A failed request must not pretend the session ended; keep a usable retry.
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      await page.route('**/api/logout', async route => { await held; await route.fulfill({ status: 503, body: 'Unavailable' }); });
      await page.getByRole('button', { name: 'Выйти', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Выход…', exact: true })).toBeDisabled();
      release(); await expect(page.getByRole('alert')).toContainText('Не удалось выйти');
      await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toBeEnabled();
      expect((await page.request.get(server.origin + '/api/me')).status()).toBe(200);
      await page.unroute('**/api/logout');
    }
    const logout = page.waitForResponse(response => response.url() === server.origin + '/api/logout' && response.request().method() === 'POST');
    await page.keyboard.press('End'); await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toBeFocused();
    await page.keyboard.press('Enter'); expect((await logout).status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Вход в ЗАРЮ' })).toBeVisible();
    expect((await page.request.get(server.origin + '/api/me')).status()).toBe(401);
    await page.goBack(); await expect(page.getByRole('heading', { name: 'Вход в ЗАРЮ' })).toBeVisible();
    await expect(page.locator('.zarya')).toHaveCount(0);
    await page.goForward(); await expect(page.getByRole('heading', { name: 'Вход в ЗАРЮ' })).toBeVisible();
    for (const query of ['?view=workspace', '?demo=workspace', '?view=laboratory']) {
      await page.goto(server.origin + '/' + query);
      await expect(page.getByRole('heading', { name: 'Вход в ЗАРЮ' })).toBeVisible();
      await expect(page.locator('.zarya, .catalog')).toHaveCount(0);
    }
  } finally { await server.close(); }
});

test('W03a laboratory retains the original AccountButton profile/logout', async ({ page }) => {
  test.setTimeout(60000); const server = await disposableServer();
  try {
    await login(page, server.origin);
    await page.getByRole('button', { name: 'Открыть профиль w03-tester' }).click();
    await page.getByRole('button', { name: 'Технический раздел', exact: true }).click();
    await page.getByRole('link', { name: 'Открыть лабораторию компонентов' }).click();
    await page.getByRole('button', { name: 'Открыть профиль w03-tester' }).click();
    await page.getByRole('dialog', { name: 'Личный кабинет' }).getByRole('button', { name: 'Выйти из системы' }).click();
    await expect(page.getByRole('heading', { name: 'Вход в ЗАРЮ' })).toBeVisible();
    expect((await page.request.get(server.origin + '/api/me')).status()).toBe(401);
  } finally { await server.close(); }
});

test('W03b MULTI-SESSION: A/B/C share one account with independent cookies, mock projects and laboratory documents', async ({ browser }, info) => {
  test.setTimeout(90000);
  // Exercise the actual server build, without Vite's development WebSocket.
  // Also prepares dist-server in the existing macOS visual CI job (Pages build only).
  const build = await promisify(execFile)('npm', ['run', 'build:server'], { cwd: process.cwd() });
  await info.attach('Server production build preparation', { body: build.stdout + build.stderr, contentType: 'text/plain' });
  const server = await disposableServer(false);
  const contexts: import('@playwright/test').BrowserContext[] = [];
  const errors: string[] = [];
  const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');
  try {
    const usersBefore = digest(await readFile(join(server.data, 'users.json')));
    contexts.push(...await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]));
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    const [a, b, c] = pages; pages.forEach(page => page.on('pageerror', error => errors.push(error.message)));
    await Promise.all(pages.map(page => login(page, server.origin)));
    const status = () => Promise.all(contexts.map(async context => (await context.request.get(server.origin + '/api/me')).status()));
    const cookieValues = () => Promise.all(contexts.map(async context => (await context.cookies(server.origin)).find(cookie => cookie.name === 'wdeaf_session')?.value));
    expect(await status()).toEqual([200, 200, 200]);
    const identities = await Promise.all(contexts.map(async context => (await context.request.get(server.origin + '/api/me')).json()));
    expect(identities.every(user => typeof user.id === 'string' && user.username === 'w03-tester')).toBe(true);
    expect(new Set(identities.map(user => user.id)).size).toBe(1);
    const firstCookies = await cookieValues(); expect(firstCookies.every(Boolean)).toBe(true); expect(new Set(firstCookies).size).toBe(3);
    const labKey = `wdeaf.canvas.v1.${identities[0].id}`;
    const labRaw = () => c.evaluate(key => localStorage.getItem(key), labKey);
    const createMock = async (page: import('@playwright/test').Page, name: string, prototype: boolean) => {
      await page.getByRole('button', { name: prototype ? /^Прототип приложения/ : /^Сайт с нуля/ }).click();
      await page.getByLabel('Название проекта').fill(name);
      await page.getByLabel(prototype ? 'Описание сценария' : 'Описание задачи').fill(name + ' — только локальный mock');
      await page.getByRole('button', { name: 'Открыть демонстрационный проект' }).click();
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    };
    await Promise.all([
      (async () => {
        await createMock(a, 'Контекст A', false); await a.getByRole('button', { name: 'Открыть Canvas', exact: true }).click();
        await a.locator('.z-layers').getByRole('button', { name: /Input \/ Email/ }).click();
        await a.getByRole('button', { name: 'Контекстный чат', exact: true }).click();
        await a.getByRole('textbox', { name: 'Сообщение к макету' }).fill('Только чат A');
        await a.getByRole('button', { name: 'Отправить mock-сообщение' }).click();
      })(),
      (async () => {
        await createMock(b, 'Контекст B', true);
        await b.getByRole('navigation', { name: 'Разделы проекта' }).getByRole('button', { name: 'Настройки проекта' }).click();
      })(),
      (async () => {
        await c.getByRole('button', { name: 'Открыть профиль w03-tester' }).click();
        await c.getByRole('button', { name: 'Технический раздел', exact: true }).click();
        await c.getByRole('link', { name: 'Открыть лабораторию компонентов' }).click();
        await expect(c).toHaveTitle('Лаборатория компонентов · ЗАРЯ');
        await expect(c.locator('.app-header .brand strong')).toHaveText('ЗАРЯ');
        await expect(c.getByText('Из библиотеки WDeaf PRO 2.0', { exact: true })).toBeVisible();
        await c.locator('.catalog-card').filter({ hasText: 'TagItem' }).click();
        await expect(c.locator('.canvas-item')).toHaveCount(1);
      })(),
    ]);
    await expect(a.locator('.z-inspector h3')).toHaveText('Input / Email');
    await expect(a.getByText('Только чат A', { exact: true })).toBeVisible();
    await expect(a.getByRole('button', { name: /Контекст B/ })).toHaveCount(0);
    await expect(b.getByRole('heading', { name: 'Контекст B', exact: true })).toBeVisible();
    await expect(b.getByRole('button', { name: /Контекст A/ })).toHaveCount(0);
    await expect(b.getByText('Только чат A', { exact: true })).toHaveCount(0);
    for (const page of [a, b]) expect(await page.evaluate(key => localStorage.getItem(key), labKey)).toBeNull();
    await expect.poll(labRaw).not.toBeNull();
    expect(JSON.parse((await labRaw())!).elements).toHaveLength(1);
    // C's mounted Workspace must also have no projects created by A or B.
    await c.getByRole('link', { name: 'Вернуться в Workspace' }).click();
    await c.getByRole('button', { name: 'Все проекты' }).click();
    await expect(c.locator('.z-project-grid .z-project-card')).toHaveCount(2);
    await expect(c.getByRole('button', { name: /Контекст A|Контекст B/ })).toHaveCount(0);
    await c.goBack(); await expect(c.locator('.canvas-item')).toHaveCount(1);
    // A ends only its own server session.
    await a.getByRole('button', { name: 'Открыть профиль w03-tester' }).click();
    await a.getByRole('button', { name: 'Выйти', exact: true }).click();
    await expect(a.getByRole('heading', { name: 'Вход в ЗАРЮ' })).toBeVisible();
    const afterLogout = await status(); expect(afterLogout).toEqual([401, 200, 200]);
    await Promise.all([
      (async () => {
        await b.getByRole('button', { name: 'Открыть Canvas', exact: true }).click();
        await b.locator('.z-layers').getByRole('button', { name: /Input \/ Пароль/ }).click();
        await expect(b.locator('.z-inspector h3')).toHaveText('Input / Пароль');
      })(),
      (async () => {
        await c.locator('.catalog-card').filter({ hasText: 'TagItem' }).click(); await expect(c.locator('.canvas-item')).toHaveCount(2);
      })(),
    ]);
    await expect.poll(async () => JSON.parse((await labRaw())!).elements.length).toBe(2);
    const cDocument = await labRaw(); expect(JSON.parse(cDocument!).schemaVersion).toBe(3);
    // Re-login A with the same test credentials; B/C remain untouched.
    await login(a, server.origin);
    const afterRelogin = await status(); expect(afterRelogin).toEqual([200, 200, 200]);
    const lastCookies = await cookieValues(); expect(new Set(lastCookies).size).toBe(3);
    expect(lastCookies[0] !== firstCookies[0]).toBe(true);
    expect(lastCookies[1] === firstCookies[1] && lastCookies[2] === firstCookies[2]).toBe(true);
    await expect(b.locator('.z-inspector h3')).toHaveText('Input / Пароль');
    await expect(b.locator('.z-work-title')).toContainText('Контекст B');
    expect(await labRaw()).toBe(cDocument);
    for (const page of [a, b]) expect(await page.evaluate(key => localStorage.getItem(key), labKey)).toBeNull();
    await a.getByRole('button', { name: 'Все проекты' }).click(); await expect(a.locator('.z-project-grid .z-project-card')).toHaveCount(2);
    const usersUnchanged = usersBefore === digest(await readFile(join(server.data, 'users.json'))); expect(usersUnchanged).toBe(true);
    expect(errors).toEqual([]);
    const evidence = {
      scenario: 'Three independent BrowserContexts; one disposable account; concurrent UI logins/actions',
      serverMode: 'production dist-server; dev=false', result: 'PASS', initialSessionStatuses: [200, 200, 200], distinctSessionCookies: 3,
      sameAccount: true, mockProjectsIsolated: true, laboratoryStorageIsolated: true,
      afterLogoutA: afterLogout, continuedWorkB: true, laboratoryElementsC: 2,
      afterReloginA: afterRelogin, cookiesBCUnchanged: true, documentCUnchanged: true,
      temporaryUsersFileUnchanged: usersUnchanged, pageErrors: errors.length,
    };
    const path = info.outputPath('multi-session-evidence.json'); await writeFile(path, JSON.stringify(evidence, null, 2));
    await info.attach('MULTI-SESSION evidence (no tokens or credentials)', { path, contentType: 'application/json' });
  } finally {
    await Promise.all(contexts.map(context => context.close())); await server.close();
  }
});
