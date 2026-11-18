import assert from 'node:assert/strict';
import { lstatSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openOfflineRecovery, syntheticSessionHooks } from '../../server/session-recovery-authority.mjs';
import { initializeFresh, openExisting } from '../../server/session-store.mjs';

export const accountA = 'a'.repeat(32);
export const accountB = 'b'.repeat(32);
/** @typedef {import('../../server/session-store.mjs').StoreOptions} StoreOptions */
/** @typedef {import('../../server/session-store.mjs').Lease} Lease */
/** @typedef {ReturnType<typeof initializeFresh>} Store */
/** @typedef {import('node:test').TestContext} TestContext */

/** @template T @param {T|null|undefined} row @returns {T} */
export function requireValue(row) {
  assert.ok(row !== undefined && row !== null, 'Expected a value in the synthetic fixture');
  return row;
}

/** @param {number} value */
export const digestFor = (value) => value.toString(16).padStart(64, '0');

/** @param {string} root */
function removeFixture(root) {
  const rootInfo = lstatSync(root);
  if (!rootInfo.isDirectory() || rootInfo.uid !== process.getuid?.() || (rootInfo.mode & 0o7777) !== 0o700) {
    throw new Error('Preserve the synthetic fixture for inspection');
  }
  /** @param {string} dir */
  function check(dir, relative = '') {
    const allowed = relative === '' ? /^(session-data|recovery-control|old\.sqlite)$/ :
      relative === 'session-data' ? /^[0-9a-f]{32}$/ :
      relative === 'recovery-control' ? /^authority(?:-lock)?\.sqlite(?:-(?:wal|shm|journal))?$/ :
      /^session\.sqlite(?:-(?:wal|shm|journal))?$/;
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      const info = lstatSync(path);
      const directoryExpected = relative === 'session-data' ||
        (relative === '' && entry !== 'old.sqlite');
      if (!allowed.test(entry) || info.uid !== rootInfo.uid || info.dev !== rootInfo.dev ||
          (directoryExpected ? !info.isDirectory() : !info.isFile() || info.nlink !== 1)) {
        throw new Error('Preserve the synthetic fixture for inspection');
      }
      if (directoryExpected) check(path, relative ? relative + '/' + entry : entry);
    }
  }
  check(root);
  rmSync(root, { recursive: true });
}

/** @param {TestContext} t @param {Partial<StoreOptions>} overrides */
export function fixture(t, overrides = {}) {
  const runtimeRoot = mkdtempSync('/private/var/tmp/zarya-g1b-c1-');
  const sessionRoot = join(runtimeRoot, 'session-data');
  const controlRoot = join(runtimeRoot, 'recovery-control');
  mkdirSync(sessionRoot, { mode: 0o700 });
  mkdirSync(controlRoot, { mode: 0o700 });
  /** @type {Array<()=>Promise<void>|void>} */ const disposers = [];
  /** @type {Set<Store>} */ const handles = new Set();
  t.after(async () => {
    for (const dispose of disposers) await dispose();
    for (const store of handles) await store.close();
    removeFixture(runtimeRoot);
  });
  return { runtimeRoot, sessionRoot, controlRoot,
    /** @param {()=>Promise<void>|void} dispose */
    onCleanup(dispose) { disposers.push(dispose); },
    /** @param {Store} store */
    manage(store) { handles.add(store); return store; },
    /** @param {Store} store */
    released(store) { handles.delete(store); },
    resolveAccount: async (/** @type {string} */ id) => [accountA, accountB].includes(id) ? id : null, ...overrides };
}

/** @param {Store} store @param {number} id @param {string} accountId @param {{digest:string,identity:object}|null} expected */
export function login(store, id, accountId = accountA, expected = null) {
  return store.replaceCurrent({ digest: digestFor(id), accountId, expected });
}

export const crashPhases = Object.freeze(['before-prepare-update', 'prepared', 'session-committed', 'stable']);

function worker() {
  const [runtimeRoot, sessionRoot, controlRoot, runId, mode] = process.argv.slice(2);
  if (!process.send || !/^[0-9a-f-]{36}$/.test(runId) || !['fresh', 'existing', 'offline'].includes(mode)) {
    process.exitCode = 1;
    process.disconnect?.();
    return;
  }
  const sendMessage = process.send.bind(process);
  /** @param {string} kind @param {(error:Error|null)=>void} [onSent] */
  const send = (kind, onSent) => onSent ? sendMessage({ runId, kind }, onSent) : sendMessage({ runId, kind });
  const disconnect = () => process.disconnect?.();
  if (mode === 'offline') {
    let maintenance;
    let reserved;
    /** @type {string|undefined} */ let armed;
    try {
      maintenance = openOfflineRecovery({
        runtimeRoot, sessionRoot, controlRoot,
        [syntheticSessionHooks]: { onStage(stage) {
          if (stage !== armed) return;
          writeSync(1, JSON.stringify({ runId, stage }) + '\n');
          process.kill(process.pid, 'SIGKILL');
        } },
      }, true);
      reserved = maintenance.reserveResetId();
    } catch {
      maintenance?.close();
      send('DENIED', disconnect);
      return;
    }
    process.once('disconnect', () => maintenance.close());
    process.on('message', (message) => {
      if (!message || typeof message !== 'object' || !('runId' in message) ||
          message.runId !== runId || !('kind' in message) || !('stage' in message)) return;
      if (message.kind === 'ARM_RESET' && armed === undefined && typeof message.stage === 'string' &&
          ['before-reset-publish', 'after-reset-publish'].includes(message.stage)) {
        armed = message.stage;
        sendMessage({ runId, kind: 'RESET_RESERVED', resetId: reserved });
      } else if (message.kind === 'CONFIRM_RESET' && armed && message.stage === reserved) {
        try { maintenance.confirmReset(reserved); } catch { /* The armed phase must self-crash. */ }
        process.exitCode = 1;
        send('MISSED_PHASE', disconnect);
      }
    });
    send('READY');
    return;
  }
  /** @type {string|undefined} */ let armed;
  let store;
  try {
    const open = mode === 'fresh' ? initializeFresh : openExisting;
    store = open({ runtimeRoot, sessionRoot, controlRoot, resolveAccount: async (id) => id,
      [syntheticSessionHooks]: { onStage(stage) {
        if (stage !== armed) return;
        // The parent has already authorized this exact phase via IPC. A synchronous
        // pipe marker is observable before self-SIGKILL, even inside a SQLite call.
        writeSync(1, JSON.stringify({ runId, stage }) + '\n');
        process.kill(process.pid, 'SIGKILL');
      } },
    });
    if (!store.readiness()) {
      void store.close().catch(() => {}).finally(() => send('DENIED', disconnect));
      return;
    }
  } catch {
    send('DENIED', disconnect);
    return;
  }
  let handling = false;
  process.on('disconnect', () => {
    if (!handling) void store.close().catch(() => { process.exitCode = 1; });
  });
  process.on('message', async (message) => {
    if (handling || !message || typeof message !== 'object' || !('runId' in message) ||
        message.runId !== runId || !('kind' in message)) return;
    if (message.kind === 'ARM_CRASH' && !armed && 'stage' in message && typeof message.stage === 'string' && crashPhases.includes(message.stage)) {
      armed = message.stage;
      send('ARMED');
      return;
    }
    if ((message.kind === 'MUTATE' || message.kind === 'DELETE') && armed) {
      handling = true;
      try {
        if (message.kind === 'DELETE') await store.deleteAccount(accountA, accountB, () => true, () => {});
        else await login(store, 1);
      } catch { /* The authorized phase must SIGKILL. */ }
      process.exitCode = 1;
      try { await store.close(); } catch { /* Keep the nonzero exit code. */ }
      if (process.connected) send('MISSED_PHASE', disconnect);
      return;
    }
    if (message.kind === 'CRASH') {
      handling = true;
      send('CRASH_ACCEPTED', (error) => {
        if (!error) process.kill(process.pid, 'SIGKILL');
        else {
          process.exitCode = 1;
          if (process.connected) disconnect();
        }
      });
      return;
    }
    if (message.kind !== 'CLOSE') return;
    handling = true;
    try {
      await store.close();
      send('CLOSED', disconnect);
    } catch {
      process.exitCode = 1;
      if (process.connected) send('DENIED', disconnect);
    }
  });
  send('READY');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) worker();
