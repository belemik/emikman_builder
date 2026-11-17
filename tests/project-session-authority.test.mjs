import assert from 'node:assert/strict';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { openOfflineRecovery, syntheticSessionHooks } from '../server/session-recovery-authority.mjs';
import { initializeFresh, openExisting } from '../server/session-store.mjs';
import { digestFor, fixture, login, requireValue } from './fixtures/session-store-worker.mjs';

/** @param {ReturnType<typeof fixture>} options */
function authorityRow(options) {
  const db = new DatabaseSync(join(options.controlRoot, 'authority.sqlite'), { readOnly: true });
  try {
    return requireValue(db.prepare('SELECT * FROM authority').get());
  } finally {
    db.close();
  }
}

test('durable dirty marker precedes the first admission clock; clean shutdown records the maximum clock', async (t) => {
  let now = 1_000_000;
  let inspected = false;
  const options = fixture(t, {
    testTtlMs: 1,
    wallClock() {
      if (!inspected) {
        assert.equal(authorityRow(options).clean_shutdown, 0);
        inspected = true;
      }
      return now;
    },
  });
  const store = initializeFresh(options);
  await login(store, 1);
  now += 1;
  assert.equal(await store.lookupCurrent(digestFor(1)), null);
  await store.close();
  assert.ok(inspected);
  const final = authorityRow(options);
  assert.equal(final.clean_shutdown, 1);
  assert.equal(final.last_auth_wall_ms, now);

  inspected = false;
  const reopened = openExisting(options);
  assert.ok(inspected);
  assert.equal(await reopened.lookupCurrent(digestFor(1)), null);
  await reopened.close();
});

test('rollback remains fenced after clock correction; reset receipt does not reopen admission', async (t) => {
  let now = 1_000_000;
  const options = fixture(t, { wallClock: () => now });
  const store = initializeFresh(options);
  await login(store, 1);
  now -= 1;
  assert.equal(await store.lookupCurrent(digestFor(1)), null);
  now += 1;
  await assert.rejects(store.close(), { code: 'AUTHORITY_FENCED' });
  assert.equal(authorityRow(options).clean_shutdown, 0);
  assert.throws(() => openExisting(options), { code: 'AUTHORITY_FENCED' });

  const maintenance = openOfflineRecovery(options, true);
  let receipt;
  try {
    receipt = maintenance.reserveResetId();
    const reset = maintenance.confirmReset(receipt);
    const recovered = openExisting(options, requireValue(reset.activation));
    assert.equal(await recovered.lookupCurrent(digestFor(1)), null);
    await recovered.close();
  } finally {
    maintenance.close();
  }
  const inspection = openOfflineRecovery(options, true);
  try {
    assert.deepEqual(inspection.confirmReset(receipt), { completed: true });
    assert.equal(authorityRow(options).generation, 2);
    assert.throws(() => inspection.confirmReset('0'.repeat(32)), { code: 'AUTHORITY_FENCED' });
  } finally {
    inspection.close();
  }
});

test('a successful clean restart preserves the lease with a fresh local identity', async (t) => {
  const options = fixture(t, { wallClock: () => 1_000_000 });
  const initial = options.manage(initializeFresh(options));
  await login(initial, 1);
  const first = await initial.lookupCurrent(digestFor(1));
  assert.ok(first);
  await initial.close();
  const next = options.manage(openExisting(options));
  const restored = await next.lookupCurrent(digestFor(1));
  assert.ok(restored);
  assert.equal(restored.accountId, first.accountId);
  assert.equal(restored.expiresAt, first.expiresAt);
  assert.notEqual(restored.identity, first.identity);
});

test('expiry during the high-water checkpoint cannot yield a positive lease', async (t) => {
  let now = 1_000_000;
  let cross = false;
  const options = fixture(t, {
    wallClock: () => now,
    testTtlMs: 2,
    [syntheticSessionHooks]: { onStage(stage) {
      if (cross && stage === 'before-clock-write') {
        cross = false;
        now = 1_000_002;
      }
    } },
  });
  const store = options.manage(initializeFresh(options));
  await login(store, 1);
  now = 1_000_001;
  cross = true;
  assert.equal(await store.lookupCurrent(digestFor(1)), null);
  assert.equal(authorityRow(options).last_auth_wall_ms, 1_000_002);
});

test('failed high-water checkpoint denies and leaves durable fencing', async (t) => {
  let now = 1_000_000;
  let failWrite = false;
  const options = fixture(t, {
    wallClock: () => now,
    [syntheticSessionHooks]: { onStage(stage) {
      if (failWrite && stage === 'before-clock-write') throw new Error('synthetic disk error');
    } },
  });
  const store = initializeFresh(options);
  try {
    await login(store, 1);
    now += 1;
    failWrite = true;
    assert.equal(await store.lookupCurrent(digestFor(1)), null);
    assert.equal(authorityRow(options).phase, 'FENCED');
    assert.equal(authorityRow(options).clean_shutdown, 0);
  } finally {
    await assert.rejects(store.close(), { code: 'AUTHORITY_FENCED' });
  }
  assert.throws(() => openExisting(options), { code: 'AUTHORITY_FENCED' });
});

test('failure to write the dirty marker blocks first clock sampling and later ordinary startup', async (t) => {
  const options = fixture(t, { wallClock: () => 1_000_000 });
  await initializeFresh(options).close();
  let clockRead = false;
  const failure = {
    ...options,
    wallClock() { clockRead = true; return 1_000_001; },
    [syntheticSessionHooks]: { onStage(/** @type {string} */ stage) {
      if (stage === 'before-dirty-write') throw new Error('synthetic dirty marker error');
    } },
  };
  assert.throws(() => openExisting(failure), { code: 'STORE_UNAVAILABLE' });
  assert.equal(clockRead, false);
  assert.equal(authorityRow(options).phase, 'FENCED');
  assert.throws(() => openExisting(options), { code: 'AUTHORITY_FENCED' });
});
