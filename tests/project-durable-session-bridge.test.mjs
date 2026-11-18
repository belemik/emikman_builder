import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeSync } from 'node:fs';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { link, lstat, mkdir, mkdtemp, open, readFile, readdir, rm, rmdir, symlink, unlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { requireValue } from './fixtures/session-store-worker.mjs';

/** @typedef {Awaited<ReturnType<typeof import('../server/index.mjs').createApp>>} App */
/** @typedef {import('../server/index.mjs').DurableOptions} DurableOptions */
/** @typedef {import('../server/auth.mjs').Account} Account */
/** @typedef {import('node:test').TestContext} TestContext */

/** @param {object} message @param {(error:Error|null)=>void} [done] */
function sendFixture(message, done) {
  assert.ok(process.send);
  if (done) process.send(message, done);
  else process.send(message);
}

function disconnectFixture() {
  assert.ok(process.disconnect);
  process.disconnect();
}

const origin = 'http://127.0.0.1:5173';
const fixturePassword = 'synthetic-bridge-password-26';
const otherPassword = 'synthetic-second-account-26';
const publicFault = { error: 'Сервис временно недоступен.' };

/** @template T @param {Promise<T>} promise */
async function within(promise, ms = 4000) {
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
  try {
    return await Promise.race([promise, /** @type {Promise<never>} */ (new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Bridge fixture did not confirm a lifecycle transition')), ms);
    }))]);
  } finally {
    clearTimeout(timer);
  }
}

/** @param {string} root */
async function inventory(root, relative = '') {
  const directories = relative === '' ? /^(session-data|recovery-control|accounts)$/ :
    relative === 'session-data' ? /^[a-f0-9]{32}$/ : null;
  const files = relative === 'accounts' ? /^users\.json$/ : relative === 'recovery-control'
    ? /^authority(?:-lock)?\.sqlite(?:-(?:wal|shm|journal))?$/ :
    /^session\.sqlite(?:-(?:wal|shm|journal))?$/;
  for (const name of await readdir(join(root, relative))) {
    const child = join(relative, name);
    const info = await lstat(join(root, child));
    assert.equal(info.uid, process.getuid?.());
    if (directories) {
      assert.ok(info.isDirectory() && directories.test(name));
      await inventory(root, child);
    } else {
      assert.ok(info.isFile() && info.nlink === 1 && files.test(name));
    }
  }
}

/** @param {TestContext} t @param {string} name */
async function scenario(t, name) {
  const runtimeRoot = await mkdtemp('/private/var/tmp/zarya-g1b-c1-');
  const child = fork(new URL(import.meta.url), ['fixture', name, runtimeRoot], {
    execArgv: [],
    env: { PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin', TZ: 'UTC' },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const ended = once(child, 'close');
  void ended.catch(() => {});
  const reply = once(child, 'message');
  void reply.catch(() => {});
  t.after(async () => {
    try {
      if (child.connected) child.disconnect();
      await within(ended);
    } catch (error) {
      child.unref();
      throw error; // Preserve an unconfirmed child's files.
    }
    const root = await lstat(runtimeRoot);
    assert.ok(root.isDirectory() && root.uid === process.getuid?.() && (root.mode & 0o7777) === 0o700);
    await inventory(runtimeRoot);
    await rm(runtimeRoot, { recursive: true });
  });
  const [result] = await within(reply, 8000);
  assert.deepEqual(result, { case: name, status: 'PASS' });
  assert.deepEqual(await within(ended), [0, null]);
}

/** @param {string} controlRoot */
async function probeAuthorityLock(controlRoot) {
  const child = fork(new URL(import.meta.url), ['cp2-lock-probe', controlRoot], {
    execArgv: [], env: { PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin' },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const close = once(child, 'close');
  void close.catch(() => {});
  try {
    const [message] = await within(once(child, 'message'));
    assert.deepEqual(await within(close), [0, null]);
    return message.lock;
  } catch (error) {
    if (child.connected) child.disconnect();
    child.unref();
    throw error;
  }
}

/** @param {string} controlRoot */
function runLockProbe(controlRoot) {
  const db = new DatabaseSync(join(controlRoot, 'authority-lock.sqlite'));
  let result;
  try {
    db.exec('PRAGMA busy_timeout=100');
    db.exec('BEGIN EXCLUSIVE');
    db.exec('ROLLBACK');
    result = 'acquired';
  } catch (error) {
    if (!(error instanceof Error && 'errcode' in error && error.errcode === 5)) throw error;
    result = 'busy';
  } finally {
    db.close();
  }
  sendFixture({ lock: result }, () => disconnectFixture());
}

/** @param {string} dataDir */
async function writerProbe(dataDir) {
  const child = fork(new URL(import.meta.url), ['s06-writer-probe'], {
    env: { DATA_DIR: dataDir, PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin', TZ: 'UTC' },
    execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const close = once(child, 'close');
  void close.catch(() => {});
  try {
    const [result] = await within(once(child, 'message'));
    assert.deepEqual(await within(close), [0, null]);
    return result;
  } catch (error) {
    if (child.connected) child.disconnect();
    child.unref();
    throw error;
  }
}

/** @param {string} name @param {string} runtimeRoot @param {string} [crashRun] @param {string} [loginCrash] */
async function fixture(name, runtimeRoot, crashRun, loginCrash) {
  const accounts = join(runtimeRoot, 'accounts');
  const sessionRoot = join(runtimeRoot, 'session-data');
  const controlRoot = join(runtimeRoot, 'recovery-control');
  await mkdir(sessionRoot, { mode: 0o700 });
  await mkdir(controlRoot, { mode: 0o700 });
  process.env.DATA_DIR = accounts;
  const { addUser, hashPassword } = await import('../server/auth.mjs');
  const accountA = 'a'.repeat(32);
  const accountB = 'b'.repeat(32);
  const operationId = 'c'.repeat(32);
  const accountFile = join(accounts, 'users.json');
  await mkdir(accounts, { mode: 0o700 });
  await writeFile(accountFile, JSON.stringify([
    { id: accountA, username: 'synthetic_a', passwordHash: hashPassword(fixturePassword) },
    { id: accountB, username: 'synthetic_b', passwordHash: hashPassword(otherPassword) },
  ]), { flag: 'wx', mode: 0o600 });
  const { createApp } = await import('../server/index.mjs');
  const { syntheticSessionHooks, openOfflineRecovery } = await import('../server/session-recovery-authority.mjs');
  let now = Date.now();
  let advance = false;
  /** @type {((stage:string)=>void)|undefined} */ let stage;
  /** @type {(()=>Promise<void>)|undefined} */ let deliveryBarrier;
  /** @type {((signal:AbortSignal)=>Promise<void>)|undefined} */ let resolveBarrier;
  function pause() {
    /** @type {()=>void} */ let reached = () => assert.fail('Barrier not initialized');
    /** @type {()=>void} */ let release = () => assert.fail('Barrier not initialized');
    const first = new Promise((resolve) => { reached = () => resolve(undefined); });
    /** @type {Promise<void>} */
    const until = new Promise((resolve) => { release = () => resolve(); });
    return { reached: first, release, wait: () => { reached(); return until; } };
  }
  function holdBeforeDelivery() {
    const next = pause();
    deliveryBarrier = () => {
      deliveryBarrier = undefined;
      return next.wait();
    };
    return next;
  }
  async function control() {
    const db = new DatabaseSync(join(controlRoot, 'authority.sqlite'), { readOnly: true });
    try { return requireValue(db.prepare('SELECT * FROM authority').get()); } finally { db.close(); }
  }
  /** @type {Omit<DurableOptions,'initialize'>} */
  const config = {
    runtimeRoot, sessionRoot, controlRoot,
    wallClock: () => advance ? ++now : now,
    [syntheticSessionHooks]: {
      onStage(/** @type {string} */ value) { stage?.(value); },
      beforeDelivery: () => deliveryBarrier?.(),
      beforeResolveAccount: (/** @type {AbortSignal} */ signal) => resolveBarrier?.(signal),
    },
  };
  /** @type {App|undefined} */ let app;
  let address = '';
  /** @param {boolean|null} initialize @param {{durableSessions?:{activation?:object}}} extra */
  async function start(initialize = null, extra = {}) {
    app = await createApp({ origin, sessionTTL: 60_000,
      ...(initialize === null ? {} : { durableSessions: { ...config, initialize, ...extra.durableSessions } }) });
    app.server.listen(0, '127.0.0.1');
    await once(app.server, 'listening');
    const bound = app.server.address();
    assert.ok(bound && typeof bound !== 'string');
    address = 'http://127.0.0.1:' + bound.port;
  }
  /** @param {string} id @param {string} operationId */
  function deleteAccount(id, operationId) {
    return requireValue(requireValue(app).deleteAccount)(id, operationId);
  }
  async function stop() {
    const open = app;
    app = undefined;
    if (open) await open.close();
  }
  /** @param {string} path @param {string|null} [cookie] @param {string} method @param {string} [body] */
  function call(path, cookie, method = 'GET', body) {
    return fetch(address + path, { method, headers: {
      ...(cookie ? { cookie } : {}),
      ...(method !== 'GET' ? { origin, 'Content-Type': 'application/json' } : {}),
    }, body });
  }
  /** @param {string|null} [cookie] */
  function signIn(cookie, username = 'synthetic_a', password = fixturePassword) {
    return call('/api/login', cookie, 'POST', JSON.stringify({ username, password }));
  }
  /** @param {string} cookie */
  function pendingSignIn(cookie, username = 'synthetic_a', password = fixturePassword) {
    /** @type {import('node:http').ClientRequest|undefined} */ let req;
    /** @type {Promise<{status:number,cookie:boolean}>} */
    const result = new Promise((resolve, reject) => {
      req = request(address + '/api/login', { method: 'POST', headers: {
        origin, cookie, 'Content-Type': 'application/json',
      } }, (res) => {
        res.resume();
        res.once('end', () => resolve({ status: requireValue(res.statusCode), cookie: Boolean(res.headers['set-cookie']) }));
      });
      req.on('error', reject);
      req.write('{');
    });
    void result.catch(() => {});
    const pendingRequest = requireValue(req);
    return { result, finish: () => pendingRequest.end(JSON.stringify({ username, password }).slice(1)),
      destroy: () => pendingRequest.destroy() };
  }

  /** @param {Response} result */
  function validCookie(result) {
    assert.equal(result.status, 200);
    const header = result.headers.get('set-cookie') ?? '';
    assert.ok(/^wdeaf_session=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=60$/.test(header));
    return header.split(';')[0];
  }
  /** @param {Response} response */
  async function expectFault(response) {
    assert.equal(response.status, 503);
    assert.equal(response.headers.has('set-cookie'), false);
    assert.deepEqual(await response.json(), publicFault);
  }
  try {
    if (name === 'lifecycle') {
      // Legacy G1a login is exercised by its unmodified suite on a separate root.
      await assert.rejects(start());
      await start(true);
      assert.equal((await call('/api/me', 'wdeaf_session=' + '1'.repeat(64))).status, 401);
      const old = validCookie(await signIn());
      const a2 = validCookie(await signIn());
      const b = validCookie(await signIn(null, 'synthetic_b', otherPassword));
      assert.equal((await (await call('/api/me', old)).json()).username, 'synthetic_a');
      await stop();
      await start(false);
      assert.equal((await call('/api/me', old)).status, 200);
      const switched = validCookie(await signIn(old, 'synthetic_b', otherPassword));
      assert.equal((await call('/api/me', old)).status, 401);
      assert.equal((await (await call('/api/me', switched)).json()).username, 'synthetic_b');
      assert.equal((await call('/api/me', a2)).status, 200);
      assert.equal((await call('/api/me', b)).status, 200);
      for (const presented of [switched, switched, null]) {
        const logout = await call('/api/logout', presented, 'POST');
        assert.equal(logout.status, 200);
        assert.equal(logout.headers.get('set-cookie'), 'wdeaf_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
      }
      await stop();
      await start(false);
      assert.equal((await call('/api/me', switched)).status, 401);
      assert.equal((await call('/api/me', a2)).status, 200);
    } else if (name === 'fencing') {
      await assert.rejects(createApp({ origin, dev: true, durableSessions: { ...config, initialize: true } }));
      await start(true);
      const expired = validCookie(await signIn());
      now += 60_000;
      const denied = await call('/api/me', expired);
      assert.equal(denied.status, 401);
      assert.equal(denied.headers.has('set-cookie'), false);
      const live = validCookie(await signIn());
      now -= 1;
      await expectFault(await call('/api/me', live));
      await expectFault(await signIn(live));
      await expectFault(await call('/api/logout', live, 'POST'));
      await expectFault(await call('/api/logout', null, 'POST'));
      await assert.rejects(stop(), { code: 'AUTHORITY_FENCED' });
      now += 2;
      await assert.rejects(start(false), { code: 'AUTHORITY_FENCED' });
      const recovery = openOfflineRecovery(config, true);
      try {
        const resetId = recovery.reserveResetId();
        const reset = recovery.confirmReset(resetId);
        await start(false, { durableSessions: { activation: reset.activation } });
        assert.equal((await call('/api/me', live)).status, 401);
        assert.equal((await call('/api/me', validCookie(await signIn()))).status, 200);
      } finally {
        recovery.close();
      }
    } else if (name === 'revoke-fault') {
      await start(true);
      const live = validCookie(await signIn());
      stage = (value) => {
        if (value === 'before-session-commit') throw new Error('synthetic SQLite fault');
      };
      await expectFault(await call('/api/logout', live, 'POST'));
      await expectFault(await call('/api/me', live));
      await assert.rejects(stop(), { code: 'AUTHORITY_FENCED' });
    } else if (name === 'concurrent') {
      await start(true);
      const old = validCookie(await signIn());
      advance = true;
      /** @type {()=>void} */ let mark = () => assert.fail('Barrier not initialized');
      const bothCaptured = new Promise((resolve) => { mark = () => resolve(undefined); });
      let observations = 0;
      stage = (value) => {
        if (value === 'before-clock-write' && ++observations === 2) mark();
      };
      // Both requests are held at body decoding after the verified lease lookup.
      const many = [pendingSignIn(old), pendingSignIn(old)];
      try {
        await within(bothCaptured);
        many.forEach(item => item.finish());
        const observed = (await within(Promise.all(many.map(item => item.result)))).sort((a, b) => a.status - b.status);
        assert.deepEqual(observed, [{ status: 200, cookie: true }, { status: 409, cookie: false }]);
        assert.equal((await call('/api/me', old)).status, 401);
      } finally {
        many.forEach(item => item.destroy());
      }

    } else if (name === 'delivery-revoke' || name === 'delivery-fence') {
      await start(true);
      const live = validCookie(await signIn());
      const pending = holdBeforeDelivery();
      const reply = call('/api/me', live);
      await within(pending.reached);
      if (name === 'delivery-fence') {
        stage = (value) => {
          if (value === 'before-session-commit') throw new Error('synthetic fault');
        };
        await expectFault(await call('/api/logout', live, 'POST'));
      } else {
        assert.equal((await call('/api/logout', live, 'POST')).status, 200);
      }
      pending.release();
      const protectedReply = await reply;
      if (name === 'delivery-fence') {
        await expectFault(protectedReply);
        await assert.rejects(stop(), { code: 'AUTHORITY_FENCED' });
      } else {
        assert.equal(protectedReply.status, 401);
        assert.equal(protectedReply.headers.has('set-cookie'), false);
        assert.deepEqual(await protectedReply.json(), { error: 'Требуется вход.' });
      }
    } else if (name === 'after-authorization') {
      await start(true);
      const live = validCookie(await signIn());
      /** @type {()=>void} */ let queued = () => assert.fail('Barrier not initialized');
      const authorized = new Promise((resolve) => { queued = () => resolve(undefined); });
      stage = (value) => {
        if (value === 'delivery-queued') {
          stage = undefined;
          queued();
        }
      };
      const alreadyAuthorized = call('/api/me', live);
      await within(authorized);
      assert.equal((await call('/api/logout', live, 'POST')).status, 200);
      assert.equal((await alreadyAuthorized).status, 200);
      assert.equal((await call('/api/me', live)).status, 401);
    } else if (name === 'expiry-checkpoint') {
      await start(true);
      const startTime = now;
      const live = validCookie(await signIn());
      const pending = holdBeforeDelivery();
      const reply = call('/api/me', live);
      await within(pending.reached);
      now = startTime + 59_999;
      stage = (value) => {
        if (value === 'before-clock-write') {
          stage = undefined;
          now = startTime + 60_000;
        }
      };
      pending.release();
      assert.equal((await reply).status, 401);
      assert.equal((await control()).last_auth_wall_ms, startTime + 60_000);
    } else if (name === 'g1a-expiry-checkpoint' || name === 'g1a-expiry-fault') {
      const realNow = Date.now;
      let guardNow = now;
      Date.now = () => guardNow;
      try {
        await start(true);
        const startTime = now;
        const live = validCookie(await signIn());
        now += 1;
        let checkpoints = 0;
        stage = (value) => {
          if (value !== 'before-clock-write') return;
          checkpoints += 1;
          if (checkpoints === 1) guardNow = startTime + 60_000;
          else if (checkpoints === 2) {
            now = startTime + 60_000;
            if (name === 'g1a-expiry-fault') throw new Error('synthetic checkpoint failure');
          }
        };
        const response = await call('/api/me', live);
        assert.equal(checkpoints, 2);
        if (name === 'g1a-expiry-fault') {
          await expectFault(response);
          assert.equal((await control()).phase, 'FENCED');
          await assert.rejects(stop(), { code: 'AUTHORITY_FENCED' });
        } else {
          assert.equal(response.status, 401);
          assert.equal((await control()).last_auth_wall_ms, startTime + 60_000);
        }
      } finally {
        Date.now = realNow;
      }
    } else if (name === 'g1a-expiry-after-resolver' || name === 'g1a-expiry-during-close') {
      await start(true);
      const issuedAt = now;
      const live = validCookie(await signIn());
      const realNow = Date.now;
      let checks = 0;
      /** @type {Promise<void>|undefined} */ let shutdown;
      try {
        // Adjust the disposable child's JS clock only at the unchanged G1a check.
        Date.now = () => {
          if (!new Error().stack?.includes('/server/session-context.mjs:')) return realNow();
          checks += 1;
          if (name === 'g1a-expiry-after-resolver' && checks === 2) {
            now = issuedAt + 60_000;
            return now;
          }
          if (name === 'g1a-expiry-during-close' && checks === 1) {
            queueMicrotask(() => {
              // Store time remains below the expiry already observed by G1a.
              shutdown = stop();
              void shutdown.catch(() => {});
            });
            return issuedAt + 60_000;
          }
          return now;
        };
        const req = call('/api/me', live);
        if (name === 'g1a-expiry-after-resolver') {
          assert.equal((await req).status, 401);
          assert.equal(checks, 2);
          assert.equal((await control()).last_auth_wall_ms, issuedAt + 60_000);
        } else {
          const [result] = await within(Promise.allSettled([req]));
          if (result.status === 'fulfilled') assert.notEqual(result.value.status, 200);
          assert.equal(checks, 1);
          assert.ok(shutdown);
          await assert.rejects(within(shutdown), { code: 'AUTHORITY_FENCED' });
          const authority = await control();
          assert.equal(authority.clean_shutdown, 0);
          assert.equal(authority.phase, 'FENCED');
        }
      } finally {
        Date.now = realNow;
      }
      if (name === 'g1a-expiry-during-close') {
        now = issuedAt + 60_001;
        await assert.rejects(start(false), { code: 'AUTHORITY_FENCED' });
      }
    } else if (name === 'shutdown-lookup') {
      await start(true);
      const live = validCookie(await signIn());
      const pending = holdBeforeDelivery();
      const queued = call('/api/me', live);
      void queued.catch(() => {});
      await within(pending.reached);
      const active = pause();
      /** @type {AbortSignal|undefined} */ let resolverSignal;
      resolveBarrier = (signal) => {
        resolveBarrier = undefined;
        resolverSignal = signal;
        return active.wait();
      };
      const lookup = call('/api/me', live);
      void lookup.catch(() => {});
      await within(active.reached);
      let sends = 0;
      stage = (value) => { if (value === 'delivery-queued') sends += 1; };
      await within(stop());
      assert.equal(requireValue(/** @type {AbortSignal|undefined} */ (resolverSignal)).aborted, true);
      const closed = await control();
      assert.equal(closed.clean_shutdown, 1);
      active.release();
      pending.release();
      await within(Promise.allSettled([queued, lookup]));
      assert.equal(sends, 0);
      assert.deepEqual(await control(), closed);
    } else if (name === 'shutdown-commit') {
      await start(true);
      const live = validCookie(await signIn());
      /** @type {Promise<void>|undefined} */ let shutdown;
      let committed = false;
      stage = (value) => {
        if (value === 'prepared' && !shutdown) {
          shutdown = stop();
          void shutdown.catch(() => {});
        }
        if (value === 'stable') committed = true;
      };
      const logout = call('/api/logout', live, 'POST');
      void logout.catch(() => {});
      const [result] = await within(Promise.allSettled([logout]));
      assert.ok(shutdown);
      await within(shutdown);
      if (result.status === 'fulfilled') assert.equal(result.value.status, 503);
      assert.equal(committed, true);
      assert.equal((await control()).committed_seq, 2);
      assert.equal((await control()).clean_shutdown, 1);
      stage = undefined;
      await start(false);
      assert.equal((await call('/api/me', live)).status, 401);
    } else if (name === 'closed-connection') {
      await start(true);
      const live = validCookie(await signIn());
      const pending = holdBeforeDelivery();
      let sends = 0;
      stage = (value) => { if (value === 'delivery-queued') sends += 1; };
      const closed = new Promise((resolve) => requireValue(app).server.once('request', (/** @type {import('node:http').IncomingMessage} */ _, /** @type {import('node:http').ServerResponse} */ res) => res.once('close', resolve)));
      const controller = new AbortController();
      const interrupted = fetch(address + '/api/me', { signal: controller.signal, headers: { cookie: live } });
      void interrupted.catch(() => {});
      await within(pending.reached);
      controller.abort();
      await within(closed);
      pending.release();
      await assert.rejects(interrupted);
      assert.equal((await call('/api/me', live)).status, 200);
      assert.equal(sends, 1);
    } else if (name === 'cp2-shutdown-drain-timeout') {
      const { initializeFresh, openExisting } = await import('../server/session-store.mjs');
      const store = initializeFresh({ ...config, resolveAccount: async (id) => id });
      const entered = pause();
      const pending = store.trackGuard(() => entered.wait());
      try {
        await within(entered.reached);
        await assert.rejects(within(store.close()), { code: 'STORE_UNAVAILABLE' });
        assert.equal((await control()).clean_shutdown, 0);
        assert.equal((await store.lookupOutcome('a'.repeat(64))).kind, 'unavailable');
        let queued = false;
        await assert.rejects(store.deliverCurrent('a'.repeat(64), {}, () => { queued = true; return true; }),
          { code: 'STORE_UNAVAILABLE' });
        assert.equal(queued, false);
        assert.equal(await probeAuthorityLock(controlRoot), 'busy');
      } finally {
        entered.release();
        await pending;
        await new Promise(setImmediate);
      }
      assert.equal(await probeAuthorityLock(controlRoot), 'acquired');
      assert.equal((await control()).clean_shutdown, 0);
      assert.throws(() => openExisting({ ...config, resolveAccount: async (id) => id }),
        { code: 'AUTHORITY_FENCED' });
    } else if (name === 'cp2-static-after-revoke') {
      await start(true);
      const live = validCookie(await signIn());
      const pending = holdBeforeDelivery();
      const result = call('/', live);
      void result.catch(() => {});
      try {
        await within(pending.reached);
        assert.equal((await call('/api/logout', live, 'POST')).status, 200);
      } finally { pending.release(); }
      const reply = await result;
      assert.equal(reply.status, 401);
      assert.equal(reply.headers.has('set-cookie'), false);
      assert.deepEqual(await reply.json(), { error: 'Требуется вход.' });
    } else if (name === 'cp2-login-crash') {
      assert.match(requireValue(crashRun), /^[0-9a-f-]{36}$/);
      await start(true);
      /** @type {import('node:http').ServerResponse|undefined} */ let loginReply;
      requireValue(app).server.on('request', (/** @type {import('node:http').IncomingMessage} */ req, /** @type {import('node:http').ServerResponse} */ response) => {
        if (req.method === 'POST' && req.url === '/api/login') loginReply = response;
      });
      stage = (value) => {
        if (value !== loginCrash) return;
        assert.ok(loginReply);
        writeSync(1, JSON.stringify({ crashRun, value, headersSent: loginReply.headersSent,
          cookieQueued: loginReply.hasHeader('Set-Cookie') }) + '\n');
        process.kill(process.pid, 'SIGKILL');
      };
      await signIn();
      assert.fail('Authorized login crash phase was not reached');
    } else if (name === 'cp2-privacy-and-claims') {
      await start(true);
      const loginResponse = await call('/api/login', null, 'POST', JSON.stringify({
        username: 'synthetic_a', password: fixturePassword,
        accountId: accountB, ownerId: accountB, roles: ['admin'],
      }));
      const cookie = validCookie(loginResponse);
      assert.deepEqual(await loginResponse.json(), { ok: true });
      const me = await call('/api/me', cookie);
      assert.deepEqual(await me.json(), { id: accountA, username: 'synthetic_a' });
      const rawToken = cookie.split('=')[1];
      /** @type {Account[]} */
      const credentials = JSON.parse(await readFile(accountFile, 'utf8'));
      await stop();
      const control = join(controlRoot, 'authority.sqlite');
      const binding = new DatabaseSync(control, { readOnly: true });
      let storeId;
      try { storeId = requireValue(binding.prepare('SELECT store_id FROM authority').get()).store_id; }
      finally { binding.close(); }
      assert.ok(typeof storeId === 'string');
      for (const file of [control, join(sessionRoot, storeId, 'session.sqlite')]) {
        const bytes = await readFile(file);
        for (const secret of [fixturePassword, otherPassword, rawToken, cookie,
          ...credentials.map(row => row.passwordHash)]) assert.equal(bytes.includes(secret), false);
      }
    } else if (name === 'cp2-injected-full' || name === 'cp2-injected-eio') {
      await start(true);
      const live = validCookie(await signIn());
      stage = (value) => {
        if (value === 'before-session-commit') {
          throw Object.assign(new Error('synthetic storage fault'), { errcode: name === 'cp2-injected-full' ? 13 : 10 });
        }
      };
      await expectFault(await call('/api/logout', live, 'POST'));
      await expectFault(await call('/api/me', live));
      assert.equal((await control()).phase, 'FENCED');
      assert.equal((await control()).committed_seq, 1);
      await assert.rejects(stop(), { code: 'AUTHORITY_FENCED' });
    } else if (name === 's06-ordering-and-restart') {
      await start(true);
      const original = await readFile(accountFile);
      const live = validCookie(await signIn());
      const other = validCookie(await signIn(null, 'synthetic_b', otherPassword));
      const pending = holdBeforeDelivery();
      const response = call('/api/me', live);
      void response.catch(() => {});
      try {
        await within(pending.reached);
        await deleteAccount(accountA, operationId);
        assert.equal((await call('/api/me', live)).status, 401);
        assert.equal((await signIn()).status, 401);
      } finally {
        pending.release();
      }
      const denied = await response;
      assert.equal(denied.status, 401);
      assert.equal(denied.headers.has('set-cookie'), false);
      assert.equal(Object.hasOwn(await denied.json(), 'id'), false);
      const beforeReplay = await control();
      await deleteAccount(accountA, operationId);
      assert.equal((await control()).committed_seq, beforeReplay.committed_seq);
      await assert.rejects(deleteAccount(accountB, operationId), { code: 'ROTATION_CONFLICT' });
      await assert.rejects(deleteAccount(accountA, 'd'.repeat(32)), { code: 'ROTATION_CONFLICT' });
      await writeFile(accountFile, original); // Trusted synthetic stale-JSON probe.
      assert.equal((await call('/api/me', live)).status, 401);
      const staleLogin = await signIn();
      assert.notEqual(staleLogin.status, 200);
      assert.equal(staleLogin.headers.has('set-cookie'), false);
      await stop();
      await assert.rejects(start()); // Prevent a second auth authority over the same namespace.
      await start(false);
      assert.equal((await call('/api/me', other)).status, 200);
      assert.equal((await call('/api/me', live)).status, 401);
      assert.notEqual((await signIn()).status, 200);
    } else if (name === 's06-after-authorization') {
      await start(true);
      const live = validCookie(await signIn());
      /** @type {Promise<void>|undefined} */ let deletion;
      stage = (value) => {
        if (value === 'delivery-queued' && !deletion) deletion = deleteAccount(accountA, operationId);
      };
      const allowed = await call('/api/me', live);
      assert.equal(allowed.status, 200);
      assert.equal((await allowed.json()).id, accountA);
      assert.ok(deletion);
      await deletion;
      assert.equal((await call('/api/me', live)).status, 401);
    } else if (name === 's06-login-and-legacy-writer') {
      await start(true);
      const prior = await control();
      const pending = holdBeforeDelivery();
      const response = signIn();
      void response.catch(() => {});
      try {
        await within(pending.reached);
        const [retired, add] = await Promise.allSettled([
          deleteAccount(accountA, operationId),
          addUser('synthetic_c', fixturePassword),
        ]);
        assert.equal(retired.status, 'fulfilled');
        assert.equal(add.status, 'rejected');
        assert.ok(typeof prior.committed_seq === 'number');
        assert.equal((await control()).committed_seq, prior.committed_seq + 2);
      } finally {
        pending.release();
      }
      await expectFault(await response);
    } else if (name === 'cp3-s06-deleted-captured-lease-account-switch') {
      await start(true);
      const old = validCookie(await signIn());
      /** @type {()=>void} */ let capture = () => assert.fail('Barrier not initialized');
      const firstLookup = new Promise(resolve => { capture = () => resolve(undefined); });
      requireValue(app).server.once('request', (/** @type {import('node:http').IncomingMessage} */ req) => {
        assert.equal(req.url, '/api/login');
        // The body iterator is installed only after the durable lookup and
        // initial account snapshot. Keep the rest of the body behind the barrier.
        req.on('newListener', event => {
          if (event === 'readable') capture();
        });
      });
      const competing = pendingSignIn(old, 'synthetic_b', otherPassword);
      try {
        await within(firstLookup);
        await deleteAccount(accountA, operationId);
        const afterDeletion = await control();
        competing.finish();
        const observed = await within(competing.result);
        try { assert.deepEqual(observed, { status: 409, cookie: false }); }
        catch (error) {
          if (!(error instanceof Error)) throw error;
          throw Object.assign(error, { cp2: observed });
        }
        assert.equal((await control()).committed_seq, afterDeletion.committed_seq);
        assert.equal((await call('/api/me', old)).status, 401);
        assert.ok(validCookie(await signIn(null, 'synthetic_b', otherPassword)));
      } finally { competing.destroy(); }
    } else if (name === 's06-during-account-resolver') {
      await start(true);
      const live = validCookie(await signIn());
      const held = pause();
      resolveBarrier = () => {
        resolveBarrier = undefined;
        return held.wait();
      };
      const pending = call('/api/me', live);
      void pending.catch(() => {});
      try {
        await within(held.reached);
        await deleteAccount(accountA, operationId);
      } finally {
        held.release();
      }
      const denied = await pending;
      assert.equal(denied.status, 401);
      assert.equal(Object.hasOwn(await denied.json(), 'id'), false);
    } else if (name === 's06-crash-before-account-file-cleanup') {
      assert.match(requireValue(crashRun), /^[0-9a-f-]{36}$/);
      await start(true);
      const live = validCookie(await signIn());
      assert.equal((await call('/api/me', live)).status, 200);
      stage = (value) => {
        if (value === 'before-account-file-cleanup') {
          writeSync(1, JSON.stringify({ crashRun, value }) + '\n');
          process.kill(process.pid, 'SIGKILL');
        }
      };
      await deleteAccount(accountA, operationId);
      assert.fail('Authorized self-crash phase was not reached');
    } else if (name === 's06-cross-process-writer-aliases') {
      await start(true);
      const original = await readFile(accountFile);
      const external = await mkdtemp('/private/var/tmp/zarya-s06-legacy-');
      const aliasDir = join(external, 'alias');
      const aliasFile = join(external, 'users.json');
      try {
        await symlink(accounts, aliasDir);
        await symlink(accountFile, aliasFile);
        assert.deepEqual(await writerProbe(accounts.replace('/private/var/tmp/', '/var/tmp/')),
          { writer: 'denied', memory: 'denied' });
        assert.deepEqual(await writerProbe('/System/Volumes/Data' + accounts),
          { writer: 'denied', memory: 'denied' });
        assert.deepEqual(await writerProbe(aliasDir), { writer: 'denied', memory: 'denied' });
        assert.deepEqual(await writerProbe(external), { writer: 'denied', memory: 'denied' });
        await unlink(aliasFile);
        await link(accountFile, aliasFile);
        assert.deepEqual(await writerProbe(external), { writer: 'denied', memory: 'denied' });
        assert.deepEqual(await readFile(accountFile), original);
        await unlink(aliasFile);
        await deleteAccount(accountA, operationId);
        assert.deepEqual(await writerProbe(aliasDir), { writer: 'denied', memory: 'denied' });
        assert.equal((await signIn()).status, 401);
      } finally {
        for (const entry of [aliasFile, aliasDir]) {
          try { await unlink(entry); } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
        }
        await rmdir(external);
      }
    } else if (['s06-cleanup-interruption', 's06-prepare-failure', 's06-post-rename-failure'].includes(name)) {
      await start(true);
      const original = await readFile(accountFile);
      const live = validCookie(await signIn());
      stage = (value) => {
        const phase = {
          's06-prepare-failure': 'before-prepare-update',
          's06-cleanup-interruption': 'before-account-file-cleanup',
          's06-post-rename-failure': 'after-account-file-rename',
        }[name];
        if (value === phase) {
          throw new Error('synthetic deletion write fault');
        }
      };
      await assert.rejects(deleteAccount(accountA, operationId));
      await expectFault(await call('/api/me', live));
      if (name === 's06-post-rename-failure') {
        /** @type {Account[]} */
        const afterRename = JSON.parse(await readFile(accountFile, 'utf8'));
        assert.equal(afterRename.some(row => row.id === accountA), false);
      } else {
        assert.deepEqual(await readFile(accountFile), original);
      }
      await assert.rejects(stop(), { code: 'AUTHORITY_FENCED' });
      stage = undefined;
      const maintenance = openOfflineRecovery(config, true);
      const reservation = maintenance.reserveResetId();
      try {
        const reset = maintenance.confirmReset(reservation);
        await start(false, { durableSessions: { activation: reset.activation } });
      } finally { maintenance.close(); }
      assert.equal((await call('/api/me', live)).status, 401);
      if (name !== 's06-prepare-failure') {
        assert.notEqual((await signIn()).status, 200);
        await deleteAccount(accountA, operationId);
        assert.equal((await signIn()).status, 401);
      } else {
        assert.ok(validCookie(await signIn()));
      }
    } else if (name === 'cp2-s06-account-deletion-before-delivery') {
      await start(true);
      const live = validCookie(await signIn());
      const pending = holdBeforeDelivery();
      const response = call('/api/me', live);
      void response.catch(() => {});
      let subsequent;
      try {
        await within(pending.reached);
        const path = join(accounts, 'users.json');
        /** @type {Account[]} */
        const users = JSON.parse(await readFile(path, 'utf8'));
        const remaining = users.filter(({ username }) => username !== 'synthetic_a');
        assert.equal(users.length - remaining.length, 1);
        const sink = await open(path, 'r+');
        try {
          await sink.truncate(0);
          await sink.writeFile(JSON.stringify(remaining));
          await sink.sync();
        } finally {
          await sink.close();
        }
        subsequent = await call('/api/me', live);
        assert.equal(subsequent.status, 401);
      } finally {
        pending.release();
      }
      const completed = await response;
      const body = await completed.json();
      const observed = {
        pausedStatus: completed.status,
        freshLookupStatus: subsequent.status,
        protectedBody: Object.hasOwn(body, 'id') && body.username === 'synthetic_a',
        cookiePresent: completed.headers.has('set-cookie'),
      };
      try {
        assert.ok([401, 403, 503].includes(observed.pausedStatus) && !observed.protectedBody && !observed.cookiePresent);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        throw Object.assign(error, { cp2: observed });
      }
    } else {
      assert.fail('Unknown synthetic bridge scenario');
    }
  } finally {
    await stop();
  }
}

if (process.argv[2] === 'cp2-lock-probe') {
  runLockProbe(process.argv[3]);
} else if (process.argv[2] === 's06-writer-probe') {
  const { addUser } = await import('../server/auth.mjs');
  const { createApp } = await import('../server/index.mjs');
  const writer = await addUser('synthetic_c', fixturePassword).then(() => 'accepted', () => 'denied');
  const memory = await createApp({ origin }).then(async app => { await app.close(); return 'accepted'; }, () => 'denied');
  sendFixture({ writer, memory }, () => disconnectFixture());
} else if (process.argv[2] === 's06-crash-fixture') {
  const [, , , root, crashRun, phase] = process.argv;
  process.once('message', (message) => {
    if (!message || typeof message !== 'object' || !('kind' in message) ||
        !('crashRun' in message) || message.kind !== 'ARM_CRASH' || message.crashRun !== crashRun ||
        ('phase' in message ? message.phase : undefined) !== phase ||
        (phase !== undefined && !['before-prepare-update', 'prepared', 'session-committed', 'stable'].includes(phase))) {
      process.exitCode = 1;
      disconnectFixture();
      return;
    }
    sendFixture({ kind: 'ARMED', crashRun }, error => {
      if (error) {
        process.exitCode = 1;
        disconnectFixture();
        return;
      }
      const name = phase ? 'cp2-login-crash' : 's06-crash-before-account-file-cleanup';
      void fixture(name, root, crashRun, phase).catch(() => {
        process.exitCode = 1;
        if (process.connected) disconnectFixture();
      });
    });
  });
} else if (process.argv[2] === 'fixture') {
  const [, , , name, root] = process.argv;
  fixture(name, root).then(
    () => sendFixture({ case: name, status: 'PASS' }, () => disconnectFixture()),
    (error) => {
      process.exitCode = 1;
      const source = (error instanceof Error ? error.stack : undefined)?.split('\n').find(line => line.includes('project-durable-session-bridge.test.mjs:'));
      // No credentials, cookies, paths from SQLite, or exception values cross IPC.
      const location = /test\.mjs:(\d+):/.exec(source ?? '')?.[1] ?? null;
      sendFixture({ case: name, status: 'FAIL', location, ...(error instanceof Error && 'cp2' in error ? { observation: error.cp2 } : {}) }, () => disconnectFixture());
    },
  );
} else {
  for (const phase of [undefined, 'before-prepare-update', 'prepared', 'session-committed', 'stable']) {
    const title = phase ? 'CP2 S11 actual HTTP login crashes at ' + phase :
      'S06 actual HTTP fixture self-crashes after the fence and before users.json cleanup';
    test(title, { timeout: 12000 }, async (t) => {
      const root = await mkdtemp('/private/var/tmp/zarya-g1b-c1-');
      const crashRun = randomUUID();
      const child = fork(new URL(import.meta.url), ['s06-crash-fixture', root, crashRun, ...(phase ? [phase] : [])], {
        execArgv: [], env: { PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin', TZ: 'UTC' },
        stdio: ['ignore', 'pipe', 'ignore', 'ipc'],
      });
      const exited = once(child, 'exit');
      const closed = once(child, 'close');
      const armed = once(child, 'message');
      for (const observed of [exited, closed, armed]) void observed.catch(() => {});
      let marker = '';
      const stdout = requireValue(child.stdout);
      stdout.setEncoding('utf8');
      stdout.on('data', chunk => { marker += chunk; });
      t.after(async () => {
        try {
          if (child.connected) child.disconnect();
          await within(closed);
        } catch (error) {
          stdout.destroy();
          child.unref();
          throw error;
        }
        await inventory(root);
        await rm(root, { recursive: true });
      });
      await new Promise((resolve, reject) => child.send({ kind: 'ARM_CRASH', crashRun, phase }, error =>
        error ? reject(error) : resolve(undefined)));
      const [armedMessage, transferredHandle] = await within(armed);
      assert.deepEqual(armedMessage, { kind: 'ARMED', crashRun });
      assert.equal(transferredHandle, undefined);
      assert.deepEqual(await within(exited), [null, 'SIGKILL']);
      assert.deepEqual(await within(closed), [null, 'SIGKILL']);
      assert.equal(child.signalCode, 'SIGKILL');
      const observed = JSON.parse(marker);
      const control = new DatabaseSync(join(root, 'recovery-control', 'authority.sqlite'), { readOnly: true });
      try {
        const row = requireValue(control.prepare('SELECT * FROM authority').get());
        assert.equal(row.clean_shutdown, 0);
        if (!phase) {
          assert.deepEqual(observed, { crashRun, value: 'before-account-file-cleanup' });
          /** @type {Account[]} */
          const accounts = JSON.parse(await readFile(join(root, 'accounts', 'users.json'), 'utf8'));
          assert.ok(accounts.some(account => account.id === 'a'.repeat(32)));
          assert.equal(row.phase, 'STABLE');
          assert.deepEqual({ ...control.prepare('SELECT * FROM account_fences').get() },
            { account_id: 'a'.repeat(32), operation_id: 'c'.repeat(32) });
        } else {
          assert.deepEqual(observed, { crashRun, value: phase, headersSent: false, cookieQueued: false });
          assert.equal(row.phase, ['prepared', 'session-committed'].includes(phase) ? 'PREPARED' : 'STABLE');
          assert.equal(row.committed_seq, phase === 'stable' ? 1 : 0);
          assert.ok(typeof row.store_id === 'string');
          const session = new DatabaseSync(join(root, 'session-data', row.store_id, 'session.sqlite'), { readOnly: true });
          try {
            const committed = ['session-committed', 'stable'].includes(phase);
            assert.equal(requireValue(session.prepare('SELECT count(*) AS count FROM sessions').get()).count, committed ? 1 : 0);
            assert.equal(requireValue(session.prepare('SELECT commit_seq FROM session_meta').get()).commit_seq, committed ? 1 : 0);
          } finally { session.close(); }
        }
      } finally { control.close(); }
    });
  }

  for (const name of [
    'lifecycle', 'fencing', 'revoke-fault', 'concurrent', 'delivery-revoke', 'delivery-fence',
    'after-authorization', 'expiry-checkpoint', 'g1a-expiry-checkpoint', 'g1a-expiry-fault',
    'g1a-expiry-after-resolver', 'g1a-expiry-during-close',
    'shutdown-lookup', 'shutdown-commit', 'closed-connection',
    'cp2-shutdown-drain-timeout', 'cp2-s06-account-deletion-before-delivery',
    'cp3-s06-deleted-captured-lease-account-switch', 'cp2-privacy-and-claims', 'cp2-injected-full', 'cp2-injected-eio', 'cp2-static-after-revoke',
    's06-ordering-and-restart', 's06-after-authorization', 's06-login-and-legacy-writer',
    's06-cleanup-interruption', 's06-prepare-failure', 's06-cross-process-writer-aliases', 's06-post-rename-failure', 's06-during-account-resolver',
  ]) {
    test('durable bridge ' + name, { timeout: 12000 }, (t) => scenario(t, name));
  }
}
