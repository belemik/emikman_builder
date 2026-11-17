import { createServer } from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import {
  closeSync, constants, fsyncSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync, renameSync,
  unlinkSync, writeFileSync,
} from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dataDir, users, verifyPassword, hashPassword, legacyAccountPath } from './auth.mjs';
import { createSessionContext } from './session-context.mjs';
import { installPrincipalBoundary } from './projects/principal-boundary.mjs';

/** @import {syntheticSessionHooks} from './session-recovery-authority.mjs' */
/**
 * @typedef {import('node:http').ServerResponse} Response
 * @typedef {import('node:http').IncomingMessage} Request
 * @typedef {import('./auth.mjs').Account} Account
 * @typedef {import('./session-store.mjs').Lease} Lease
 * @typedef {import('./session-store.mjs').LookupOutcome} LookupOutcome
 * @typedef {ReturnType<typeof import('./session-store.mjs').initializeFresh>} Store
 * @typedef {Omit<import('./session-store.mjs').StoreOptions,'resolveAccount'> & {
 *   initialize:boolean,activation?:object,
 *   [syntheticSessionHooks]?:
 *     {beforeDelivery?:()=>Promise<void>|void,beforeResolveAccount?:(signal:AbortSignal)=>Promise<void>|void,
 *      onStage?:(stage:string)=>void,monotonic?:()=>number}
 * }} DurableOptions
 * @typedef {{unavailable:boolean,guardLookup?:LookupOutcome}} RequestState
 */
class DurableUnavailable extends Error {}

/** @param {string} runtimeRoot */
async function verifySyntheticAccounts(runtimeRoot) {
  // The auth module keeps its normal verifier and loader. Durable opt-in can
  // only read the separately created synthetic account fixture in its sandbox.
  if (typeof runtimeRoot !== 'string' || dataDir !== resolve(runtimeRoot, 'accounts')) {
    throw new DurableUnavailable();
  }
  const accountPaths = /** @type {const} */ ([[dataDir, true], [resolve(dataDir, 'users.json'), false]]);
  for (const [path, directory] of accountPaths) {
    const info = await lstat(path);
    if ((directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1) ||
        info.uid !== process.getuid?.() || (info.mode & 0o7777) !== (directory ? 0o700 : 0o600) ||
        await realpath(path) !== path) throw new DurableUnavailable();
  }
}

// Local durable credentials remain in the existing JSON file. Read only an
// owned regular inode; a linked destination is never an account source.
/** @returns {Account[]} */
function readDurableAccounts() {
  const file = resolve(dataDir, 'users.json');
  const directory = lstatSync(dataDir);
  if (!directory.isDirectory() || directory.uid !== process.getuid?.() ||
      (directory.mode & 0o7777) !== 0o700 || realpathSync(dataDir) !== dataDir) throw new DurableUnavailable();
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() ||
        (info.mode & 0o7777) !== 0o600 || info.dev !== directory.dev) throw new DurableUnavailable();
    const parsed = JSON.parse(readFileSync(fd, 'utf8'));
    if (!Array.isArray(parsed)) throw new DurableUnavailable();
    return parsed;
  } finally {
    closeSync(fd);
  }
}

/** @param {string} accountId @param {(stage:string)=>void} [afterRename] */
function cleanAccountFile(accountId, afterRename) {
  const list = readDurableAccounts();
  const remaining = list.filter(item => item.id !== accountId);
  if (remaining.length !== list.length) {
    const temporary = resolve(dataDir, 'users.json.s06-' + randomBytes(16).toString('hex'));
    const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL |
      constants.O_NOFOLLOW, 0o600);
    let published = false;
    try {
      try {
        writeFileSync(fd, JSON.stringify(remaining, null, 2));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temporary, resolve(dataDir, 'users.json'));
      published = true;
      afterRename?.('after-account-file-rename');
    } finally {
      if (!published) unlinkSync(temporary);
    }
  }
  // Retry must also confirm the directory entry after a previous failed sync.
  const fd = openSync(dataDir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

/** @param {{dev?:boolean,origin?:string,sessionTTL?:number,durableSessions?:DurableOptions}} [options] */
export async function createApp({
  dev = false, origin = 'http://127.0.0.1:5173', sessionTTL = 8 * 60 * 60 * 1000, durableSessions,
} = {}) {
  const secure = new URL(origin).protocol === 'https:';
  /** @type {Map<string,{userId:string,expires:number}>} */
  const sessions = new Map();
  /** @type {Map<string|undefined,{count:number,until:number}>} */
  const attempts = new Map();
  const dummyHash = hashPassword(randomBytes(32).toString('hex'));
  /** @param {string} value */
  const digest = value => createHash('sha256').update(value).digest('hex');
  /** @param {string} token @param {number} age */
  const cookie = (token, age) => `wdeaf_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`;
  /** @param {Response} res @param {number} status @param {unknown} data */
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  /** @type {Store|undefined} */
  let durable;
  /** @type {AsyncLocalStorage<RequestState>|undefined} */
  let requestState;
  /** @type {(()=>Promise<void>|void)|undefined} */
  let beforeDelivery;
  /** @type {((stage:string)=>void)|undefined} */
  let durableProbe;
  /** @param {Response} res */
  const writable = (res) => !res.destroyed && !res.writableEnded && res.writable &&
    res.socket !== null && !res.socket.destroyed;
  /** @param {Response} res */
  const temporary = (res) => json(res, 503, { error: 'Сервис временно недоступен.' });
  async function accountList() {
    if (durableSessions === undefined) return users();
    try {
      return readDurableAccounts();
    } catch {
      throw new DurableUnavailable();
    }
  }
  if (durableSessions === undefined) await legacyAccountPath();
  if (durableSessions !== undefined) {
    // Durable mode is restricted to the local static-server harness. Vite's
    // delegated streaming path has no late-delivery session gate.
    if (dev || new URL(origin).hostname !== '127.0.0.1' ||
        !durableSessions || typeof durableSessions.initialize !== 'boolean') throw new DurableUnavailable();
    try { await verifySyntheticAccounts(durableSessions.runtimeRoot); } catch { throw new DurableUnavailable(); }
    const { initializeFresh, openExisting } = await import('./session-store.mjs');
    /** @type {typeof syntheticSessionHooks} */
    const hooksKey = (await import('./session-recovery-authority.mjs')).syntheticSessionHooks;
    const hooks = durableSessions[hooksKey];
    beforeDelivery = hooks?.beforeDelivery;
    durableProbe = hooks?.onStage;
    if ((beforeDelivery !== undefined && typeof beforeDelivery !== 'function') ||
        (hooks?.beforeResolveAccount !== undefined && typeof hooks.beforeResolveAccount !== 'function')) {
      throw new DurableUnavailable();
    }
    /** @type {import('./session-store.mjs').StoreOptions} */
    const options = {
      ...durableSessions,
      testTtlMs: sessionTTL,
      resolveAccount: async (accountId, signal) => {
        if (hooks?.beforeResolveAccount) await hooks.beforeResolveAccount(signal);
        if (signal.aborted) return null;
        return (await accountList()).some(item => item.id === accountId) ? accountId : null;
      },
    };
    durable = durableSessions.initialize ? initializeFresh(options) : openExisting(options, durableSessions.activation);
    if (!durable.readiness()) {
      await durable.close();
      throw new DurableUnavailable();
    }
    requestState = new AsyncLocalStorage();
  }
  // Private resolver rechecks the exact live session after each async user lookup.
  let principalActive = true;
  const context = createSessionContext(async key => {
    if (durable) {
      const state = requestState?.getStore();
      /** @type {LookupOutcome} */
      const result = principalActive
        ? await durable.lookupOutcome(key).catch(() => ({ kind: 'unavailable' }))
        : { kind: 'unavailable' };
      if (state) {
        state.guardLookup = result;
        if (result.kind === 'unavailable') state.unavailable = true;
      }
      if (!principalActive && state) {
        state.guardLookup = { kind: 'unavailable' };
        state.unavailable = true;
      }
      return principalActive && result.kind === 'current' ? result.lease : null;
    }
    if (!principalActive) return null;
    const current = sessions.get(key);
    if (!current) return null;
    const accountId = current.userId, expiresAt = current.expires;
    const active = (await users()).some(item => item.id === accountId);
    if (!principalActive || !active || sessions.get(key) !== current || current.userId !== accountId || current.expires !== expiresAt) return null;
    return { identity: current, accountId, expiresAt };
  });
  /**
   * @template T
   * @param {()=>T|Promise<T>} check
   * @param {Lease|undefined} expected
   */
  async function checkGuard(check, expected) {
    if (!durable) return check();
    const state = requestState?.getStore();
    if (!state) return false;
    try {
      return await durable.trackGuard(async (recordExpiry) => {
        state.guardLookup = undefined;
        const accepted = await check();
        // The awaited guard can update this request-local state through its resolver.
        const lookup = /** @type {LookupOutcome|undefined} */ (state.guardLookup);
        // This exact, well-formed lease was bound to this request. An absent
        // resolver call or an exact confirmation on the deny path proves that
        // one of G1a's wall-clock checks observed expiry.
        if (!accepted && expected && (!lookup ||
            (lookup.kind === 'current' && lookup.lease.identity === expected.identity &&
              lookup.lease.accountId === expected.accountId && lookup.lease.expiresAt === expected.expiresAt))) {
          try { await recordExpiry(expected.expiresAt); } catch { state.unavailable = true; }
        }
        return accepted;
      });
    } catch {
      state.unavailable = true;
      return false;
    }
  }

  /** @param {string} accountId */
  const durableAccountExists = accountId => readDurableAccounts().some(item => item.id === accountId);

  /** @param {Response} res @param {string|null} key @param {Lease|undefined} expected @param {()=>void} send @param {()=>void} deny */
  async function authenticatedReply(res, key, expected, send, deny) {
    try {
      if (beforeDelivery) await beforeDelivery();
      if (!writable(res)) return;
      if (!durable || !key || !expected) return temporary(res);
      const outcome = await durable.deliverCurrent(key, expected, () => {
        if (!principalActive || !writable(res)) return false;
        send();
        return true;
      }, durableAccountExists);
      if (outcome === 'invalid' && writable(res)) return deny();
    } catch {
      if (!writable(res)) return;
      if (res.headersSent) res.destroy();
      else {
        res.removeHeader('Set-Cookie');
        return temporary(res);
      }
    }
  }

  /** @type {import('vite').ViteDevServer|undefined} */
  let vite;
  /** @param {Request} req @param {Response} res */
  const handle = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const path = new URL(req.url ?? '', origin).pathname;
      const method = req.method ?? '';
      const now = Date.now();
      for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key);
      for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
      if (!['GET', 'HEAD'].includes(method) && req.headers.origin !== origin) return json(res, 403, { error: 'Недопустимый источник запроса.' });
      const token = /(?:^|;\s*)wdeaf_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const key = token ? digest(token) : null;
      const outcome = durable && key ? await durable.lookupOutcome(key) : null;
      if (outcome?.kind === 'unavailable') return temporary(res);
      const lease = outcome?.kind === 'current' ? outcome.lease : undefined;
      const memorySession = !durable && key ? sessions.get(key) : undefined;
      const accountId = lease?.accountId ?? memorySession?.userId;
      const list = await accountList();
      const user = accountId && list.find(item => item.id === accountId);
      if (path === '/api/login' && req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'Ожидался JSON.' });
        const address = req.socket.remoteAddress; // Never trust arbitrary X-Forwarded-For.
        const bucket = attempts.get(address) || { count: 0, until: now + 15 * 60 * 1000 };
        if (bucket.count >= 10 || sessions.size >= 10000 || attempts.size >= 10000) { res.setHeader('Retry-After', '900'); return json(res, 429, { error: 'Слишком много попыток.' }); }
        bucket.count++; attempts.set(address, bucket);
        let body = '';
        for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 4096) return json(res, 413, { error: 'Запрос слишком большой.' }); }
        /** @type {unknown} */
        let credentials; try { credentials = JSON.parse(body); } catch { return json(res, 400, { error: 'Некорректный JSON.' }); }
        if (!credentials || typeof credentials !== 'object' || !('username' in credentials) ||
            !('password' in credentials) || typeof credentials.username !== 'string' ||
            typeof credentials.password !== 'string' || credentials.username.length > 40 || credentials.password.length > 128) return json(res, 400, { error: 'Некорректные данные.' });
        const { username, password } = credentials;
        const found = list.find(item => item.username === username);
        const valid = verifyPassword(password, found?.passwordHash || dummyHash);
        if (!found || !valid) return json(res, 401, { error: 'Неверный логин или пароль.' });
        attempts.delete(address);
        const next = randomBytes(32).toString('hex');
        const nextKey = digest(next);
        if (durable) {
          if (!principalActive) return temporary(res);
          try {
            await durable.replaceCurrent({ digest: nextKey, accountId: found.id,
              expected: lease ? { digest: key, identity: lease.identity } : null });
          } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'ROTATION_CONFLICT') {
              return json(res, 409, { error: 'Состояние сессии изменилось. Повторите вход.' });
            }
            return temporary(res);
          }
          const confirmed = await durable.lookupOutcome(nextKey);
          if (!principalActive || confirmed.kind !== 'current' ||
              confirmed.lease.accountId !== found.id) return temporary(res);
          return authenticatedReply(res, nextKey, confirmed.lease, () => {
            res.setHeader('Set-Cookie', cookie(next, Math.floor(sessionTTL / 1000)));
            json(res, 200, { ok: true });
          }, () => temporary(res));
        } else {
          if (key) sessions.delete(key);
          sessions.set(nextKey, { userId: found.id, expires: now + sessionTTL });
        }
        res.setHeader('Set-Cookie', cookie(next, Math.floor(sessionTTL / 1000)));
        return json(res, 200, { ok: true });
      }
      if (path === '/api/logout' && req.method === 'POST') {
        if (durable) {
          if (!principalActive) return temporary(res);
          try { await durable.revokeCurrent(key); } catch { return temporary(res); }
          if (!principalActive) return temporary(res);
        } else if (key) sessions.delete(key);
        res.setHeader('Set-Cookie', cookie('', 0)); return json(res, 200, { ok: true });
      }
      // Only actual guard output is bound. No body/owner/role claim enters context.
      const identity = lease?.identity ?? memorySession;
      const expiresAt = lease?.expiresAt ?? memorySession?.expires;
      if (user && key && identity && expiresAt !== undefined) context.bind(req, {
        key, identity, accountId: user.id, expiresAt,
      });
      const principal = user ? await checkGuard(() => principalBoundary.principalFor(req), lease) : null;
      const stillAuthorized = () => principalActive && principal &&
        checkGuard(() => principalBoundary.isCurrent(principal, req), lease);
      const deny = () => requestState?.getStore()?.unavailable || (durable && !principalActive)
        ? temporary(res) : json(res, 401, { error: 'Требуется вход.' });
      if (path === '/api/me') {
        if (!user || !principal || !await stillAuthorized() || (durable && !principalActive)) return deny();
        const body = { id: user.id, username: user.username };
        if (!durable) return json(res, 200, body);
        return authenticatedReply(res, key, lease, () => json(res, 200, body), deny);
      }
      // Only these public, non-sensitive assets are needed by the login form.
      const loginAssets = new Set(['/icons/eye.svg', '/icons/eye-off.svg', '/wdeaf-controls.css']);
      if (loginAssets.has(path) && ['GET', 'HEAD'].includes(method)) {
        res.setHeader('Content-Type', path.endsWith('.svg') ? 'image/svg+xml' : 'text/css; charset=utf-8');
        return res.end(req.method === 'HEAD' ? undefined : await readFile(resolve('public', '.' + path)));
      }
      if (!principal) {
        if (requestState?.getStore()?.unavailable || (durable && !principalActive)) return deny();
        if (path === '/' && req.method === 'GET') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(await readFile(new URL('./login.html', import.meta.url))); }
        return json(res, 401, { error: 'Требуется вход.' });
      }
      /** @param {number} status @param {string} error */
      const protectedError = (status, error) => durable
        ? authenticatedReply(res, key, lease, () => json(res, status, { error }), deny)
        : json(res, status, { error });
      if (path.startsWith('/api/')) return protectedError(404, 'Не найдено.');
      if (!['GET', 'HEAD'].includes(method)) return protectedError(405, 'Метод недоступен.');
      if (vite) return vite.middlewares(req, res);
      const root = resolve('dist-server');
      const file = resolve(root, `.${decodeURIComponent(path === '/' ? '/index.html' : path)}`);
      if (!file.startsWith(root + sep)) return protectedError(403, 'Доступ запрещён.');
      try {
        if (!(await stat(file)).isFile()) return protectedError(404, 'Не найдено.');
        /** @type {Record<string,string>} */
        const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
        res.setHeader('Content-Type', `${mime[extname(file)] || 'application/octet-stream'}; charset=utf-8`);
        const body = req.method === 'HEAD' ? undefined : await readFile(file);
        if (!await stillAuthorized() || (durable && !principalActive)) return deny();
        if (durable) return authenticatedReply(res, key, lease, () => res.end(body), deny);
        res.end(body);
      } catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return protectedError(404, 'Не найдено.'); throw error; }
    } catch (error) {
      if (res.headersSent) res.end();
      else if (error instanceof DurableUnavailable) temporary(res);
      else json(res, 500, { error: 'Ошибка сервера.' });
    }
  };
  const server = createServer((req, res) => requestState
    ? requestState.run({ unavailable: false }, () => handle(req, res)) : handle(req, res));
  const principalBoundary = installPrincipalBoundary(server, context);
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  if (dev) {
    const { createServer: createViteServer } = await import('vite');
    vite = await createViteServer({ server: { middlewareMode: true, hmr: false, fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.data/**', '**/server/**'] } }, appType: 'spa' });
  }
  const store = durable;
  /** @param {string} accountId @param {string} operationId */
  const deleteAccount = (accountId, operationId) => {
    if (!store) throw new DurableUnavailable();
    return store.deleteAccount(accountId, operationId, durableAccountExists, id => cleanAccountFile(id, durableProbe));
  };
  return {
    server,
    ...(store ? { deleteAccount } : {}),
    close: async () => {
      principalActive = false;
      const storageClose = durable?.close();
      void storageClose?.catch(() => {}); // Still propagate it after HTTP teardown.
      try {
        await vite?.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      } finally {
        await storageClose;
      }
    },
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dev = process.argv.includes('--dev');
  const port = Number(process.env.PORT || 5173);
  const origin = process.env.APP_ORIGIN || `http://127.0.0.1:${port}`;
  const host = process.env.HOST || '127.0.0.1';
  if (host !== '127.0.0.1' && (!process.env.APP_ORIGIN || !origin.startsWith('https://'))) throw new Error('Для внешнего доступа задайте APP_ORIGIN=https://ваш-домен и HTTPS reverse proxy.');
  const app = await createApp({ dev, origin });
  app.server.listen(port, host, () => console.log(`ЗАРЯ: ${origin} (${dev ? 'разработка' : 'production'}, вход обязателен)`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(); });
}
