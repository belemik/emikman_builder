import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { performance } from 'node:perf_hooks';
import { buildTestInventory } from '../scripts/ci-test-matrix.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const syntheticPassword = 'synthetic-test-password-123';
/** @typedef {{runId:string,stage:string,ok?:boolean,code?:string,phase?:string,count?:number,opens?:number,cleanupFailed?:boolean,causeCodes?:string[]}} Message */
/** @typedef {{code:number|null,signal:NodeJS.Signals|null,timedOut:boolean,spawnError:boolean,result:Message|undefined}} Completion */
/** @typedef {ReturnType<typeof startChild>} Worker */
/** @typedef {{root:string,directory:string,workers:Worker[],start:(operation:string,username?:string)=>Worker}} Fixture */
/** @param {unknown} value @returns {value is Message} */
function messageOf(value) {
  return !!value && typeof value === 'object' && 'runId' in value && typeof value.runId === 'string' &&
    'stage' in value && typeof value.stage === 'string';
}

/** @param {string} directory @param {string} operation @param {string} [username] */
function startChild(directory, operation, username = 'newuser') {
  const runId = randomBytes(16).toString('hex');
  const child = spawn(process.execPath, [scriptPath, '--f01-worker', operation, username], {
    env: { PATH: process.env.PATH, DATA_DIR: directory, ZARYA_TEST_RUN: runId },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  /** @type {Message[]} */ const events = [];
  /** @type {Set<()=>void>} */ const listeners = new Set();
  let closed = false, spawnError = false, timedOut = false;
  /** @type {number|null} */ let code = null;
  /** @type {NodeJS.Signals|null} */ let signal = null;
  let stderr = '';
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-8192); });
  child.on('message', value => {
    if (messageOf(value) && value.runId === runId) { events.push(value); for (const notify of listeners) notify(); }
  });
  child.on('error', () => { spawnError = true; });
  const close = new Promise((resolveClose) => {
    child.once('close', (exitCode, exitSignal) => {
      closed = true; code = exitCode; signal = exitSignal; resolveClose(undefined);
      for (const notify of listeners) notify();
    });
  });
  /** @param {string} command */
  function send(command) {
    if (!closed && child.connected) child.send({ runId, command }, () => {});
  }
  /** @param {number} ms */
  async function closeWithin(ms) {
    /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
    const done = await Promise.race([close.then(() => true), new Promise(resolveTimeout => {
      timer = setTimeout(() => resolveTimeout(false), ms);
    })]);
    clearTimeout(timer);return done;
  }
  /** @param {number} [deadline] @returns {Promise<Completion>} */
  async function finish(deadline = 10_000) {
    if (!await closeWithin(deadline)) {
      timedOut = true;
      // No parent-side signal/PID use. A responsive own child validates its
      // run marker and self-terminates; an unconfirmed stop preserves evidence.
      send('SELF_STOP');
      if (!await closeWithin(2000)) {
        child.unref(); child.channel?.unref(); child.stderr?.destroy();
        throw new Error('Worker termination unconfirmed; preserve fixture.');
      }
    }
    return { code, signal, timedOut, spawnError, result: events.find(value => value.stage === 'RESULT') };
  }
  /** @param {string} stage */
  async function wait(stage) {
    await new Promise((resolveStage, rejectStage) => {
      const timer = setTimeout(() => { listeners.delete(check); rejectStage(new Error('Worker stage timeout: ' + stage)); }, 5000);
      function check() {
        if (events.some(value => value.stage === stage)) { clearTimeout(timer); listeners.delete(check); resolveStage(undefined); }
        else if (closed) { clearTimeout(timer); listeners.delete(check); rejectStage(new Error('Worker closed before stage: ' + stage)); }
      }
      listeners.add(check);check();
    });
  }
  return { child, send, finish, wait, get closed() { return closed; }, diagnostics: () => ({ runId, closed, code, signal, timedOut, spawnError, stderr }) };
}

/** @param {Worker[]} workers */
async function waitSuccessful(workers) {
  const outcomes = await Promise.allSettled(workers.map(worker => worker.finish()));
  if (outcomes.some(outcome => outcome.status !== 'fulfilled' || outcome.value.code !== 0 ||
      outcome.value.signal !== null || outcome.value.timedOut || outcome.value.result?.ok !== true)) {
    throw new Error('Worker group failed after all children settled.');
  }
}

/** @param {string} root */
async function removeKnownFixture(root) {
  const rootInfo = await fs.lstat(root);
  assert.ok(rootInfo.isDirectory() && rootInfo.uid === process.getuid?.() && (rootInfo.mode & 0o7777) === 0o700);
  /** @type {{path:string,ino:number,dev:number,directory:boolean}[]} */ const entries = [];
  /** @param {string} directory @param {string} relative */
  async function inventory(directory, relative) {
    for (const name of await fs.readdir(directory)) {
      const path = join(directory, name), info = await fs.lstat(path);
      assert.equal(info.uid, rootInfo.uid);assert.equal(info.dev, rootInfo.dev);
      if (relative === '') assert.ok(['accounts', 'other', 'alias-accounts', 'diagnostics.json'].includes(name));
      else if (basename(directory) === '.users.json.writer-lock') throw new Error('Unknown lock contents: preserve fixture.');
      else assert.ok(name === 'users.json' || name === 'hardlink.json' || name === '.users.json.writer-lock' || /^\.users-\d+-[0-9a-f]{16}\.tmp$/.test(name));
      assert.ok(info.isDirectory() || info.isFile() || info.isSymbolicLink());
      if (info.isDirectory()) await inventory(path, relative ? relative + '/' + name : name);
      entries.push({ path, ino: info.ino, dev: info.dev, directory: info.isDirectory() });
    }
  }
  await inventory(root, '');
  for (const entry of entries) {
    const current = await fs.lstat(entry.path);assert.equal(current.ino, entry.ino);assert.equal(current.dev, entry.dev);
    if (entry.directory) await fs.rmdir(entry.path);else await fs.unlink(entry.path);
  }
  await fs.rmdir(root);
}

/** @param {(fixture:Fixture)=>Promise<void>} body */
async function withFixture(body) {
  const root = await fs.mkdtemp(join(tmpdir(), 'zarya-f01-f02-'));
  const directory = join(root, 'accounts');await fs.mkdir(directory, { mode: 0o700 });
  // Explicit local preparation of the fixture's directory entries, not a claim
  // of physical power-loss durability or production provisioning.
  for (const path of [directory, root, dirname(root)]) {
    const handle = await fs.open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { await handle.sync(); } finally { await handle.close(); }
  }
  /** @type {Worker[]} */ const workers = [];
  const fixture = { root, directory, workers, start: (/** @type {string} */ operation, /** @type {string} */ username = 'newuser') => {
    const worker = startChild(directory, operation, username);workers.push(worker);return worker;
  } };
  try { await body(fixture); }
  finally {
    await Promise.allSettled(workers.map(worker => worker.finish()));
    if (workers.some(worker => !worker.closed)) {
      await fs.writeFile(join(root, 'diagnostics.json'), JSON.stringify(workers.map(worker => worker.diagnostics())), { mode: 0o600 });
      throw new Error('Unclosed worker: fixture preserved at ' + root);
    }
    await removeKnownFixture(root);
  }
}

/** @param {string} directory */
async function records(directory) { return JSON.parse(await fs.readFile(join(directory, 'users.json'), 'utf8')); }
/** @param {Fixture} fixture */
async function seed(fixture) { await waitSuccessful([fixture.start('add', 'existing')]); }

async function workerMain() {
  const runId = process.env.ZARYA_TEST_RUN, directory = process.env.DATA_DIR;
  assert.ok(runId && /^[0-9a-f]{32}$/.test(runId) && directory);
  assert.ok(basename(dirname(directory)).startsWith('zarya-f01-f02-'));
  /** @param {Omit<Message,'runId'>} value */
  const send = value => { if (process.connected) process.send?.({ runId, ...value }); };
  /** @param {unknown} value */
  function control(value) {
    if (value && typeof value === 'object' && 'runId' in value && value.runId === runId &&
        'command' in value && value.command === 'SELF_STOP') process.kill(process.pid, 'SIGKILL');
  }
  process.on('message', control);
  const watchdog = setTimeout(() => process.kill(process.pid, 'SIGKILL'), 8000);
  /** @param {string} stage */
  async function checkpoint(stage) {
    await new Promise((resolveCommand, rejectCommand) => {
      const timer = setTimeout(() => { process.off('message', receive); rejectCommand(new Error('IPC command timeout')); }, 5000);
      /** @param {unknown} value */
      function receive(value) {
        if (!value || typeof value !== 'object' || !('runId' in value) || value.runId !== runId || !('command' in value)) return;
        if (value.command === 'CRASH') process.kill(process.pid, 'SIGKILL');
        if (value.command === 'CONTINUE') { clearTimeout(timer);process.off('message', receive);resolveCommand(undefined); }
      }
      process.on('message', receive);send({ stage });
    });
  }
  const canonicalDirectory = await fs.realpath(directory).catch(error => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return directory;
    throw error;
  });
  const original = { open: fs.open, rename: fs.rename, rmdir: fs.rmdir, now: Date.now, mono: performance.now };
  const operation = process.argv[3], username = process.argv[4];
  let published = false, opens = 0;
  /** @returns {Error} */ const injected = () => Object.assign(new Error('Synthetic I/O fault'), { code: 'EIO' });
  try {
    if (operation === 'busy-clock') {
      let ticks = 0;performance.now = () => ticks++ * 15_000;
      Date.now = () => -999_999_999;
    }
    fs.open = /** @type {typeof fs.open} */ (async (...args) => {
      const path = String(args[0]);
      if (published && operation === 'fault-directory-open' && path === canonicalDirectory) throw injected();
      const handle = await original.open(...args);
      if (path === join(canonicalDirectory, 'users.json') && operation === 'reader-race') {
        opens++;
        if (opens === 1) {
          const stat = handle.stat.bind(handle);
          handle.stat = /** @type {typeof handle.stat} */ (async (...statArgs) => { await checkpoint('READER_OPEN');return stat(...statArgs); });
        }
      }
      if (path.includes('/.users-') && ['fault-before-write', 'fault-write-and-close'].includes(operation)) {
        handle.writeFile = async () => { throw Object.assign(new Error('Synthetic write fault'), { code: 'WRITE_INJECTED' }); };
        if (operation === 'fault-write-and-close') {
          const close = handle.close.bind(handle);handle.close = async () => { await close();throw Object.assign(new Error('Synthetic close fault'), { code: 'CLOSE_INJECTED' }); };
        }
      }
      if (published && path === canonicalDirectory) {
        if (operation === 'fault-directory-sync') handle.sync = async () => { throw injected(); };
        if (operation === 'fault-directory-close') {
          const close = handle.close.bind(handle);handle.close = async () => { await close();throw injected(); };
        }
      }
      return handle;
    });
    fs.rename = async (oldPath, newPath) => {
      if (operation === 'crash-before-rename') await checkpoint('BEFORE_RENAME');
      if (operation === 'fault-rename-before') throw injected();
      await original.rename(oldPath, newPath);published = true;
      if (operation === 'fault-rename-result') throw injected();
      if (operation === 'crash-after-rename') await checkpoint('AFTER_RENAME');
    };
    fs.rmdir = /** @type {typeof fs.rmdir} */ (async (...args) => {
      if (published && operation === 'fault-lock-release') throw injected();
      return original.rmdir(...args);
    });
    syncBuiltinESMExports();
    const auth = await import('../server/auth.mjs');
    if (operation === 'hold') { await checkpoint('HOLD');send({ stage: 'RESULT', ok: true }); }
    else if (operation === 'fail') { send({ stage: 'RESULT', ok: false, code: 'SYNTHETIC_FAILURE' });process.exitCode = 1; }
    else if (operation === 'read' || operation === 'reader-race') {
      const list = await auth.users();send({ stage: 'RESULT', ok: true, count: list.length, opens });
    } else {
      await auth.addUser(username, syntheticPassword);send({ stage: 'RESULT', ok: true });
    }
  } catch (error) {
    const detail = error && typeof error === 'object' ? error : {};
    send({ stage: 'RESULT', ok: false, code: 'code' in detail ? String(detail.code) : 'UNCLASSIFIED',
      phase: 'phase' in detail ? String(detail.phase) : undefined,
      cleanupFailed: 'cleanupFailed' in detail ? Boolean(detail.cleanupFailed) : undefined,
      causeCodes: detail instanceof Error && detail.cause instanceof AggregateError
        ? detail.cause.errors.map(cause => cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : 'UNCLASSIFIED') : undefined });process.exitCode = 1;
  } finally {
    fs.open = original.open;fs.rename = original.rename;fs.rmdir = original.rmdir;
    Date.now = original.now;performance.now = original.mono;syncBuiltinESMExports();
    clearTimeout(watchdog);process.off('message', control);if (process.connected) process.disconnect();
  }
}

if (process.argv[2] === '--f01-worker') {
  await workerMain();
} else {
  test('F01 concurrent additions preserve the pre-existing account and all six new accounts', () => withFixture(async fixture => {
    await seed(fixture);const initial = (await records(fixture.directory))[0];
    await waitSuccessful(Array.from({ length: 6 }, (_, i) => fixture.start('add', 'parallel_' + i)));
    const list = await records(fixture.directory);assert.equal(list.length, 7);
    assert.equal(new Set(list.map((/** @type {{username:string}} */ user) => user.username)).size, 7);
    assert.equal(new Set(list.map((/** @type {{id:string}} */ user) => user.id)).size, 7);
    assert.deepEqual(list.find((/** @type {{username:string}} */ user) => user.username === 'existing'), initial);
  }));
  test('F01 duplicate competition reports exactly ACCOUNT_DUPLICATE for both losers', () => withFixture(async fixture => {
    const outcomes = await Promise.all(Array.from({ length: 3 }, () => fixture.start('add', 'duplicate').finish()));
    assert.equal(outcomes.filter(value => value.result?.ok).length, 1);
    for (const value of outcomes.filter(value => !value.result?.ok)) { assert.equal(value.code, 1);assert.equal(value.result?.code, 'ACCOUNT_DUPLICATE');assert.equal(value.result?.phase, 'NOT_PUBLISHED'); }
    const list = await records(fixture.directory);assert.equal(list.length, 1);assert.equal(list[0].username, 'duplicate');
  }));
  test('F01 reader reopens confirmed atomic replacement after open/before fstat barrier', () => withFixture(async fixture => {
    await seed(fixture);const reader = fixture.start('reader-race');await reader.wait('READER_OPEN');
    await waitSuccessful([fixture.start('add', 'after_open')]);reader.send('CONTINUE');
    const result = await reader.finish();assert.equal(result.code, 0);assert.equal(result.result?.count, 2);assert.equal(result.result?.opens, 2);
  }));
  test('F01 actual hardlink is denied by both users and addUser', () => withFixture(async fixture => {
    await seed(fixture);const original = await fs.readFile(join(fixture.directory, 'users.json'));
    await fs.link(join(fixture.directory, 'users.json'), join(fixture.directory, 'hardlink.json'));
    assert.equal((await fixture.start('read').finish()).result?.ok, false);
    assert.equal((await fixture.start('add').finish()).result?.phase, 'NOT_PUBLISHED');
    assert.deepEqual(await fs.readFile(join(fixture.directory, 'users.json')), original);
  }));
  test('F01 dangling users symlink is denied without creating its target', () => withFixture(async fixture => {
    await fs.symlink(join(fixture.root, 'other', 'users.json'), join(fixture.directory, 'users.json'));
    assert.equal((await fixture.start('add').finish()).result?.phase, 'NOT_PUBLISHED');
    assert.ok((await fs.lstat(join(fixture.directory, 'users.json'))).isSymbolicLink());
    await assert.rejects(fs.lstat(join(fixture.root, 'other')), { code: 'ENOENT' });
  }));
  test('F01 canonical DATA_DIR alias shares the same cross-process lock', () => withFixture(async fixture => {
    const alias = join(fixture.root, 'alias-accounts');await fs.symlink(fixture.directory, alias);
    const alternate = startChild(alias, 'add', 'through_alias');fixture.workers.push(alternate);
    await waitSuccessful([alternate, fixture.start('add', 'direct_path')]);assert.equal((await records(fixture.directory)).length, 2);
  }));
  test('F01 failure before publication keeps old data and releases its lock', () => withFixture(async fixture => {
    await seed(fixture);const old = await fs.readFile(join(fixture.directory, 'users.json'));
    const result = await fixture.start('fault-before-write').finish();assert.equal(result.result?.phase, 'NOT_PUBLISHED');
    assert.deepEqual(await fs.readFile(join(fixture.directory, 'users.json')), old);
    await assert.rejects(fs.lstat(join(fixture.directory, '.users.json.writer-lock')), { code: 'ENOENT' });
    await waitSuccessful([fixture.start('add', 'later')]);
  }));
  for (const [operation, phase] of [['fault-rename-result', 'PUBLISHED_UNCONFIRMED'], ['fault-directory-open', 'PUBLISHED_UNCONFIRMED'], ['fault-directory-sync', 'PUBLISHED_UNCONFIRMED'],
    ['fault-directory-close', 'COMMITTED_CLEANUP_FAILED'], ['fault-lock-release', 'COMMITTED_CLEANUP_FAILED']]) {
    test('F01 ' + operation + ' reports ' + phase + ' without rollback or replay', () => withFixture(async fixture => {
      await seed(fixture);const result = await fixture.start(operation).finish();
      assert.equal(result.code, 1);assert.equal(result.result?.ok, false);assert.equal(result.result?.phase, phase);
      const list = await records(fixture.directory);assert.equal(list.length, 2);assert.equal(list.filter((/** @type {{username:string}} */ user) => user.username === 'newuser').length, 1);
      const lock = await fs.lstat(join(fixture.directory, '.users.json.writer-lock'));assert.ok(lock.isDirectory());
      const retry = await fixture.start('busy-clock').finish();assert.equal(retry.result?.code, 'ACCOUNT_WRITER_BUSY');
      assert.equal((await records(fixture.directory)).length, 2);assert.equal((await fs.lstat(join(fixture.directory, '.users.json.writer-lock'))).ino, lock.ino);
    }));
  }
  test('F01 failed rename acknowledgement remains uncertain even when no publication is observed', () => withFixture(async fixture => {
    await seed(fixture);const old = await fs.readFile(join(fixture.directory, 'users.json'));
    const result = await fixture.start('fault-rename-before').finish();assert.equal(result.result?.phase, 'PUBLISHED_UNCONFIRMED');
    assert.deepEqual(await fs.readFile(join(fixture.directory, 'users.json')), old);
    assert.ok((await fs.lstat(join(fixture.directory, '.users.json.writer-lock'))).isDirectory());
    assert.equal((await fixture.start('busy-clock').finish()).result?.code, 'ACCOUNT_WRITER_BUSY');
  }));
  test('F01 primary write failure and secondary close failure retain their order and lock', () => withFixture(async fixture => {
    await seed(fixture);const old = await fs.readFile(join(fixture.directory, 'users.json'));
    const result = await fixture.start('fault-write-and-close').finish();assert.equal(result.result?.phase, 'NOT_PUBLISHED');
    assert.equal(result.result?.cleanupFailed, true);assert.deepEqual(result.result?.causeCodes, ['WRITE_INJECTED', 'CLOSE_INJECTED']);
    assert.deepEqual(await fs.readFile(join(fixture.directory, 'users.json')), old);assert.ok((await fs.lstat(join(fixture.directory, '.users.json.writer-lock'))).isDirectory());
  }));
  for (const [operation, stage, count] of [['crash-before-rename', 'BEFORE_RENAME', 1], ['crash-after-rename', 'AFTER_RENAME', 2]]) {
    test('F01 self-crash ' + operation + ' retains lock and complete JSON', () => withFixture(async fixture => {
      await seed(fixture);const writer = fixture.start(String(operation));await writer.wait(String(stage));writer.send('CRASH');
      const result = await writer.finish();assert.equal(result.signal, 'SIGKILL');assert.equal(result.code, null);assert.equal(result.result, undefined);
      assert.equal((await records(fixture.directory)).length, count);assert.ok((await fs.lstat(join(fixture.directory, '.users.json.writer-lock'))).isDirectory());
      assert.equal((await fixture.start('busy-clock').finish()).result?.code, 'ACCOUNT_WRITER_BUSY');
    }));
  }
  test('F01 stale lock is not reclaimed and wall-clock changes do not extend monotonic timeout', () => withFixture(async fixture => {
    await fs.mkdir(join(fixture.directory, '.users.json.writer-lock'), { mode: 0o700 });
    const lock = await fs.lstat(join(fixture.directory, '.users.json.writer-lock'));
    const result = await fixture.start('busy-clock').finish();assert.equal(result.result?.code, 'ACCOUNT_WRITER_BUSY');assert.equal(result.result?.phase, 'NOT_PUBLISHED');
    assert.equal((await fs.lstat(join(fixture.directory, '.users.json.writer-lock'))).ino, lock.ino);
    await assert.rejects(fs.lstat(join(fixture.directory, 'users.json')), { code: 'ENOENT' });
  }));
  test('F01 failed worker does not release the group or cleanup while another worker is held', () => withFixture(async fixture => {
    const delayed = fixture.start('hold');await delayed.wait('HOLD');const failed = fixture.start('fail');
    let settled = false;const joined = waitSuccessful([failed, delayed]);void joined.then(() => { settled = true; }, () => { settled = true; });
    assert.equal((await failed.finish()).code, 1);assert.equal(delayed.closed, false);assert.equal(settled, false);
    assert.ok((await fs.lstat(fixture.root)).isDirectory());delayed.send('CONTINUE');await assert.rejects(joined, /group failed/);assert.ok(delayed.closed);
  }));
  test('F01 timeout requests own-child self-stop and is never reported as successful completion', () => withFixture(async fixture => {
    const delayed = fixture.start('hold');await delayed.wait('HOLD');const result = await delayed.finish(30);
    assert.equal(result.timedOut, true);assert.equal(result.signal, 'SIGKILL');assert.equal(result.result, undefined);assert.ok(delayed.closed);
    assert.ok((await fs.lstat(fixture.root)).isDirectory());
  }));
  test('F01 missing DATA_DIR is refused without provisioning while missing-store reads stay empty', () => withFixture(async fixture => {
    await fs.rmdir(fixture.directory);assert.equal((await fixture.start('add').finish()).result?.phase, 'NOT_PUBLISHED');
    assert.equal((await fixture.start('read').finish()).result?.count, 0);await assert.rejects(fs.lstat(fixture.directory), { code: 'ENOENT' });
  }));
  test('F01 nonprivate DATA_DIR is refused without creating users or lock', () => withFixture(async fixture => {
    await fs.chmod(fixture.directory, 0o755);
    try { assert.equal((await fixture.start('add').finish()).result?.phase, 'NOT_PUBLISHED');assert.deepEqual(await fs.readdir(fixture.directory), []); }
    finally { await fs.chmod(fixture.directory, 0o700); }
  }));
  const inventoryFiles = ['one.test.ts', 'portable.test.mjs', 'durable.test.mjs'];
  const options = { g1bOnly: ['durable.test.mjs'], qualified: ['durable.test.mjs'] };
  test('F02 pure inventory is immutable and all exclusions are qualified', () => {
    const result = buildTestInventory(inventoryFiles, options);assert.deepEqual(result.portableNode, ['portable.test.mjs']);
    assert.deepEqual(result.qualified, ['durable.test.mjs']);assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.qualified));
    assert.deepEqual(inventoryFiles, ['one.test.ts', 'portable.test.mjs', 'durable.test.mjs']);
  });
  test('F02 exclusion absent from qualified is rejected', () => assert.throws(() => buildTestInventory(inventoryFiles, { ...options, qualified: ['portable.test.mjs'] }), /qualified/i));
  test('F02 duplicate exclusion is rejected', () => assert.throws(() => buildTestInventory(inventoryFiles, { ...options, g1bOnly: ['durable.test.mjs', 'durable.test.mjs'] }), /duplicate/i));
  test('F02 duplicate qualified is rejected', () => assert.throws(() => buildTestInventory(inventoryFiles, { ...options, qualified: ['durable.test.mjs', 'durable.test.mjs'] }), /duplicate/i));
  test('F02 duplicate discovered path is rejected', () => assert.throws(() => buildTestInventory([...inventoryFiles, 'one.test.ts'], options), /duplicate/i));
  test('F02 missing required test is rejected', () => assert.throws(() => buildTestInventory(inventoryFiles.slice(0, 2), options), /missing/i));
  test('F02 missing TypeScript suite is rejected', () => assert.throws(() => buildTestInventory(inventoryFiles.slice(1), options), /TypeScript/i));
  test('F02 empty portable suite is rejected', () => assert.throws(() => buildTestInventory(['one.test.ts', 'durable.test.mjs'], options), /portable/i));
  test('F02 path traversal in inventory is rejected', () => assert.throws(() => buildTestInventory(inventoryFiles, { ...options, qualified: ['../durable.test.mjs'] }), /invalid/i));
}
