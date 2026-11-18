import { performance } from 'node:perf_hooks';
import { types } from 'node:util';
import {
  initializeAuthority, isCounter, newSessionId, nextCounter, reopenAuthority,
  safeFault, sessionErrors, sessionFault, syntheticSessionHooks, transaction,
} from './session-recovery-authority.mjs';

/**
 * @typedef {import('./session-recovery-authority.mjs').AuthorityOptions & {
 *   resolveAccount:(accountId:string,signal:AbortSignal)=>Promise<string|null>|string|null,
 *   wallClock?:()=>number, testTtlMs?:number,
 *   [syntheticSessionHooks]?:{onStage?:(stage:string)=>void,monotonic?:()=>number}
 * }} StoreOptions
 * @typedef {ReturnType<typeof settings>} StoreSettings
 * @typedef {import('./session-recovery-authority.mjs').Authority} Authority
 * @typedef {import('./session-recovery-authority.mjs').ControlRow} ControlRow
 * @typedef {import('./session-recovery-authority.mjs').AccountDeletion} AccountDeletion
 * @typedef {{token_digest:string,account_id:string,expires_at:number,lease_version:number,
 *   auth_generation:number,status:'active'|'revoked'}} SessionRow
 * @typedef {{identity:object,accountId:string,expiresAt:number}} Lease
 * @typedef {{kind:'current',lease:Lease}|{kind:'invalid'}|{kind:'unavailable'}} LookupOutcome
 */
const maxTtl = 28_800_000;
const retention = 86_400_000;
const queueLimit = 64;
const queueWaitMs = 250;
const budgetMs = 1000;
const walThreshold = 8 * 1024 * 1024;
/** @param {number} bytes */
export function walAtCapacity(bytes) {
  return bytes >= walThreshold;
}
const activeLimit = 10_000;
const rowLimit = 20_000;
const batchSize = 256;
const invalidLookup = Object.freeze({ kind: 'invalid' });
const unavailableLookup = Object.freeze({ kind: 'unavailable' });
const digestPattern = /^[0-9a-f]{64}$/;
const accountPattern = /^[0-9a-f]{32}$/;
const invalid = () => sessionFault(sessionErrors.invalid);
const conflict = () => sessionFault(sessionErrors.conflict);
const unavailable = () => sessionFault(sessionErrors.unavailable);
const capacity = () => sessionFault(sessionErrors.capacity);
const fenced = () => sessionFault(sessionErrors.fenced);
/**
 * @param {unknown} digest
 * @returns {digest is string}
 */
const isDigest = (digest) => typeof digest === 'string' && digestPattern.test(digest);
/**
 * @param {unknown} accountId
 * @returns {accountId is string}
 */
const isAccount = (accountId) => typeof accountId === 'string' && accountPattern.test(accountId);

/** @param {StoreOptions} options */
function settings(options) {
  // These are trusted local bootstrap arguments. They are never read from an HTTP request.
  const { runtimeRoot, sessionRoot, controlRoot, resolveAccount, wallClock = Date.now, testTtlMs = maxTtl } = options;
  if (typeof resolveAccount !== 'function' || typeof wallClock !== 'function' ||
      !Number.isSafeInteger(testTtlMs) || testTtlMs < 1 || testTtlMs > maxTtl) throw invalid();
  const { onStage, monotonic = () => performance.now() } = options[syntheticSessionHooks] ?? {};
  if ((onStage !== undefined && typeof onStage !== 'function') || typeof monotonic !== 'function') throw invalid();
  return Object.freeze({ runtimeRoot, sessionRoot, controlRoot, resolveAccount, wallClock, testTtlMs,
    [syntheticSessionHooks]: Object.freeze({ onStage, monotonic }) });
}

/**
 * @param {StoreOptions} options
 * @param {(config:StoreSettings)=>Authority} authorityFactory
 */
function open(options, authorityFactory) {
  let authority;
  try {
    const config = settings(options);
    authority = authorityFactory(config);
    return createStore(authority, config);
  } catch (error) {
    if (authority) {
      authority.fence();
      try { authority.closeDenied(); } catch { /* Preserve the original closed failure. */ }
    }
    throw safeFault(error);
  }
}

/** @param {StoreOptions} options */
export function initializeFresh(options) {
  return open(options, initializeAuthority);
}

// Only the offline authority can supply a one-use activation holding the same lock.
/**
 * @param {StoreOptions} options
 * @param {object} [activation]
 */
export function openExisting(options, activation) {
  return open(options, (config) => reopenAuthority(config, activation));
}

/**
 * @param {Authority} authority
 * @param {StoreSettings} config
 */
function createStore(authority, config) {
  const { db } = authority;
  /** @type {Map<string,{accountId:string,generation:number,version:number,identity:object}>} */
  const identities = new Map();
  /** @type {Array<{started:number,enqueued:number,run:()=>void,reject:(error:Error)=>void}>} */
  const waiting = [];
  /** @type {Set<Promise<LookupOutcome>>} */
  const lookups = new Set();
  /** @type {Set<Promise<unknown>>} */
  const guardChecks = new Set();
  /** @type {Set<AbortController>} */
  const resolverCalls = new Set();
  const { monotonic, onStage } = config[syntheticSessionHooks];
  let running = false;
  let closing = false;
  /** @type {Promise<void>|undefined} */
  let closeResult;
  let fault = false;
  let highWater = 0;
  /** @type {(()=>void)|undefined} */
  let drained;
  const statements = {
    row: db.prepare('SELECT * FROM sessions WHERE token_digest=?'),
    cleanup: db.prepare('SELECT token_digest FROM sessions WHERE retain_until <= ? ORDER BY retain_until, token_digest LIMIT ?'),
    erase: db.prepare('DELETE FROM sessions WHERE token_digest=? AND retain_until <= ?'),
    active: db.prepare("SELECT count(*) AS total FROM sessions WHERE status='active' AND expires_at > ?"),
    total: db.prepare('SELECT count(*) AS total FROM sessions'),
    revoke: db.prepare(`
      UPDATE sessions SET status='revoked', revoked_at=?, lease_version=?
      WHERE token_digest=? AND account_id=? AND auth_generation=? AND lease_version=?
        AND status='active' AND expires_at>?
    `),
    insert: db.prepare(`
      INSERT INTO sessions(token_digest, account_id, issued_at, expires_at, lease_version,
        auth_generation, status, revoked_at) VALUES (?, ?, ?, ?, 1, ?, 'active', NULL)
    `),
    advance: db.prepare('UPDATE session_meta SET commit_seq=?, last_op_id=? WHERE singleton=1 AND commit_seq=?'),
  };

  function latch() {
    fault = true;
    authority.fence();
  }

  function healthy() {
    if (fault) throw fenced();
    try {
      return authority.stable();
    } catch (error) {
      latch();
      throw safeFault(error);
    }
  }

  function checkWal() {
    let size;
    try { size = authority.walBytes(); } catch (error) {
      latch();
      throw safeFault(error);
    }
    if (walAtCapacity(size)) throw unavailable();
  }

  /** @param {ControlRow} binding */
  function clock(binding) {
    let now;
    try { now = config.wallClock(); } catch { latch(); throw fenced(); }
    if (!isCounter(now) || now < Math.max(highWater, binding.last_auth_wall_ms)) {
      latch();
      throw fenced();
    }
    highWater = now;
    return now;
  }

  /** @param {number} now */
  function checkpointClock(now) {
    try { authority.saveClock(now); } catch (error) {
      latch();
      throw safeFault(error);
    }
  }

  /** @param {number} started */
  function beforeDeadline(started) {
    if (monotonic() - started >= budgetMs) throw unavailable();
  }

  function schedule() {
    if (running || waiting.length === 0) return;
    running = true;
    queueMicrotask(() => {
      const job = waiting.shift();
      if (!job) { running = false; return; }
      try {
        const now = monotonic();
        if (closing || now - job.enqueued >= queueWaitMs || now - job.started >= budgetMs) throw unavailable();
        job.run();
      } catch (error) {
        job.reject(safeFault(error));
      } finally {
        running = false;
        if (waiting.length) schedule();
        else drained?.();
      }
    });
  }

  /**
   * @template T
   * @param {number} started
   * @param {()=>T} action
   * @returns {Promise<T>}
   */
  function enqueue(started, action) {
    if (closing || fault) return Promise.reject(fault ? fenced() : unavailable());
    // Account lookups awaiting the trusted resolver reserve their recheck slot.
    const pending = Math.max(0, waiting.length - (running ? 1 : 0)) + resolverCalls.size;
    if (pending >= queueLimit) return Promise.reject(capacity());
    return new Promise((resolve, reject) => {
      waiting.push({ started, enqueued: monotonic(), run: () => resolve(action()), reject });
      schedule();
    });
  }

  /**
   * @param {SessionRow|null|undefined} row
   * @param {ControlRow} binding
   * @param {number} now
   */
  function isLive(row, binding, now) {
    return row?.status === 'active' && row.auth_generation === binding.generation && row.expires_at > now;
  }

  /** @param {SessionRow} row */
  function identityFor(row) {
    let entry = identities.get(row.token_digest);
    if (!entry || entry.accountId !== row.account_id ||
        entry.generation !== row.auth_generation || entry.version !== row.lease_version) {
      entry = { accountId: row.account_id, generation: row.auth_generation, version: row.lease_version,
        identity: Object.freeze(Object.create(null)) };
      identities.set(row.token_digest, entry);
    }
    return entry.identity;
  }

  /** @param {string} digest */
  function readRow(digest) {
    try {
      return /** @type {SessionRow|undefined} */ (statements.row.get(digest));
    } catch (error) {
      latch();
      throw safeFault(error);
    }
  }

  /**
   * @param {string} digest
   * @param {number} started
   */
  function snapshotLease(digest, started) {
    const binding = healthy();
    checkWal();
    const row = readRow(digest);
    const now = clock(binding);
    if (!row || !isLive(row, binding, now)) {
      identities.delete(digest);
      if (row && row.expires_at <= now) checkpointClock(now);
      return null;
    }
    if (accountFences(row.account_id).length) return null;
    beforeDeadline(started);
    return row;
  }

  /**
   * @param {string} accountId
   * @param {number} started
   */
  async function resolveWithinBudget(accountId, started) {
    const remaining = budgetMs - (monotonic() - started);
    if (remaining <= 0) return unavailableLookup;
    const controller = new AbortController();
    // Give the resolver only a primitive account ID and a cancellation signal.
    // Its eventual settlement only releases accounting. The race owns the recheck.
    resolverCalls.add(controller);
    const call = Promise.resolve()
      .then(() => controller.signal.aborted ? unavailableLookup : config.resolveAccount(accountId, controller.signal))
      .catch(() => unavailableLookup)
      .finally(() => resolverCalls.delete(controller));
    /** @type {(()=>void)|undefined} */
    let stop;
    /** @type {Promise<typeof unavailableLookup>} */
    const cancelled = new Promise((resolve) => {
      stop = () => resolve(unavailableLookup);
      controller.signal.addEventListener('abort', stop, { once: true });
    });
    const timer = setTimeout(() => controller.abort(), Math.ceil(remaining));
    try {
      return await Promise.race([call, cancelled]);
    } finally {
      clearTimeout(timer);
      if (stop) controller.signal.removeEventListener('abort', stop);
    }
  }

  // The guard-facing method preserves lease-or-null. Only the private
  // server bridge uses this per-call outcome for matching HTTP error semantics.
  /**
   * @param {unknown} digest
   * @returns {Promise<LookupOutcome>}
   */
  function lookupOutcome(digest) {
    if (closing || fault) return Promise.resolve(unavailableLookup);
    if (!isDigest(digest)) return Promise.resolve(invalidLookup);
    const started = monotonic();
    const acquired = enqueue(started, () => snapshotLease(digest, started));
    /** @type {Promise<LookupOutcome>} */
    const operation = (async () => {
      try {
        const observed = await acquired;
        if (closing || fault) return unavailableLookup;
        if (!observed) return invalidLookup;
        if (Math.max(0, waiting.length - (running ? 1 : 0)) + resolverCalls.size >= queueLimit) return unavailableLookup;
        const confirmed = await resolveWithinBudget(observed.account_id, started);
        if (confirmed === unavailableLookup || closing || fault) return unavailableLookup;
        if (confirmed !== observed.account_id) return invalidLookup;
        const lease = await enqueue(started, () => {
          const row = snapshotLease(digest, started);
          if (!row || row.account_id !== observed.account_id || row.lease_version !== observed.lease_version ||
              row.auth_generation !== observed.auth_generation || row.expires_at !== observed.expires_at) return null;
          checkpointClock(highWater);
          const finalClock = clock(healthy());
          if (finalClock >= row.expires_at) {
            identities.delete(digest);
            checkpointClock(finalClock);
            return null;
          }
          beforeDeadline(started);
          return Object.freeze({ identity: identityFor(row), accountId: row.account_id, expiresAt: row.expires_at });
        });
        if (closing || fault) return unavailableLookup;
        beforeDeadline(started);
        return lease ? Object.freeze({ kind: 'current', lease }) : invalidLookup;
      } catch {
        return unavailableLookup;
      }
    })();
    lookups.add(operation);
    void operation.then(() => lookups.delete(operation));
    return operation;
  }

  /** @param {unknown} digest */
  async function lookupCurrent(digest) {
    const outcome = await lookupOutcome(digest);
    return !closing && !fault && outcome.kind === 'current' ? outcome.lease : null;
  }

  // The HTTP bridge supplies a trusted, synchronous write of a prepared response.
  // Its return means only that Node accepted the write, never that a peer received it.
  /**
   * @param {string} digest
   * @param {Partial<Lease>} expected
   * @param {()=>boolean} write
   * @param {(accountId:string)=>boolean} [accountExists]
   */
  function deliverCurrent(digest, expected, write, accountExists) {
    const started = monotonic();
    return enqueue(started, () => {
      const row = snapshotLease(digest, started);
      const captured = identities.get(digest);
      if (!row || !captured || captured.identity !== expected.identity ||
          captured.generation !== row.auth_generation || captured.version !== row.lease_version ||
          row.account_id !== expected.accountId || row.expires_at !== expected.expiresAt) return 'invalid';
      if (accountExists && accountExists(row.account_id) !== true) return 'invalid';
      checkpointClock(highWater);
      const finalClock = clock(healthy());
      if (finalClock >= row.expires_at) {
        identities.delete(digest);
        checkpointClock(finalClock);
        return 'invalid';
      }
      beforeDeadline(started);
      if (closing || fault) throw unavailable();
      if (!write()) return 'closed';
      onStage?.('delivery-queued');
      return 'queued';
    });
  }

  /** @param {number} expiredAt */
  function recordExpiry(expiredAt) {
    if (!isCounter(expiredAt) || fault) return Promise.reject(unavailable());
    // G1a's unchanged guard may observe expiry without calling its resolver.
    // Remember its proved floor even if the wall clock moves before this job runs.
    highWater = Math.max(highWater, expiredAt);
    // A guard already running at close belongs to the drain. Do not enqueue
    // new work. closeClean persists this floor only after that guard settles.
    if (closing) return Promise.resolve();
    const started = monotonic();
    return enqueue(started, () => {
      healthy();
      checkpointClock(highWater);
      checkpointClock(clock(healthy()));
    }).catch((error) => {
      if (!closing) latch();
      throw safeFault(error);
    });
  }

  /**
   * @template T
   * @param {(recordExpiry:(expiresAt:number)=>Promise<void>)=>Promise<T>} check
   */
  function trackGuard(check) {
    if (closing || fault) return Promise.reject(unavailable());
    const operation = Promise.resolve().then(() => {
      if (closing || fault) throw unavailable();
      return check(recordExpiry);
    });
    guardChecks.add(operation);
    const forget = () => guardChecks.delete(operation);
    void operation.then(forget, forget);
    return operation;
  }

  /**
   * @param {number} started
   * @param {ControlRow} binding
   * @param {()=>void} action
   * @param {AccountDeletion} [deletion]
   */
  function mutate(started, binding, action, deletion) {
    checkWal();
    beforeDeadline(started);
    let prepared;
    let opId;
    let seq;
    try {
      opId = newSessionId();
      seq = nextCounter(binding.committed_seq);
      prepared = authority.prepare(binding, opId, seq, () => monotonic() - started < budgetMs, deletion);
    } catch (error) {
      latch();
      throw safeFault(error);
    }
    if (!prepared) throw unavailable(); // The control transaction proved it made no update.
    try {
      onStage?.('prepared');
      beforeDeadline(started);
      transaction(db, () => {
        action();
        if (statements.advance.run(seq, opId, binding.committed_seq).changes !== 1) throw fenced();
        onStage?.('before-session-commit');
        beforeDeadline(started);
      });
      onStage?.('session-committed');
      beforeDeadline(started);
      const now = clock(binding);
      authority.finish(binding, opId, seq, now);
      // If confirmation came after the budget, the outcome at the deadline was not known.
      beforeDeadline(started);
      onStage?.('stable');
    } catch (error) {
      latch();
      throw safeFault(error);
    }
  }

  /** @param {number} now */
  function cleanupCandidates(now) {
    try {
      return statements.cleanup.all(now, batchSize).map(row => {
        if (!isDigest(row.token_digest)) throw fenced();
        return row.token_digest;
      });
    } catch (error) {
      latch();
      throw safeFault(error);
    }
  }

  /**
   * @param {string[]} eligible
   * @param {number} now
   */
  function removeExpired(eligible, now) {
    for (const digest of eligible) {
      if (statements.erase.run(digest, now).changes !== 1) throw fenced();
    }
  }

  /**
   * @param {number} now
   * @param {boolean} replacing
   * @param {number} removing
   */
  function effectiveCapacity(now, replacing, removing) {
    const active = statements.active.get(now)?.total;
    const total = statements.total.get()?.total;
    if (!isCounter(active) || !isCounter(total)) throw fenced();
    return active + (replacing ? 0 : 1) <= activeLimit && total - removing + 1 <= rowLimit;
  }

  /**
   * @param {SessionRow} row
   * @param {number} now
   */
  function revoke(row, now) {
    const version = nextCounter(row.lease_version);
    if (!isCounter(now + retention) || statements.revoke.run(now, version, row.token_digest,
      row.account_id, row.auth_generation, row.lease_version, now).changes !== 1) throw fenced();
  }

  /** @param {number} started */
  function observe(started) {
    const binding = healthy();
    checkWal();
    beforeDeadline(started);
    return { binding, now: clock(binding) };
  }

  /**
   * @param {unknown} record
   * @param {string} name
   * @returns {unknown}
   */
  function field(record, name) {
    if (!record || typeof record !== 'object' || types.isProxy(record)) throw invalid();
    const descriptor = Object.getOwnPropertyDescriptor(record, name);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw invalid();
    return descriptor.value;
  }

  /** @param {unknown} command */
  function replaceCurrent(command) {
    // The caller is the trusted local password boundary. Capture primitive fields and
    // the opaque lease identity synchronously, before the command enters the queue.
    const started = monotonic();
    let input;
    try {
      const digest = field(command, 'digest');
      const accountId = field(command, 'accountId');
      const expected = field(command, 'expected');
      const previousDigest = expected === null ? null : field(expected, 'digest');
      const previousIdentity = expected === null ? null : field(expected, 'identity');
      if (!isDigest(digest) || !isAccount(accountId) ||
          (previousDigest !== null && !isDigest(previousDigest)) ||
          (expected !== null && (previousDigest === null || !previousIdentity ||
            typeof previousIdentity !== 'object' || types.isProxy(previousIdentity)))) throw invalid();
      input = Object.freeze({ digest, accountId, previousDigest, previousIdentity });
    } catch (error) {
      return Promise.reject(safeFault(error));
    }
    return enqueue(started, () => {
      const { binding, now } = observe(started);
      const { digest, accountId, previousDigest, previousIdentity } = input;
      const expiresAt = now + config.testTtlMs;
      if (!isCounter(expiresAt) || !isCounter(expiresAt + retention)) {
        latch();
        throw fenced();
      }
      const previous = previousDigest === null ? null : readRow(previousDigest);
      if (previousDigest !== null) {
        const captured = identities.get(previousDigest);
        if (!previous || !isLive(previous, binding, now) || !captured || captured.identity !== previousIdentity ||
            captured.accountId !== previous.account_id || captured.version !== previous.lease_version ||
            captured.generation !== previous.auth_generation ||
            accountFences(previous.account_id).length) throw conflict();
      }
      if (accountFences(accountId).length) throw invalid();
      if (readRow(digest)) throw conflict();
      const eligible = cleanupCandidates(now);
      let fits;
      try { fits = effectiveCapacity(now, previous !== null, eligible.length); } catch (error) {
        latch();
        throw safeFault(error);
      }
      if (!fits) throw capacity();
      mutate(started, binding, () => {
        if (!effectiveCapacity(now, previous !== null, eligible.length)) throw fenced();
        removeExpired(eligible, now);
        if (previous) revoke(previous, now);
        if (statements.insert.run(digest, accountId, now, expiresAt, binding.generation).changes !== 1) throw fenced();
      });
      if (previous) identities.delete(previous.token_digest);
      for (const removed of eligible) identities.delete(removed);
      const deliveryTime = clock(healthy());
      if (deliveryTime >= expiresAt) {
        checkpointClock(deliveryTime);
        throw invalid();
      }
      beforeDeadline(started);
      return Object.freeze({ expiresAt });
    });
  }

  /**
   * @param {string} accountId
   * @param {string} [operationId]
   */
  function accountFences(accountId, operationId) {
    try {
      return authority.accountFence(accountId, operationId);
    } catch (error) {
      latch();
      throw safeFault(error);
    }
  }

  /**
   * @param {unknown} accountId
   * @param {unknown} operationId
   * @param {(accountId:string)=>boolean} currentAccount
   * @param {(accountId:string)=>void} removeAccount
   */
  function deleteAccount(accountId, operationId, currentAccount, removeAccount) {
    if (!isAccount(accountId) || !isAccount(operationId)) return Promise.reject(invalid());
    const started = monotonic();
    const deletion = Object.freeze({ accountId, operationId });
    return enqueue(started, () => {
      const { binding } = observe(started);
      const fences = accountFences(accountId, operationId);
      if (fences.length) {
        const [receipt] = fences;
        if (fences.length !== 1 || receipt.account_id !== accountId ||
            receipt.operation_id !== operationId) throw conflict();
      } else {
        if (currentAccount(accountId) !== true) throw invalid();
        mutate(started, binding, () => {}, deletion);
      }
      try {
        onStage?.('before-account-file-cleanup');
        removeAccount(accountId);
        checkpointClock(clock(healthy()));
        beforeDeadline(started);
      } catch (error) {
        latch();
        throw safeFault(error);
      }
    });
  }

  /** @param {unknown} digest */
  function revokeCurrent(digest) {
    if (digest !== null && !isDigest(digest)) return Promise.reject(invalid());
    const started = monotonic();
    return enqueue(started, () => {
      const { binding, now } = observe(started);
      if (digest === null) return;
      const row = readRow(digest);
      if (!row || !isLive(row, binding, now)) {
        if (row && row.expires_at <= now) checkpointClock(now);
        beforeDeadline(started);
        identities.delete(digest);
        return;
      }
      mutate(started, binding, () => revoke(row, now));
      identities.delete(digest);
      clock(healthy());
      beforeDeadline(started);
    });
  }

  function readiness() {
    if (closing || fault) return false;
    try {
      healthy();
      checkWal();
      return true;
    } catch {
      return false;
    }
  }

  function close() {
    if (closeResult) return closeResult;
    closing = true;
    const started = monotonic();
    let timedOut = false;
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timer;
    /** @type {Promise<never>} */
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { timedOut = true; reject(unavailable()); }, budgetMs);
    });
    const finish = Promise.resolve().then(async () => {
      for (const resolver of resolverCalls) resolver.abort();
      if (running || waiting.length) await new Promise((resolve) => { drained = () => resolve(undefined); });
      await Promise.all(lookups);
      await Promise.allSettled(guardChecks);
      // A detached resolver may still be running. Its signal only ends the lookup
      // wait and its late result cannot schedule a recheck or touch the authority.
      identities.clear();
      timedOut ||= monotonic() - started >= budgetMs;
      if (fault || timedOut) {
        try { authority.closeDenied(); } catch { /* Keep the safe failure category. */ }
        throw fault ? fenced() : unavailable();
      }
      try {
        authority.closeClean(clock(healthy()));
      } catch (error) {
        latch();
        try { authority.closeDenied(); } catch { /* Preserve the closed failure. */ }
        throw safeFault(error);
      }
    });
    // A timeout leaves admission disabled and the durable dirty marker intact.
    // Only the drain continuation closes the handles after work has settled.
    closeResult = Promise.race([finish, timeout]).finally(() => clearTimeout(timer));
    return closeResult;
  }

  const started = monotonic();
  const binding = healthy();
  const now = clock(binding);
  if (!walAtCapacity(authority.walBytes())) {
    const eligible = cleanupCandidates(now);
    if (eligible.length) mutate(started, binding, () => removeExpired(eligible, now));
  }
  return Object.freeze({ lookupCurrent, lookupOutcome, deliverCurrent, trackGuard, replaceCurrent, revokeCurrent, deleteAccount, readiness, close });
}
