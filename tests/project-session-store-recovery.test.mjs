import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { openOfflineRecovery, syntheticSessionHooks } from '../server/session-recovery-authority.mjs';
import { initializeFresh, openExisting } from '../server/session-store.mjs';
import { accountA, accountB, crashPhases, digestFor, fixture, login, requireValue } from './fixtures/session-store-worker.mjs';

const workerPath = new URL('./fixtures/session-store-worker.mjs', import.meta.url);

/** @template T @param {Promise<T>} promise */
async function bounded(promise) {
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
  try {
    return await Promise.race([promise, /** @type {Promise<never>} */ (new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Unconfirmed worker lifecycle. Preserve fixture.')), 3000);
    }))]);
  } finally {
    clearTimeout(timer);
  }
}

/** @param {string} path @param {string} sql */
function readRow(path, sql) {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return requireValue(db.prepare(sql).get()); } finally { db.close(); }
}

/** @param {ReturnType<typeof fixture>} options @param {'fresh'|'existing'|'offline'} mode */
function startChild(options, mode) {
  const runId = randomUUID();
  const child = fork(workerPath, [options.runtimeRoot, options.sessionRoot, options.controlRoot, runId, mode], {
    execArgv: [],
    stdio: ['ignore', 'pipe', 'ignore', 'ipc'],
  });
  const exited = once(child, 'exit');
  const closed = once(child, 'close');
  // Register rejection observers at fork time. Waiters still see the original failure.
  void exited.catch(() => {});
  void closed.catch(() => {});
  /** @type {Array<{runId:string,kind:string,resetId?:string}>} */
  const events = [];
  let output = '';
  const stdout = child.stdout;
  assert.ok(stdout);
  stdout.setEncoding('utf8');
  stdout.on('data', (chunk) => { output += chunk; });
  child.on('message', message => {
    if (message && typeof message === 'object' && 'runId' in message && 'kind' in message &&
        typeof message.runId === 'string' && typeof message.kind === 'string' &&
        (!('resetId' in message) || typeof message.resetId === 'string') &&
        Object.keys(message).length === ('resetId' in message ? 3 : 2)) {
      const resetId = 'resetId' in message ? message.resetId : undefined;
      events.push({ runId: message.runId, kind: message.kind,
        ...(typeof resetId === 'string' ? { resetId } : {}) });
    } else events.push({ runId: '', kind: 'invalid' });
  });
  options.onCleanup(async () => {
    try {
      if (child.connected) child.disconnect();
      await bounded(closed);
    } catch (error) {
      // Do not keep the runner alive on an unconfirmed child. Throwing also stops
      // fixture cleanup. Never attempt to signal an uncertain PID from the parent.
      stdout.destroy();
      child.unref();
      throw error;
    }
  });
  /** @param {string} kind @returns {Promise<{runId:string,kind:string,resetId?:string}>} */
  async function expect(kind) {
    const deadline = AbortSignal.timeout(3000);
    while (!events.length) await once(child, 'message', { signal: deadline });
    const event = requireValue(events.shift());
    if (kind !== 'RESET_RESERVED') assert.deepEqual(event, { runId, kind });
    else {
      assert.match(requireValue(event.resetId), /^[0-9a-f]{32}$/);
      assert.deepEqual(event, { runId, kind, resetId: event.resetId });
    }
    return event;
  }
  /** @param {string} kind @param {string} [stage] */
  function send(kind, stage) {
    return new Promise((resolve, reject) => {
      child.send({ runId, kind, stage }, (error) => error ? reject(error) : resolve(undefined));
    });
  }
  return { expect, send, async confirmCrash(/** @type {string|undefined} */ stage = undefined) {
    assert.deepEqual(await bounded(exited), [null, 'SIGKILL']);
    assert.deepEqual(await bounded(closed), [null, 'SIGKILL']);
    assert.equal(child.signalCode, 'SIGKILL');
    if (stage) assert.deepEqual(JSON.parse(output.trim()), { runId, stage });
  } };
}

test('a second writer is denied and a dirty child exit requires offline recovery', { timeout: 7000 }, async (t) => {
  const options = fixture(t);
  const running = startChild(options, 'fresh');
  await running.expect('READY');
  assert.throws(() => openExisting(options), { code: 'STORE_UNAVAILABLE' });
  assert.throws(() => openOfflineRecovery(options, true), { code: 'STORE_UNAVAILABLE' });
  await running.send('CRASH');
  await running.expect('CRASH_ACCEPTED');
  await running.confirmCrash();
  assert.throws(() => openExisting(options), { code: 'AUTHORITY_FENCED' });

  const maintenance = openOfflineRecovery(options, true);
  try {
    const resetId = maintenance.reserveResetId();
    const reset = maintenance.confirmReset(resetId);
    assert.deepEqual(maintenance.confirmReset(resetId), { completed: true });
    const recovered = openExisting(options, requireValue(reset.activation));
    try {
      assert.ok(recovered.readiness());
      assert.throws(() => openExisting(options, requireValue(reset.activation)), { code: 'AUTHORITY_FENCED' });
    } finally {
      await recovered.close();
    }
  } finally {
    maintenance.close();
  }
});

test('a session-only rollback cannot revive a revoked lease', async (t) => {
  let now = 1_000_000;
  const options = fixture(t, { wallClock: () => now });
  let store = initializeFresh(options);
  await login(store, 1);
  await store.close();
  const [storeId] = readdirSync(options.sessionRoot);
  const db = join(options.sessionRoot, storeId, 'session.sqlite');
  const snapshot = join(options.runtimeRoot, 'old.sqlite');
  copyFileSync(db, snapshot);
  store = openExisting(options);
  now += 1;
  await store.revokeCurrent(digestFor(1));
  await store.close();
  copyFileSync(snapshot, db);
  assert.throws(() => openExisting(options), { code: 'AUTHORITY_FENCED' });
});

for (const [index, stage] of crashPhases.entries()) {
  test('interrupted mutation at ' + stage + ' has the expected durable phase', { timeout: 9000 }, async (t) => {
    const options = fixture(t);
    const running = startChild(options, 'fresh');
    await running.expect('READY');
    await running.send('ARM_CRASH', stage);
    await running.expect('ARMED');
    await running.send('MUTATE');
    await running.confirmCrash(stage);

    const control = readRow(join(options.controlRoot, 'authority.sqlite'), 'SELECT * FROM authority');
    assert.ok(typeof control.store_id === 'string');
    const sessionFile = join(options.sessionRoot, control.store_id, 'session.sqlite');
    const session = readRow(sessionFile, 'SELECT * FROM session_meta');
    assert.equal(control.clean_shutdown, 0);
    assert.equal(control.phase, index === 1 || index === 2 ? 'PREPARED' : 'STABLE');
    assert.equal(control.committed_seq, index === 3 ? 1 : 0);
    assert.equal(session.commit_seq, index >= 2 ? 1 : 0);
    assert.equal(readRow(sessionFile, 'SELECT count(*) AS n FROM sessions').n, index >= 2 ? 1 : 0);
    if (index === 2) assert.equal(control.pending_op_id, session.last_op_id);
    if (index === 3) assert.equal(control.committed_op_id, session.last_op_id);
    assert.throws(() => openExisting(options), { code: 'AUTHORITY_FENCED' });
  });
}

test('interrupted reset resumes only the original target and does not replay a receipt', async (t) => {
  const options = fixture(t, {
    [syntheticSessionHooks]: { onStage(stage) {
      if (stage === 'before-reset-publish') throw new Error('synthetic interruption');
    } },
  });
  const child = startChild(options, 'fresh');
  await child.expect('READY');
  await child.send('CRASH');
  await child.expect('CRASH_ACCEPTED');
  await child.confirmCrash();
  const controlPath = join(options.controlRoot, 'authority.sqlite');
  const maintenance = openOfflineRecovery(options, true);
  /** @type {string} */ let resetId;
  try {
    resetId = maintenance.reserveResetId();
    assert.throws(() => maintenance.confirmReset(resetId), { code: 'STORE_UNAVAILABLE' });
    const pending = readRow(controlPath, 'SELECT * FROM authority');
    assert.equal(pending.phase, 'RESETTING');
    assert.equal(pending.reset_op_id, resetId);
  } finally {
    maintenance.close();
  }
  const pending = readRow(controlPath, 'SELECT * FROM authority');
  const resume = { ...options, [syntheticSessionHooks]: undefined };
  assert.throws(() => openExisting(resume), { code: 'AUTHORITY_FENCED' });
  const continued = openOfflineRecovery(resume, true);
  try {
    assert.throws(() => continued.confirmReset('0'.repeat(32)), { code: 'AUTHORITY_FENCED' });
    const completed = continued.confirmReset(resetId);
    const after = readRow(controlPath, 'SELECT * FROM authority');
    assert.equal(after.store_id, pending.reset_store_id);
    assert.equal(after.generation, pending.reset_generation);
    assert.deepEqual(continued.confirmReset(resetId), { completed: true });
    const store = openExisting(resume, requireValue(completed.activation));
    await store.close();
  } finally {
    continued.close();
  }
});

for (const damaged of ['missing', 'corrupt']) {
  test(damaged + ' authority stays unavailable without reconstruction', async (t) => {
    const options = fixture(t);
    await initializeFresh(options).close();
    const path = join(options.controlRoot, 'authority.sqlite');
    const corrupt = Buffer.from('synthetic corrupt authority');
    if (damaged === 'missing') unlinkSync(path);
    else writeFileSync(path, corrupt);
    const closed = (/** @type {{code:string}} */ error) => ['STORE_UNAVAILABLE', 'STORE_SCHEMA_UNSUPPORTED'].includes(error.code);
    assert.throws(() => openExisting(options), closed);
    assert.throws(() => openOfflineRecovery(options, true), closed);
    if (damaged === 'missing') assert.equal(existsSync(path), false);
    else assert.deepEqual(readFileSync(path), corrupt);
  });
}

for (const stage of ['prepared', 'session-committed', 'stable']) {
  test('S06 deletion survives an IPC-authorized crash at ' + stage + ' and explicit reset', { timeout: 9000 }, async (t) => {
    const options = fixture(t);
    const original = initializeFresh(options);
    await login(original, 1);
    await original.close();
    const child = startChild(options, 'existing');
    await child.expect('READY');
    await child.send('ARM_CRASH', stage);
    await child.expect('ARMED');
    await child.send('DELETE');
    await child.confirmCrash(stage);
    assert.throws(() => openExisting(options), { code: 'AUTHORITY_FENCED' });
    const control = join(options.controlRoot, 'authority.sqlite');
    assert.deepEqual({ ...readRow(control, 'SELECT * FROM account_fences') },
      { account_id: accountA, operation_id: accountB });
    const maintenance = openOfflineRecovery(options, true);
    try {
      const reset = maintenance.confirmReset(maintenance.reserveResetId());
      const recovered = openExisting(options, requireValue(reset.activation));
      try {
        assert.equal(await recovered.lookupCurrent(digestFor(1)), null);
        await assert.rejects(login(recovered, 2), { code: 'SESSION_INVALID' });
        await recovered.deleteAccount(accountA, accountB, () => assert.fail('Exact receipt must be recognized'), () => {});
        await login(recovered, 3, accountB);
        assert.ok(await recovered.lookupCurrent(digestFor(3)));
      } finally { await recovered.close(); }
    } finally { maintenance.close(); }
  });
}

for (const resetFirst of [false, true]) {
  test('S06 rejects a control-only restore ' + (resetFirst ? 'across reset' : 'at a stale sequence'), async (t) => {
    const options = fixture(t);
    const control = join(options.controlRoot, 'authority.sqlite');
    const backup = join(options.runtimeRoot, 'old.sqlite');
    let store = initializeFresh(options);
    await login(store, 1);
    await store.close();
    copyFileSync(control, backup);
    store = openExisting(options);
    await store.deleteAccount(accountA, accountB, () => true, () => {});
    await store.close();
    if (resetFirst) {
      const raw = new DatabaseSync(control);
      try { raw.exec("UPDATE authority SET phase='FENCED', clean_shutdown=0"); } finally { raw.close(); }
      const maintenance = openOfflineRecovery(options, true);
      try {
        const reset = maintenance.confirmReset(maintenance.reserveResetId());
        const recovered = openExisting(options, requireValue(reset.activation));
        await assert.rejects(login(recovered, 2), { code: 'SESSION_INVALID' });
        await recovered.close();
      } finally { maintenance.close(); }
    }
    copyFileSync(backup, control);
    assert.throws(() => openExisting(options), { code: 'AUTHORITY_FENCED' });
    assert.throws(() => openOfflineRecovery(options, true), { code: 'AUTHORITY_FENCED' });
  });
}

test('explicit reset retains a certified corrupt store and fences across activation and repeated reset', async (t) => {
  const options = fixture(t);
  const control = join(options.controlRoot, 'authority.sqlite');
  let store = initializeFresh(options);
  await login(store, 1);
  await store.deleteAccount(accountA, accountB, () => true, () => {});
  await store.close();
  const initial = readRow(control, 'SELECT * FROM authority');
  assert.ok(typeof initial.store_id === 'string');
  const oldPath = join(options.sessionRoot, initial.store_id, 'session.sqlite');
  const corrupt = Buffer.from('synthetic corrupt old session');
  writeFileSync(oldPath, corrupt);
  assert.throws(() => openExisting(options));
  /** @type {string|undefined} */ let firstResetId;
  for (let expected = 2; expected <= 3; expected++) {
    const maintenance = openOfflineRecovery(options, true);
    try {
      const id = maintenance.reserveResetId();
      const reset = maintenance.confirmReset(id);
      assert.deepEqual(maintenance.confirmReset(id), { completed: true });
      if (expected === 2) firstResetId = id;
      else assert.throws(() => maintenance.confirmReset(requireValue(firstResetId)), { code: 'AUTHORITY_FENCED' });
      assert.equal(readRow(control, 'SELECT generation FROM authority').generation, expected);
      assert.deepEqual({ ...readRow(control, 'SELECT store_id, witness_state FROM retired_session_stores WHERE generation=1') },
        { store_id: initial.store_id, witness_state: 'corrupt' });
      store = openExisting(options, requireValue(reset.activation));
      assert.equal(await store.lookupCurrent(digestFor(1)), null);
      await assert.rejects(login(store, 2), { code: 'SESSION_INVALID' });
      await login(store, 3, accountB);
      await store.close();
    } finally { maintenance.close(); }
    store = openExisting(options);
    assert.ok(await store.lookupCurrent(digestFor(3)));
    await store.close();
    assert.deepEqual(readFileSync(oldPath), corrupt);
    if (expected === 2) {
      const db = new DatabaseSync(control);
      try { db.exec("UPDATE authority SET phase='FENCED', clean_shutdown=0"); } finally { db.close(); }
    }
  }
});

for (const phase of ['before-reset-publish', 'after-reset-publish']) {
  test('retirement ledger and binding survive authorized crash ' + phase, { timeout: 9000 }, async (t) => {
    const options = fixture(t);
    const control = join(options.controlRoot, 'authority.sqlite');
    const fresh = initializeFresh(options);
    await login(fresh, 1);
    await fresh.deleteAccount(accountA, accountB, () => true, () => {});
    await fresh.close();
    const old = readRow(control, 'SELECT * FROM authority');
    assert.ok(typeof old.store_id === 'string');
    writeFileSync(join(options.sessionRoot, old.store_id, 'session.sqlite'), 'synthetic corrupt old session');
    assert.throws(() => openExisting(options));
    const worker = startChild(options, 'offline');
    await worker.expect('READY');
    await worker.send('ARM_RESET', phase);
    const resetId = requireValue((await worker.expect('RESET_RESERVED')).resetId);
    assert.throws(() => openOfflineRecovery(options, true), { code: 'STORE_UNAVAILABLE' });
    await worker.send('CONFIRM_RESET', resetId);
    await worker.confirmCrash(phase);
    const before = phase === 'before-reset-publish';
    const afterCrash = readRow(control, 'SELECT * FROM authority');
    assert.equal(afterCrash.phase, before ? 'RESETTING' : 'STABLE');
    assert.equal(afterCrash.generation, before ? 1 : 2);
    assert.equal(readRow(control, 'SELECT count(*) AS total FROM retired_session_stores').total, before ? 0 : 1);
    assert.throws(() => openExisting(options), { code: 'AUTHORITY_FENCED' });
    const maintenance = openOfflineRecovery(options, true);
    try {
      const result = maintenance.confirmReset(resetId);
      assert.equal(result.completed, true);
      if (before) {
        const store = openExisting(options, requireValue(result.activation));
        await assert.rejects(login(store, 2), { code: 'SESSION_INVALID' });
        await store.close();
      } else {
        assert.deepEqual(result, { completed: true });
        assert.equal(readRow(control, 'SELECT generation FROM authority').generation, 2);
      }
    } finally { maintenance.close(); }
  });
}

for (const kind of ['empty', 'corrupt', 'mismatched SQLite']) {
  test('unrecognized session directory blocks start and reset: ' + kind, async (t) => {
    const options = fixture(t);
    const initial = initializeFresh(options);
    await initial.close();
    const control = join(options.controlRoot, 'authority.sqlite');
    const old = readRow(control, 'SELECT * FROM authority');
    assert.ok(typeof old.store_id === 'string');
    const unknown = join(options.sessionRoot, 'd'.repeat(32));
    mkdirSync(unknown, { mode: 0o700 });
    const target = join(unknown, 'session.sqlite');
    if (kind === 'corrupt') writeFileSync(target, 'synthetic corrupt unknown', { mode: 0o600 });
    if (kind === 'mismatched SQLite') copyFileSync(join(options.sessionRoot, old.store_id, 'session.sqlite'), target);
    assert.throws(() => openExisting(options), { code: 'AUTHORITY_FENCED' });
    assert.throws(() => openOfflineRecovery(options, true), { code: 'AUTHORITY_FENCED' });
    assert.deepEqual(readRow(control, 'SELECT * FROM authority'), old);
    assert.ok(existsSync(unknown));
  });
}

for (const initialState of ['corrupt', 'absent directory']) {
  test('retirement rejects different evidence at the same path: ' + initialState, async (t) => {
    const options = fixture(t);
    const first = initializeFresh(options);
    await first.close();
    const control = join(options.controlRoot, 'authority.sqlite');
    const old = readRow(control, 'SELECT * FROM authority');
    assert.ok(typeof old.store_id === 'string');
    const dir = join(options.sessionRoot, old.store_id);
    const file = join(dir, 'session.sqlite');
    if (initialState === 'corrupt') writeFileSync(file, 'known corrupt main DB');
    else {
      unlinkSync(file);
      rmdirSync(dir);
    }
    assert.throws(() => openExisting(options));
    const maintenance = openOfflineRecovery(options, true);
    try {
      const reset = maintenance.confirmReset(maintenance.reserveResetId());
      await openExisting(options, requireValue(reset.activation)).close();
    } finally { maintenance.close(); }
    const recorded = readRow(control, 'SELECT * FROM authority');
    if (initialState === 'corrupt') writeFileSync(file, 'unknown corrupt DB bytes');
    else mkdirSync(dir, { mode: 0o700 });
    assert.throws(() => openExisting(options), { code: 'AUTHORITY_FENCED' });
    assert.throws(() => openOfflineRecovery(options, true), { code: 'AUTHORITY_FENCED' });
    assert.deepEqual(readRow(control, 'SELECT * FROM authority'), recorded);
  });
}

test('CP2 S16 a new synthetic path requires explicit generation change and retains the account scope', async (t) => {
  const original = fixture(t);
  const oldStore = initializeFresh(original);
  await login(oldStore, 1);
  const oldLease = requireValue(await oldStore.lookupCurrent(digestFor(1)));
  await oldStore.close();
  const controlName = 'authority.sqlite';
  const oldBinding = readRow(join(original.controlRoot, controlName), 'SELECT * FROM authority');
  const fresh = fixture(t);
  assert.throws(() => openExisting(fresh));
  // Qualified local path simulation with retained trusted control, without copying sessions.
  for (const name of [controlName, 'authority-lock.sqlite']) {
    copyFileSync(join(original.controlRoot, name), join(fresh.controlRoot, name));
  }
  assert.throws(() => openExisting(fresh));
  const repair = openOfflineRecovery(fresh, true);
  try {
    const reset = repair.confirmReset(repair.reserveResetId());
    const binding = readRow(join(fresh.controlRoot, controlName), 'SELECT * FROM authority');
    assert.ok(typeof binding.store_id === 'string');
    assert.ok(typeof oldBinding.generation === 'number');
    assert.equal(binding.generation, oldBinding.generation + 1);
    assert.notEqual(binding.store_id, oldBinding.store_id);
    const newStore = openExisting(fresh, requireValue(reset.activation));
    try {
      assert.equal(await newStore.lookupCurrent(digestFor(1)), null);
      await login(newStore, 2);
      const newLease = requireValue(await newStore.lookupCurrent(digestFor(2)));
      assert.equal(newLease.accountId, oldLease.accountId);
      assert.notEqual(newLease.identity, oldLease.identity);
    } finally { await newStore.close(); }
  } finally { repair.close(); }
});

for (const version of [0, 2]) {
  test('CP2 S22 refuses control schema version ' + version + ' without migration', async (t) => {
    const options = fixture(t);
    await initializeFresh(options).close();
    const path = join(options.controlRoot, 'authority.sqlite');
    const db = new DatabaseSync(path);
    try {
      db.exec('PRAGMA ignore_check_constraints=ON');
      db.prepare('UPDATE authority SET schema_version=?').run(version);
    } finally { db.close(); }
    assert.throws(() => openExisting(options), { code: 'STORE_SCHEMA_UNSUPPORTED' });
    assert.throws(() => openOfflineRecovery(options, true), { code: 'STORE_SCHEMA_UNSUPPORTED' });
    assert.equal(readRow(path, 'SELECT schema_version FROM authority').schema_version, version);
  });
}

test('CP2 rejects a retained readable witness whose store ID was substituted', async (t) => {
  const options = fixture(t);
  const control = join(options.controlRoot, 'authority.sqlite');
  const fresh = initializeFresh(options);
  await login(fresh, 1);
  await fresh.close();
  const original = readRow(control, 'SELECT * FROM authority');
  assert.ok(typeof original.store_id === 'string');
  const raw = new DatabaseSync(control);
  try { raw.exec("UPDATE authority SET phase='FENCED', clean_shutdown=0"); } finally { raw.close(); }
  const maintenance = openOfflineRecovery(options, true);
  try {
    const result = maintenance.confirmReset(maintenance.reserveResetId());
    await openExisting(options, requireValue(result.activation)).close();
  } finally { maintenance.close(); }
  const history = join(options.sessionRoot, original.store_id, 'session.sqlite');
  const old = new DatabaseSync(history);
  try { old.prepare('UPDATE session_meta SET store_id=?').run('e'.repeat(32)); } finally { old.close(); }
  assert.throws(() => openExisting(options), { code: 'AUTHORITY_FENCED' });
  assert.throws(() => openOfflineRecovery(options, true), { code: 'AUTHORITY_FENCED' });
});

test('CP2 S12 unreadable control never opens the session store', async (t) => {
  const options = fixture(t);
  const store = initializeFresh(options);
  await login(store, 1);
  await store.close();
  const path = join(options.controlRoot, 'authority.sqlite');
  chmodSync(path, 0o000);
  try {
    assert.throws(() => readFileSync(path), { code: 'EACCES' });
    assert.throws(() => openExisting(options), { code: 'STORE_UNAVAILABLE' });
    assert.throws(() => openOfflineRecovery(options, true), { code: 'STORE_UNAVAILABLE' });
  } finally { chmodSync(path, 0o600); }
  const reopened = openExisting(options);
  try { assert.ok(await reopened.lookupCurrent(digestFor(1))); } finally { await reopened.close(); }
});

test('CP2 S12 a corrupt WAL cannot satisfy the last committed binding after a crash', { timeout: 9000 }, async (t) => {
  const options = fixture(t);
  const child = startChild(options, 'fresh');
  await child.expect('READY');
  await child.send('ARM_CRASH', 'stable');
  await child.expect('ARMED');
  await child.send('MUTATE');
  await child.confirmCrash('stable');
  const control = join(options.controlRoot, 'authority.sqlite');
  const binding = readRow(control, 'SELECT * FROM authority');
  assert.ok(typeof binding.store_id === 'string');
  assert.equal(binding.committed_seq, 1);
  const wal = join(options.sessionRoot, binding.store_id, 'session.sqlite-wal');
  assert.ok(readFileSync(wal).length > 32);
  writeFileSync(wal, 'synthetic loss of committed WAL frames');
  assert.throws(() => openExisting(options), { code: 'AUTHORITY_FENCED' });
  // Isolate the binding check even if a fixture with an inconsistent clean marker is presented.
  const raw = new DatabaseSync(control);
  try { raw.exec('UPDATE authority SET clean_shutdown=1'); } finally { raw.close(); }
  assert.throws(() => openExisting(options));
  assert.equal(readRow(control, 'SELECT committed_seq FROM authority').committed_seq, 1);
});
