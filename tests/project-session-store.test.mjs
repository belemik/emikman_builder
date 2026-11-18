import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { syntheticSessionHooks } from '../server/session-recovery-authority.mjs';
import { initializeFresh, openExisting, walAtCapacity } from '../server/session-store.mjs';
import { accountA, accountB, digestFor, fixture, login, requireValue } from './fixtures/session-store-worker.mjs';

test('isolated store copies command fields synchronously and interns the current lease', async (t) => {
  const store = initializeFresh(fixture(t, { wallClock: () => 1_000_000 }));
  try {
    const command = { digest: digestFor(1), accountId: accountA, expected: null };
    const write = store.replaceCurrent(command);
    command.accountId = accountB;
    command.digest = digestFor(2);
    assert.deepEqual(await write, { expiresAt: 29_800_000 });
    const first = requireValue(await store.lookupCurrent(digestFor(1)));
    const second = requireValue(await store.lookupCurrent(digestFor(1)));
    assert.equal(first.accountId, accountA);
    assert.equal(first.identity, second.identity);
    assert.equal(await store.lookupCurrent(digestFor(2)), null);
  } finally {
    await store.close();
  }
});

test('serialized rotation rejects a stale lease without affecting another account', async (t) => {
  const store = initializeFresh(fixture(t, { wallClock: () => 1_000_000 }));
  try {
    await login(store, 1);
    await login(store, 4, accountB);
    const original = requireValue(await store.lookupCurrent(digestFor(1)));
    const expected = { digest: digestFor(1), identity: original.identity };
    const results = await Promise.allSettled([
      login(store, 2, accountA, expected), login(store, 3, accountA, expected),
    ]);
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[1].status, 'rejected');
    assert.equal(results[1].reason.code, 'ROTATION_CONFLICT');
    assert.equal(await store.lookupCurrent(digestFor(1)), null);
    assert.equal(requireValue(await store.lookupCurrent(digestFor(2))).accountId, accountA);
    assert.equal(await store.lookupCurrent(digestFor(3)), null);
    assert.equal(requireValue(await store.lookupCurrent(digestFor(4))).accountId, accountB);
  } finally {
    await store.close();
  }
});

test('a revocation during async account resolution defeats the pending lookup', async (t) => {
  /** @type {()=>void} */ let entered = () => assert.fail('Barrier not initialized');
  /** @type {(id:string)=>void} */ let release = () => assert.fail('Barrier not initialized');
  const awaitingAccount = new Promise((resolve) => { entered = () => resolve(undefined); });
  /** @type {Promise<string>} */
  const resolvedAccount = new Promise((resolve) => { release = resolve; });
  const store = initializeFresh(fixture(t, {
    wallClock: () => 1_000_000,
    resolveAccount: async () => { entered(); return resolvedAccount; },
  }));
  try {
    await login(store, 1);
    const lookup = store.lookupCurrent(digestFor(1));
    await awaitingAccount;
    await store.revokeCurrent(digestFor(1));
    release(accountA);
    assert.equal(await lookup, null);
  } finally {
    release(accountA);
    await store.close();
  }
});

test('exact expiry is denied and cannot be followed by authenticated clock rollback', async (t) => {
  let now = 90;
  const store = initializeFresh(fixture(t, { wallClock: () => now, testTtlMs: 2 }));
  await login(store, 1);
  now = 91;
  assert.ok(await store.lookupCurrent(digestFor(1)));
  now = 92;
  assert.equal(await store.lookupCurrent(digestFor(1)), null);
  now = 93;
  assert.equal(await store.lookupCurrent(digestFor(1)), null);
  now = 92;
  assert.equal(await store.lookupCurrent(digestFor(1)), null);
  assert.equal(store.readiness(), false);
  await assert.rejects(store.close(), { code: 'AUTHORITY_FENCED' });
});

test('expected capacity refusal has no authority write or partial insertion', async (t) => {
  const now = 1_000_000;
  const options = fixture(t, { wallClock: () => now });
  await initializeFresh(options).close();
  const [storeId] = readdirSync(options.sessionRoot);
  // Seed a capped synthetic baseline without adding a runtime testing bypass.
  const data = new DatabaseSync(join(options.sessionRoot, storeId, 'session.sqlite'));
  try {
    const insert = data.prepare(`
      INSERT INTO sessions(token_digest, account_id, issued_at, expires_at, lease_version,
        auth_generation, status, revoked_at) VALUES (?, ?, ?, ?, 1, 1, 'revoked', ?)
    `);
    data.exec('BEGIN IMMEDIATE');
    for (let i = 1; i < 20_000; i += 1) insert.run(digestFor(i), accountA, now, now + 100, now);
    data.exec('COMMIT');
  } finally {
    data.close();
  }
  const store = openExisting(options);
  const readOnly = new DatabaseSync(join(options.controlRoot, 'authority.sqlite'), { readOnly: true });
  try {
    const read = () => readOnly.prepare('SELECT * FROM authority').get();
    await login(store, 20_000);
    assert.ok(await store.lookupCurrent(digestFor(20_000)));
    const before = read();
    await assert.rejects(login(store, 20_001), { code: 'QUEUE_CAPACITY' });
    assert.deepEqual(read(), before);
    assert.equal(await store.lookupCurrent(digestFor(20_001)), null);
    assert.ok(store.readiness());
  } finally {
    readOnly.close();
    await store.close();
  }
});

/** @param {string} path @param {string} sql */
function inspect(path, sql) {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return requireValue(db.prepare(sql).get()); } finally { db.close(); }
}

test('captured nested lease survives input mutation during a verified account switch', async (t) => {
  const options = fixture(t, { wallClock: () => 1_000_000 });
  const store = options.manage(initializeFresh(options));
  await login(store, 1, accountA);
  await login(store, 2, accountA);
  const captured = requireValue(await store.lookupCurrent(digestFor(1)));
  const expected = { digest: digestFor(1), identity: captured.identity };
  const command = { digest: digestFor(3), accountId: accountB, expected };
  const mutation = store.replaceCurrent(command);
  expected.digest = digestFor(2);
  expected.identity = {};
  command.accountId = accountA;
  await mutation;
  assert.equal(await store.lookupCurrent(digestFor(1)), null);
  assert.equal(requireValue(await store.lookupCurrent(digestFor(2))).accountId, accountA);
  assert.equal(requireValue(await store.lookupCurrent(digestFor(3))).accountId, accountB);
  const control = inspect(join(options.controlRoot, 'authority.sqlite'), 'SELECT * FROM authority');
  assert.ok(typeof control.store_id === 'string');
  const session = inspect(join(options.sessionRoot, control.store_id, 'session.sqlite'), 'SELECT * FROM session_meta');
  assert.equal(control.committed_seq, 3);
  assert.equal(control.committed_seq, session.commit_seq);
  assert.equal(control.committed_op_id, session.last_op_id);
});

test('an unresolved resolver cannot delay close or deliver a late positive lease', { timeout: 4000 }, async (t) => {
  /** @type {(signal:AbortSignal)=>void} */ let entered = () => assert.fail('Barrier not initialized');
  /** @type {(id:string)=>void} */ let finish = () => assert.fail('Barrier not initialized');
  /** @type {Promise<AbortSignal>} */
  const began = new Promise((resolve) => { entered = resolve; });
  /** @type {Promise<string>} */
  const pending = new Promise((resolve) => { finish = resolve; });
  const options = fixture(t, { wallClock: () => 1_000_000, resolveAccount(id, signal) {
    assert.equal(id, accountA);
    entered(signal);
    return pending;
  } });
  const store = options.manage(initializeFresh(options));
  await login(store, 1);
  const lookup = store.lookupCurrent(digestFor(1));
  const signal = await began;
  try {
    await store.close();
    assert.equal(signal.aborted, true);
    assert.equal(await lookup, null);
    assert.equal(inspect(join(options.controlRoot, 'authority.sqlite'), 'SELECT clean_shutdown FROM authority').clean_shutdown, 1);
  } finally {
    finish(accountA);
  }
  assert.equal(await lookup, null);
});

for (const delay of [249, 250, 251]) {
  test('FIFO has one dispatch slot and 64 waiting slots at queue wait ' + delay, async (t) => {
    let mono = 0;
    const options = fixture(t, { wallClock: () => 1_000_000,
      [syntheticSessionHooks]: { monotonic: () => mono } });
    const store = options.manage(initializeFresh(options));
    const work = Array.from({ length: 65 }, () => store.revokeCurrent(digestFor(1)));
    const overflow = assert.rejects(store.revokeCurrent(digestFor(1)), { code: 'QUEUE_CAPACITY' });
    mono = delay;
    const verdicts = await Promise.allSettled(work);
    await overflow;
    for (const result of verdicts) {
      assert.equal(result.status, delay < 250 ? 'fulfilled' : 'rejected');
      if (result.status === 'rejected') assert.equal(result.reason.code, 'STORE_UNAVAILABLE');
    }
  });
}

for (const delay of [999, 1000, 1001]) {
  test('durable prepare at soft deadline ' + delay, async (t) => {
    let mono = 0;
    const options = fixture(t, { wallClock: () => 1_000_000,
      [syntheticSessionHooks]: {
        monotonic: () => mono,
        onStage(stage) { if (stage === 'before-prepare-update') mono = delay; },
      },
    });
    const store = options.manage(initializeFresh(options));
    const path = join(options.controlRoot, 'authority.sqlite');
    const before = inspect(path, 'SELECT * FROM authority');
    if (delay < 1000) {
      await login(store, 1);
      assert.equal(inspect(path, 'SELECT * FROM authority').committed_seq, 1);
    } else {
      await assert.rejects(login(store, 1), { code: 'STORE_UNAVAILABLE' });
      assert.deepEqual(inspect(path, 'SELECT * FROM authority'), before);
    }
    assert.ok(store.readiness());
  });
}

test('a late session COMMIT remains stored but the unconfirmed durable outcome fences', async (t) => {
  let mono = 0;
  const options = fixture(t, { wallClock: () => 1_000_000,
    [syntheticSessionHooks]: {
      monotonic: () => mono,
      onStage(stage) { if (stage === 'session-committed') mono = 1000; },
    },
  });
  const store = initializeFresh(options);
  try {
    await assert.rejects(login(store, 1), { code: 'STORE_UNAVAILABLE' });
    const control = inspect(join(options.controlRoot, 'authority.sqlite'), 'SELECT * FROM authority');
    assert.ok(typeof control.store_id === 'string');
    assert.equal(control.phase, 'FENCED');
    assert.equal(control.committed_seq, 0);
    const session = inspect(join(options.sessionRoot, control.store_id, 'session.sqlite'), 'SELECT * FROM session_meta');
    assert.equal(session.commit_seq, 1);
    assert.equal(control.pending_op_id, session.last_op_id);
    assert.equal(await store.lookupCurrent(digestFor(1)), null);
  } finally {
    await assert.rejects(store.close(), { code: 'AUTHORITY_FENCED' });
  }
});

test('WAL readiness comparator trips at exactly 8 MiB', () => {
  const threshold = 8_388_608;
  assert.equal(walAtCapacity(threshold - 1), false);
  assert.equal(walAtCapacity(threshold), true);
  assert.equal(walAtCapacity(threshold + 1), true);
});

test('bounded GC keeps records before retention and removes them at equality or later', async (t) => {
  const first = 1_000_000;
  const retention = 86_400_000;
  let now = first;
  const options = fixture(t, { wallClock: () => now, testTtlMs: 100 });
  const store = options.manage(initializeFresh(options));
  await login(store, 1);
  await login(store, 2);
  await store.revokeCurrent(digestFor(1));
  const controlPath = join(options.controlRoot, 'authority.sqlite');
  const control = inspect(controlPath, 'SELECT * FROM authority');
  assert.ok(typeof control.store_id === 'string');
  const path = join(options.sessionRoot, control.store_id, 'session.sqlite');
  /** @param {number} id */
  const exists = (id) => {
    const db = new DatabaseSync(path, { readOnly: true });
    try { return Boolean(db.prepare('SELECT 1 FROM sessions WHERE token_digest=?').get(digestFor(id))); }
    finally { db.close(); }
  };
  now = first + retention - 1;
  await login(store, 3);
  assert.ok(exists(1) && exists(2));
  now += 1;
  await login(store, 4);
  assert.ok(!exists(1) && exists(2));
  now = first + retention + 101;
  await login(store, 5);
  assert.equal(exists(2), false);
  assert.equal(inspect(controlPath, 'SELECT committed_seq FROM authority').committed_seq, 6);
});

test('active capacity accepts the final slot, rejects overflow, and allows net-zero rotation', async (t) => {
  const now = 1_000_000;
  const options = fixture(t, { wallClock: () => now });
  await initializeFresh(options).close();
  const [storeId] = readdirSync(options.sessionRoot);
  const sessionPath = join(options.sessionRoot, storeId, 'session.sqlite');
  const seed = new DatabaseSync(sessionPath);
  try {
    const insert = seed.prepare(`
      INSERT INTO sessions(token_digest, account_id, issued_at, expires_at, lease_version,
        auth_generation, status, revoked_at) VALUES (?, ?, ?, ?, 1, 1, 'active', NULL)
    `);
    seed.exec('BEGIN IMMEDIATE');
    for (let id = 1; id < 10_000; id += 1) insert.run(digestFor(id), accountA, now, now + 10);
    seed.exec('COMMIT');
  } finally {
    seed.close();
  }
  const store = options.manage(openExisting(options));
  await login(store, 10_000);
  const controlPath = join(options.controlRoot, 'authority.sqlite');
  const before = inspect(controlPath, 'SELECT * FROM authority');
  await assert.rejects(login(store, 10_001), { code: 'QUEUE_CAPACITY' });
  assert.deepEqual(inspect(controlPath, 'SELECT * FROM authority'), before);
  const active = requireValue(await store.lookupCurrent(digestFor(1)));
  await login(store, 10_001, accountB, { digest: digestFor(1), identity: active.identity });
  const count = inspect(sessionPath, "SELECT count(*) AS n FROM sessions WHERE status='active'");
  assert.equal(count.n, 10_000);
});

test('a startup cleanup processes one batch when 257 records are eligible', async (t) => {
  const then = 1_000_000;
  let now = then;
  const options = fixture(t, { wallClock: () => now });
  await initializeFresh(options).close();
  const [storeId] = readdirSync(options.sessionRoot);
  const sessionPath = join(options.sessionRoot, storeId, 'session.sqlite');
  const seed = new DatabaseSync(sessionPath);
  try {
    const insert = seed.prepare(`
      INSERT INTO sessions(token_digest, account_id, issued_at, expires_at, lease_version,
        auth_generation, status, revoked_at) VALUES (?, ?, ?, ?, 1, 1, 'active', NULL)
    `);
    seed.exec('BEGIN IMMEDIATE');
    for (let id = 1; id <= 257; id += 1) insert.run(digestFor(id), accountA, then, then + 1);
    seed.exec('COMMIT');
  } finally {
    seed.close();
  }
  now = then + 1 + 86_400_000;
  options.manage(openExisting(options));
  assert.equal(inspect(sessionPath, 'SELECT count(*) AS n FROM sessions').n, 1);
  assert.equal(inspect(join(options.controlRoot, 'authority.sqlite'), 'SELECT committed_seq FROM authority').committed_seq, 1);
});

test('shutdown between the final FIFO read and Promise delivery suppresses the lease', async (t) => {
  let now = 1_000_000;
  let requestClose = false;
  let closing;
  const options = fixture(t, {
    wallClock: () => now,
    [syntheticSessionHooks]: { onStage(stage) {
      if (requestClose && stage === 'before-clock-write') {
        requestClose = false;
        queueMicrotask(() => { closing = store.close(); });
      }
    } },
  });
  const store = options.manage(initializeFresh(options));
  await login(store, 1);
  now += 1;
  requestClose = true;
  assert.equal(await store.lookupCurrent(digestFor(1)), null);
  assert.ok(closing);
  await closing;
});

test('failure inside the session transaction rolls back rows and fences PREPARED', async (t) => {
  const options = fixture(t, {
    wallClock: () => 1_000_000,
    [syntheticSessionHooks]: { onStage(stage) {
      if (stage === 'before-session-commit') throw new Error('synthetic write failure');
    } },
  });
  const store = initializeFresh(options);
  try {
    await assert.rejects(login(store, 1), { code: 'STORE_UNAVAILABLE' });
    const control = inspect(join(options.controlRoot, 'authority.sqlite'), 'SELECT * FROM authority');
    assert.ok(typeof control.store_id === 'string');
    assert.equal(control.phase, 'FENCED');
    assert.equal(control.committed_seq, 0);
    assert.ok(typeof control.pending_op_id === 'string');
    assert.match(control.pending_op_id, /^[0-9a-f]{32}$/);
    const path = join(options.sessionRoot, control.store_id, 'session.sqlite');
    assert.equal(inspect(path, 'SELECT commit_seq FROM session_meta').commit_seq, 0);
    assert.equal(inspect(path, 'SELECT count(*) AS n FROM sessions').n, 0);
    assert.equal(await store.lookupCurrent(digestFor(1)), null);
  } finally {
    await assert.rejects(store.close(), { code: 'AUTHORITY_FENCED' });
  }
});

test('an oversized retained WAL applies backpressure on startup and before mutation', async (t) => {
  const now = 1_000_000;
  const options = fixture(t, { wallClock: () => now });
  await initializeFresh(options).close();
  const [storeId] = readdirSync(options.sessionRoot);
  const path = join(options.sessionRoot, storeId, 'session.sqlite');
  const controlPath = join(options.controlRoot, 'authority.sqlite');
  // Build synthetic WAL history with no store open. A WAL reader pins the log.
  const writer = new DatabaseSync(path);
  let reader;
  try {
    writer.exec('PRAGMA wal_autocheckpoint=0; PRAGMA synchronous=FULL');
    reader = new DatabaseSync(path, { readOnly: true });
    reader.exec('BEGIN');
    reader.prepare('SELECT commit_seq FROM session_meta').get();
    const insert = writer.prepare(`
      INSERT INTO sessions(token_digest, account_id, issued_at, expires_at, lease_version,
        auth_generation, status, revoked_at) VALUES (?, ?, ?, ?, 1, 1, 'active', NULL)
    `);
    const erase = writer.prepare('DELETE FROM sessions WHERE token_digest=?');
    for (let i = 0; i < 4096 && !walAtCapacity(statSync(path + '-wal', { throwIfNoEntry: false })?.size ?? 0); i += 1) {
      if (i % 2 === 0) insert.run(digestFor(1), accountA, now, now + 100);
      else erase.run(digestFor(1));
    }
    erase.run(digestFor(1));
    assert.ok(walAtCapacity(statSync(path + '-wal').size));
  } catch (error) {
    reader?.close();
    throw error;
  } finally {
    writer.close();
  }
  let store;
  try {
    store = openExisting(options);
    assert.equal(store.readiness(), false);
    const before = inspect(controlPath, 'SELECT * FROM authority');
    await assert.rejects(login(store, 2), { code: 'STORE_UNAVAILABLE' });
    assert.deepEqual(inspect(controlPath, 'SELECT * FROM authority'), before);
  } finally {
    try { await store?.close(); } finally { reader.close(); }
  }
});

test('CP2 S10 acknowledged logout orders before competing captured re-login', async (t) => {
  const store = fixture(t);
  const live = store.manage(initializeFresh(store));
  await login(live, 1);
  const lease = requireValue(await live.lookupCurrent(digestFor(1)));
  const revoke = live.revokeCurrent(digestFor(1));
  const stale = login(live, 2, accountB, { digest: digestFor(1), identity: lease.identity });
  await Promise.all([revoke, assert.rejects(stale, { code: 'ROTATION_CONFLICT' })]);
  assert.equal(await live.lookupCurrent(digestFor(1)), null);
  assert.equal(await live.lookupCurrent(digestFor(2)), null);
});

test('CP2 S03/S17 uses absolute eight-hour TTL and rejects a larger local test profile', async (t) => {
  const started = 1_000_000;
  const ttl = 8 * 60 * 60 * 1000;
  let now = started;
  const options = fixture(t, { wallClock: () => now });
  assert.throws(() => initializeFresh({ ...options, testTtlMs: ttl + 1 }), { code: 'SESSION_INVALID' });
  const store = options.manage(initializeFresh(options));
  const issued = await login(store, 1);
  assert.equal(issued.expiresAt, started + ttl);
  for (const offset of [-1, 0, 1]) {
    now = started + ttl + offset;
    const lease = await store.lookupCurrent(digestFor(1));
    if (offset === -1) assert.equal(requireValue(lease).expiresAt, issued.expiresAt);
    else assert.equal(lease, null);
  }
});
