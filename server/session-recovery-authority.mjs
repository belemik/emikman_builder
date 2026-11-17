import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync, constants, fsyncSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, readSync, realpathSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const rootParent = '/private/var/tmp';
const profile = 'zarya.session-store.local/v1';
const maxInteger = Number.MAX_SAFE_INTEGER;
let sessionSchema;
function schemaSource() {
  sessionSchema ??= readFileSync(new URL('./session-schema.sql', import.meta.url), 'utf8');
  return sessionSchema;
}

// Private bootstrap seam for the disposable C1 harness. Hooks receive phase labels only.
export const syntheticSessionHooks = Symbol('G1b C1 synthetic hooks');
/**
 * @typedef {{runtimeRoot:string, sessionRoot:string, controlRoot:string,
 *   [syntheticSessionHooks]?: {onStage?:(stage:string)=>void}}} AuthorityOptions
 * @typedef {ReturnType<typeof pathsOf>} AuthorityPaths
 * @typedef {ReturnType<typeof openControl>} Control
 * @typedef {ReturnType<typeof openSession>} OpenSession
 * @typedef {ReturnType<typeof createAuthority>} Authority
 * @typedef {{store_id:string, generation:number, committed_seq:number, committed_op_id:string|null}} Binding
 * @typedef {{profile_version:string, schema_version:number, store_id:string, generation:number,
 *   commit_seq:number, last_op_id:string|null}} SessionMeta
 * @typedef {Binding & {phase:'STABLE'|'PREPARED'|'FENCED'|'RESETTING', last_auth_wall_ms:number,
 *   clean_shutdown:0|1, pending_op_id:string|null, next_seq:number|null, reset_op_id:string|null,
 *   reset_generation:number|null, reset_store_id:string|null, last_reset_op_id:string|null}} ControlRow
 * @typedef {{store_id:string, generation:number, witness_state:'missing'|'corrupt'|'readable',
 *   witness_seq:number|null, witness_op_id:string|null, directory_inode:string|null,
 *   file_inode:string|null, corrupt_sha256:string|null}} RetiredRow
 * @typedef {{state:'missing'|'corrupt',seq:null,opId:null} |
 *   {state:'readable',generation:number,seq:number,opId:string|null}} Observation
 * @typedef {Observation & {directoryInode:string|null,fileInode:string|null,corruptHash:string|null}} Witness
 * @typedef {{accountId:string,operationId:string}} AccountDeletion
 */
/** @type {WeakMap<object,{control:Control,take:()=>Control}>} */
const activationHandles = new WeakMap();
const authoritySchema = `
  CREATE TABLE authority (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    profile_version TEXT NOT NULL CHECK (profile_version = 'zarya.session-store.local/v1'),
    schema_version INTEGER NOT NULL CHECK (schema_version = 1),
    store_id TEXT NOT NULL CHECK (length(store_id) = 32 AND store_id NOT GLOB '*[^0-9a-f]*'),
    generation INTEGER NOT NULL CHECK (generation BETWEEN 1 AND 9007199254740991),
    committed_seq INTEGER NOT NULL CHECK (committed_seq BETWEEN 0 AND 9007199254740991),
    committed_op_id TEXT,
    phase TEXT NOT NULL CHECK (phase IN ('STABLE', 'PREPARED', 'FENCED', 'RESETTING')),
    pending_op_id TEXT,
    next_seq INTEGER,
    last_auth_wall_ms INTEGER NOT NULL CHECK (last_auth_wall_ms BETWEEN 0 AND 9007199254740991),
    clean_shutdown INTEGER NOT NULL CHECK (clean_shutdown IN (0, 1)),
    reset_op_id TEXT,
    reset_generation INTEGER,
    reset_store_id TEXT,
    last_reset_op_id TEXT,
    CHECK ((committed_seq = 0) = (committed_op_id IS NULL)),
    CHECK ((pending_op_id IS NULL) = (next_seq IS NULL)),
    CHECK (next_seq IS NULL OR (committed_seq < 9007199254740991 AND next_seq = committed_seq + 1)),
    CHECK (phase <> 'PREPARED' OR pending_op_id IS NOT NULL),
    CHECK (phase <> 'STABLE' OR pending_op_id IS NULL),
    CHECK ((phase = 'RESETTING') = (reset_op_id IS NOT NULL)),
    CHECK ((reset_op_id IS NULL) = (reset_generation IS NULL)),
    CHECK ((reset_op_id IS NULL) = (reset_store_id IS NULL)),
    CHECK (reset_generation IS NULL OR (generation < 9007199254740991 AND reset_generation = generation + 1)),
    CHECK (clean_shutdown = 0 OR phase = 'STABLE')
  ) STRICT;
  CREATE TABLE account_fences (
    account_id TEXT PRIMARY KEY NOT NULL CHECK (length(account_id) = 32 AND account_id NOT GLOB '*[^0-9a-f]*'),
    operation_id TEXT UNIQUE NOT NULL CHECK (length(operation_id) = 32 AND operation_id NOT GLOB '*[^0-9a-f]*')
  ) STRICT;
  CREATE TABLE retired_session_stores (
    store_id TEXT PRIMARY KEY NOT NULL CHECK (length(store_id) = 32 AND store_id NOT GLOB '*[^0-9a-f]*'),
    generation INTEGER UNIQUE NOT NULL CHECK (generation BETWEEN 1 AND 9007199254740991),
    committed_seq INTEGER NOT NULL CHECK (committed_seq BETWEEN 0 AND 9007199254740991),
    committed_op_id TEXT CHECK (length(committed_op_id) = 32 AND committed_op_id NOT GLOB '*[^0-9a-f]*'),
    next_seq INTEGER,
    pending_op_id TEXT CHECK (length(pending_op_id) = 32 AND pending_op_id NOT GLOB '*[^0-9a-f]*'),
    witness_state TEXT NOT NULL CHECK (witness_state IN ('readable', 'corrupt', 'missing')),
    directory_inode TEXT,
    file_inode TEXT,
    corrupt_sha256 TEXT CHECK (length(corrupt_sha256) = 64 AND corrupt_sha256 NOT GLOB '*[^0-9a-f]*'),
    witness_seq INTEGER CHECK (witness_seq BETWEEN 0 AND 9007199254740991),
    witness_op_id TEXT CHECK (length(witness_op_id) = 32 AND witness_op_id NOT GLOB '*[^0-9a-f]*'),
    CHECK ((committed_seq = 0) = (committed_op_id IS NULL)),
    CHECK ((next_seq IS NULL) = (pending_op_id IS NULL)),
    CHECK (next_seq IS NULL OR (committed_seq < 9007199254740991 AND next_seq = committed_seq + 1)),
    CHECK ((witness_state = 'missing') = (file_inode IS NULL)),
    CHECK (directory_inode IS NOT NULL OR file_inode IS NULL),
    CHECK ((witness_state = 'corrupt') = (corrupt_sha256 IS NOT NULL)),
    CHECK ((witness_state = 'readable') = (witness_seq IS NOT NULL)),
    CHECK (witness_seq IS NULL OR witness_seq < committed_seq OR
      (witness_seq = committed_seq AND witness_op_id IS committed_op_id) OR
      (next_seq IS NOT NULL AND witness_seq = next_seq AND witness_op_id IS pending_op_id)),
    CHECK ((witness_seq IS NULL OR witness_seq = 0) = (witness_op_id IS NULL))
  ) STRICT;
`;

export const sessionErrors = Object.freeze({
  invalid: 'SESSION_INVALID',
  conflict: 'ROTATION_CONFLICT',
  fenced: 'AUTHORITY_FENCED',
  unavailable: 'STORE_UNAVAILABLE',
  capacity: 'QUEUE_CAPACITY',
  schema: 'STORE_SCHEMA_UNSUPPORTED',
});

class SessionFault extends Error {
  /** @param {string} code */
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** @param {string} code */
export function sessionFault(code) {
  return new SessionFault(code);
}

/** @param {unknown} error */
export function safeFault(error) {
  return error instanceof SessionFault ? error : sessionFault(sessionErrors.unavailable);
}

const unavailable = () => sessionFault(sessionErrors.unavailable);
const schemaFault = () => sessionFault(sessionErrors.schema);
const fenced = () => sessionFault(sessionErrors.fenced);
/**
 * @param {unknown} value
 * @returns {value is string}
 */
const validId = (value) => typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
export const newSessionId = () => randomBytes(16).toString('hex');
/**
 * @param {unknown} value
 * @returns {value is number}
 */
export const isCounter = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
/** @param {number} value */
export function nextCounter(value) {
  if (!isCounter(value) || value === maxInteger) throw fenced();
  return value + 1;
}

/**
 * @param {string} path
 * @param {'dir'|'file'} kind
 * @param {number} dev
 */
function owned(path, kind, dev) {
  const info = lstatSync(path);
  const mode = info.mode & 0o7777;
  const valid = kind === 'dir'
    ? info.isDirectory() && mode === 0o700
    : info.isFile() && mode === 0o600 && info.nlink === 1;
  if (!valid || info.dev !== dev || info.uid !== process.getuid?.() || realpathSync(path) !== path) {
    throw unavailable();
  }
  return info;
}

/**
 * @param {string} path
 * @param {number} dev
 */
function optionalFile(path, dev) {
  try {
    return owned(path, 'file', dev);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * @param {string} path
 * @param {number} dev
 */
function checkSidecars(path, dev) {
  let present = false;
  for (const suffix of ['-wal', '-shm', '-journal']) {
    if (optionalFile(path + suffix, dev)) present = true;
  }
  return present;
}

// Only a disposable local C1 sandbox on the qualified local /private/var/tmp volume.
/** @param {AuthorityOptions} options */
function pathsOf(options) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64' ||
      process.version !== 'v26.13.0' || process.versions.sqlite !== '3.54.0') throw unavailable();
  const { runtimeRoot, sessionRoot, controlRoot } = options;
  if (typeof runtimeRoot !== 'string' || dirname(runtimeRoot) !== rootParent ||
      !/^zarya-g1b-c1-[A-Za-z0-9-]+$/.test(basename(runtimeRoot)) ||
      sessionRoot !== join(runtimeRoot, 'session-data') || controlRoot !== join(runtimeRoot, 'recovery-control')) {
    throw unavailable();
  }
  const approvedVolume = lstatSync('/private/var/tmp/zarya-g1b-cp0');
  const { dev } = lstatSync(rootParent);
  if (!approvedVolume.isDirectory() || approvedVolume.dev !== dev ||
      approvedVolume.uid !== process.getuid?.() || (approvedVolume.mode & 0o7777) !== 0o700) throw unavailable();
  owned(runtimeRoot, 'dir', dev);
  owned(sessionRoot, 'dir', dev);
  owned(controlRoot, 'dir', dev);
  return Object.freeze({ runtimeRoot, sessionRoot, controlRoot, dev,
    controlFile: join(controlRoot, 'authority.sqlite'), lockFile: join(controlRoot, 'authority-lock.sqlite') });
}

/** @param {string} path */
function syncPath(path, directory = false) {
  const flags = constants.O_RDONLY | constants.O_NOFOLLOW | (directory ? constants.O_DIRECTORY : 0);
  const fd = openSync(path, flags);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** @param {string} path */
function createFile(path, durable = false) {
  const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try {
    if (durable) fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * @param {DatabaseSync} db
 * @param {string} name
 */
function pragma(db, name) {
  return Object.values(db.prepare('PRAGMA ' + name).get() ?? {})[0];
}

/**
 * @param {string} path
 * @param {number} dev
 * @param {'DELETE'|'WAL'} journal
 * @param {number} pages
 */
function connect(path, dev, journal, pages, fresh = false) {
  if (fresh) createFile(path, true);
  const original = owned(path, 'file', dev);
  checkSidecars(path, dev);
  const db = new DatabaseSync(path, { allowExtension: false, enableDoubleQuotedStringLiterals: false });
  try {
    db.exec('PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=100');
    if (fresh) db.exec('PRAGMA page_size=4096; PRAGMA journal_mode=' + journal);
    if (pragma(db, 'page_size') !== 4096 || pragma(db, 'journal_mode') !== journal.toLowerCase()) throw schemaFault();
    db.exec('PRAGMA synchronous=' + (journal === 'WAL' ? 'FULL' : 'EXTRA'));
    const pageCount = pragma(db, 'page_count');
    if (pragma(db, 'synchronous') !== (journal === 'WAL' ? 2 : 3) ||
        pragma(db, 'busy_timeout') !== 100 ||
        pragma(db, 'max_page_count=' + pages) !== pages || !isCounter(pageCount) || pageCount > pages) throw unavailable();
    assertFileIdentity(path, original, dev);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

/**
 * @template T
 * @param {DatabaseSync} db
 * @param {()=>T} action
 */
export function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = action();
    db.exec('COMMIT');
    return value;
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

const schemaSql = 'SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name';
/** @param {DatabaseSync} db */
const dbSchema = (db) => JSON.stringify(db.prepare(schemaSql).all());
/** @type {{authority:string,session:string}|undefined} */
let expected;
/**
 * @param {DatabaseSync} db
 * @param {'authority'|'session'} which
 */
function checkSchema(db, which) {
  if (!expected) {
    const expectedDb = new DatabaseSync(':memory:', { allowExtension: false });
    try {
      expectedDb.exec(authoritySchema);
      const authority = dbSchema(expectedDb);
      expectedDb.exec('DROP TABLE retired_session_stores; DROP TABLE account_fences; DROP TABLE authority; ' + schemaSource());
      expected = { authority, session: dbSchema(expectedDb) };
    } finally {
      expectedDb.close();
    }
  }
  if (dbSchema(db) !== expected[which]) throw schemaFault();
}

/** @param {DatabaseSync} db */
function checkIntegrity(db, full = false) {
  const check = db.prepare(full ? 'PRAGMA integrity_check' : 'PRAGMA quick_check').all();
  if (check.length !== 1 || Object.values(check[0])[0] !== 'ok') throw schemaFault();
}

/**
 * @param {DatabaseSync} db
 * @returns {SessionMeta}
 */
export function readSessionMeta(db) {
  const meta = db.prepare('SELECT * FROM session_meta WHERE singleton = 1').get();
  if (!meta) throw schemaFault();
  // The caller validates the exact session schema before accepting its metadata.
  return /** @type {SessionMeta} */ (meta);
}

/**
 * @param {DatabaseSync} db
 * @returns {ControlRow}
 */
function validateControl(db) {
  const row = db.prepare('SELECT * FROM authority WHERE singleton = 1').get();
  if (!row || row.profile_version !== profile || row.schema_version !== 1 || !validId(row.store_id) ||
      !isCounter(row.generation) || row.generation === 0 || !isCounter(row.committed_seq) ||
      !isCounter(row.last_auth_wall_ms) || (row.clean_shutdown !== 0 && row.clean_shutdown !== 1) ||
      typeof row.phase !== 'string' || !['STABLE', 'PREPARED', 'FENCED', 'RESETTING'].includes(row.phase) ||
      [row.committed_op_id, row.pending_op_id, row.last_reset_op_id, row.reset_op_id, row.reset_store_id]
        .some((id) => id !== null && !validId(id))) throw schemaFault();
  // The exact checked schema supplies the remaining nullable columns.
  return /** @type {ControlRow} */ (row);
}

/**
 * @param {AuthorityPaths} paths
 * @param {boolean} fresh
 */
function configureLock(paths, fresh) {
  // A raw descriptor close on this inode drops process-wide POSIX SQLite locks.
  // Finish all raw file operations before the SQLite connection is opened.
  const lock = connect(paths.lockFile, paths.dev, 'DELETE', 2048, fresh);
  try {
    lock.exec('BEGIN EXCLUSIVE');
    const identity = owned(paths.lockFile, 'file', paths.dev);
    return { lock, identity };
  } catch (error) {
    lock.close();
    throw error;
  }
}

/**
 * @param {string} path
 * @param {import('node:fs').Stats} original
 * @param {number} dev
 */
function assertFileIdentity(path, original, dev) {
  if (owned(path, 'file', dev).ino !== original.ino) throw fenced();
  checkSidecars(path, dev);
}

/**
 * @param {AuthorityPaths} paths
 * @param {string} storeId
 */
function sessionFile(paths, storeId) {
  if (!validId(storeId)) throw schemaFault();
  return join(paths.sessionRoot, storeId, 'session.sqlite');
}

/**
 * @param {SessionMeta} meta
 * @param {Binding} binding
 */
function verifyBinding(meta, binding) {
  if (meta.profile_version !== profile || meta.schema_version !== 1 ||
      meta.store_id !== binding.store_id || meta.generation !== binding.generation ||
      meta.commit_seq !== binding.committed_seq || meta.last_op_id !== binding.committed_op_id) throw fenced();
}

// Retained stores witness rollback. Only a completed reset, recorded in the
// same control transaction as its new binding, can certify a retired store.
/**
 * @param {AuthorityPaths} paths
 * @param {string} name
 * @returns {Witness}
 */
function observeSessionWitness(paths, name) {
  const path = sessionFile(paths, name);
  const directory = owned(dirname(path), 'dir', paths.dev);
  if (readdirSync(dirname(path)).some(name => !/^session\.sqlite(?:-(?:wal|shm|journal))?$/.test(name))) throw fenced();
  const original = optionalFile(path, paths.dev);
  const hasSidecars = checkSidecars(path, paths.dev);
  if (hasSidecars && !original) throw fenced();
  let db;
  /** @type {Observation} */
  let observation = { state: 'missing', seq: null, opId: null };
  let corruptHash = null;
  try {
    if (original) {
      db = new DatabaseSync(path, { readOnly: true, allowExtension: false });
      db.exec('PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=100');
      checkSchema(db, 'session');
      const witness = readSessionMeta(db);
      if (witness.profile_version !== profile || witness.schema_version !== 1 ||
          witness.store_id !== name || !isCounter(witness.generation) || witness.generation === 0 ||
          !isCounter(witness.commit_seq) ||
          (witness.commit_seq === 0 ? witness.last_op_id !== null : !validId(witness.last_op_id))) throw fenced();
      observation = { state: 'readable', generation: witness.generation, seq: witness.commit_seq,
        opId: witness.last_op_id };
    }
  } catch (error) {
    // SQLite primary codes CORRUPT and NOTADB. Busy, I/O, permission and schema
    // failures do not certify that a known file is merely damaged.
    const code = error instanceof Error && 'errcode' in error ? error.errcode : undefined;
    if (typeof code !== 'number' || !Number.isInteger(code) || ![11, 26].includes(code & 255)) throw error;
    observation = { state: 'corrupt', seq: null, opId: null };
  } finally {
    db?.close();
  }
  if (observation.state === 'corrupt') {
    // A sidecar that cannot be interpreted could contain a newer witness.
    // Retain the whole directory and decline certification in that case.
    if (!original || hasSidecars || checkSidecars(path, paths.dev) || original.size > 32 * 1024 * 1024) throw fenced();
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = fstatSync(fd);
      if (!before.isFile() || before.dev !== original.dev || before.ino !== original.ino ||
          before.size !== original.size || before.nlink !== 1) throw fenced();
      const hash = createHash('sha256');
      const buffer = Buffer.allocUnsafe(64 * 1024);
      let consumed = 0;
      while (consumed < before.size) {
        const count = readSync(fd, buffer, 0, Math.min(buffer.length, before.size - consumed), null);
        if (!count) throw fenced();
        hash.update(buffer.subarray(0, count));
        consumed += count;
      }
      const after = fstatSync(fd);
      if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw fenced();
      corruptHash = hash.digest('hex');
    } finally {
      closeSync(fd);
    }
  }
  if (owned(dirname(path), 'dir', paths.dev).ino !== directory.ino) throw fenced();
  if (original) assertFileIdentity(path, original, paths.dev);
  else if (optionalFile(path, paths.dev)) throw fenced();
  return { ...observation, directoryInode: String(directory.ino),
    fileInode: original ? String(original.ino) : null, corruptHash };
}

/**
 * @param {Control} control
 * @param {ControlRow} row
 */
function rejectNewerSessionWitness(control, row) {
  const { paths } = control;
  const retired = new Map(/** @type {RetiredRow[]} */ (control.db.prepare('SELECT * FROM retired_session_stores').all())
    .map(entry => [entry.store_id, entry]));
  if (retired.size !== row.generation - 1 || retired.has(row.store_id) ||
      (row.reset_store_id !== null && retired.has(row.reset_store_id)) ||
      [...retired.values()].some(entry => entry.generation >= row.generation)) throw fenced();
  /** @type {Witness} */
  let current = { state: 'missing', seq: null, opId: null,
    directoryInode: null, fileInode: null, corruptHash: null };
  for (const name of readdirSync(paths.sessionRoot)) {
    const previous = retired.get(name);
    const isTarget = row.phase === 'RESETTING' && name === row.reset_store_id;
    if (!previous && name !== row.store_id && !isTarget) throw fenced();
    const witness = observeSessionWitness(paths, name);
    if (previous) {
      retired.delete(name);
      if (witness.state !== previous.witness_state || witness.directoryInode !== previous.directory_inode ||
          witness.fileInode !== previous.file_inode || witness.corruptHash !== previous.corrupt_sha256 ||
          witness.seq !== previous.witness_seq ||
          witness.opId !== previous.witness_op_id ||
          (witness.state === 'readable' && witness.generation !== previous.generation)) throw fenced();
    } else if (isTarget) {
      // An existing target must match the planned new empty binding. Publication
      // additionally checks integrity, rows, checkpoint and filesystem barriers.
      if (witness.state !== 'readable' || witness.generation !== row.reset_generation ||
          witness.seq !== 0 || witness.opId !== null) throw fenced();
    } else {
      if (witness.state === 'readable' &&
          (witness.generation !== row.generation ||
            (witness.seq === row.committed_seq && witness.opId !== row.committed_op_id) ||
            (witness.seq > row.committed_seq &&
              (witness.seq !== row.next_seq || witness.opId !== row.pending_op_id ||
                !['PREPARED', 'FENCED', 'RESETTING'].includes(row.phase))))) throw fenced();
      current = witness;
    }
  }
  if ([...retired.values()].some(entry => entry.directory_inode !== null)) throw fenced();
  return current;
}

/**
 * @param {AuthorityPaths} paths
 * @param {Binding} binding
 */
function openSession(paths, binding, empty = false) {
  const path = sessionFile(paths, binding.store_id);
  owned(dirname(path), 'dir', paths.dev);
  const db = connect(path, paths.dev, 'WAL', 8192);
  try {
    checkSchema(db, 'session');
    checkIntegrity(db, empty);
    verifyBinding(readSessionMeta(db), binding);
    if (empty && db.prepare('SELECT 1 FROM sessions LIMIT 1').get()) throw fenced();
    if (db.prepare('SELECT 1 FROM sessions WHERE auth_generation <> ? LIMIT 1').get(binding.generation)) throw fenced();
    return { db, path, identity: owned(path, 'file', paths.dev) };
  } catch (error) {
    db.close();
    throw error;
  }
}

/**
 * @param {AuthorityPaths} paths
 * @param {Binding} binding
 */
function createEmptySession(paths, binding, resume = false) {
  const path = sessionFile(paths, binding.store_id);
  let created = false;
  try {
    mkdirSync(dirname(path), { mode: 0o700 });
    created = true;
  } catch (error) {
    if ((error instanceof Error && 'code' in error ? error.code : undefined) !== 'EEXIST' || !resume) throw error;
  }
  owned(dirname(path), 'dir', paths.dev);
  if (created) {
    const db = connect(path, paths.dev, 'WAL', 8192, true);
    try {
      transaction(db, () => {
        db.exec(schemaSource());
        db.prepare('INSERT INTO session_meta VALUES (1, ?, 1, ?, ?, 0, NULL)')
          .run(profile, binding.store_id, binding.generation);
      });
    } finally {
      db.close();
    }
  }
  const { db } = openSession(paths, binding, true);
  try {
    const result = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    if (!result || result.busy !== 0 || result.log !== 0 || result.checkpointed !== 0) throw unavailable();
  } finally {
    db.close();
  }
  const reopened = openSession(paths, binding, true);
  reopened.db.close();
  if ((optionalFile(path + '-wal', paths.dev)?.size ?? 0) !== 0) throw unavailable();
  syncPath(path);
  syncPath(dirname(path), true);
  syncPath(paths.sessionRoot, true);
}

/**
 * @param {AuthorityPaths} paths
 * @param {boolean} fresh
 * @param {((stage:string)=>void)|undefined} probe
 */
function openControl(paths, fresh, probe) {
  const locked = configureLock(paths, fresh);
  let db;
  try {
    db = connect(paths.controlFile, paths.dev, 'DELETE', 2048, fresh);
    if (fresh) db.exec(authoritySchema);
    checkSchema(db, 'authority');
    checkIntegrity(db);
    const identity = owned(paths.controlFile, 'file', paths.dev);
    return { ...locked, db, paths, controlIdentity: identity, probe };
  } catch (error) {
    try { db?.close(); } finally { locked.lock.close(); }
    throw error;
  }
}

/** @param {Control} control */
function release(control) {
  try { control.db.close(); } finally { control.lock.close(); }
}

/** @param {Control} control */
function live(control) {
  const { paths, lock, identity, db, controlIdentity } = control;
  if (!lock.isTransaction) throw fenced();
  assertFileIdentity(paths.lockFile, identity, paths.dev);
  assertFileIdentity(paths.controlFile, controlIdentity, paths.dev);
  return validateControl(db);
}

/** @param {import('node:sqlite').StatementResultingChanges} result */
function changed(result) {
  if (result.changes !== 1) throw fenced();
}

/** @param {Control} control */
function commitFence(control) {
  const row = live(control);
  if (row.phase === 'RESETTING') throw fenced();
  transaction(control.db, () => {
    changed(control.db.prepare("UPDATE authority SET phase='FENCED', clean_shutdown=0 WHERE singleton=1").run());
  });
}

/**
 * @param {Control} control
 * @param {boolean} allowDirty
 */
function start(control, allowDirty) {
  let session;
  let armAttempted = false;
  try {
    const row = live(control);
    if (row.phase !== 'STABLE' || (!allowDirty && row.clean_shutdown !== 1)) throw fenced();
    rejectNewerSessionWitness(control, row);
    armAttempted = true;
    transaction(control.db, () => {
      control.probe?.('before-dirty-write');
      changed(control.db.prepare("UPDATE authority SET clean_shutdown=0 WHERE singleton=1 AND phase='STABLE'").run());
    });
    // No clock observation that gates admission takes place before the durable write above.
    session = openSession(control.paths, row);
    return createAuthority(control, session);
  } catch (error) {
    if (armAttempted) {
      // A failed arm attempt cannot authorize this startup. Try to preserve durable
      // denial even when the write failed before the dirty marker was committed.
      try { commitFence(control); } catch { /* STOP. There is no authenticated delivery. */ }
    }
    try { session?.db.close(); } finally { release(control); }
    throw safeFault(error);
  }
}

/**
 * @param {Control} control
 * @param {OpenSession} session
 */
function createAuthority(control, session) {
  let denied = false;
  let closed = false;
  const stable = () => {
    if (closed || denied) throw fenced();
    const row = live(control);
    if (row.phase !== 'STABLE' || row.clean_shutdown !== 0) throw fenced();
    assertFileIdentity(session.path, session.identity, control.paths.dev);
    verifyBinding(readSessionMeta(session.db), row);
    return row;
  };
  const fence = () => {
    if (!denied && !closed) {
      denied = true;
      try { commitFence(control); } catch { /* PREPARED or clean_shutdown=0 still denies restart. */ }
    }
  };
  return Object.freeze({
    db: session.db,
    stable,
    fence,
    walBytes() {
      return optionalFile(session.path + '-wal', control.paths.dev)?.size ?? 0;
    },
    /** @param {number} now */
    saveClock(now) {
      const row = stable();
      if (!isCounter(now) || now < row.last_auth_wall_ms) throw fenced();
      if (now === row.last_auth_wall_ms) return;
      transaction(control.db, () => {
        control.probe?.('before-clock-write');
        changed(control.db.prepare('UPDATE authority SET last_auth_wall_ms=? WHERE singleton=1').run(now));
      });
    },
    /**
     * @param {string} accountId
     * @param {string} [operationId]
     */
    accountFence(accountId, operationId) {
      stable();
      return control.db.prepare('SELECT account_id, operation_id FROM account_fences WHERE account_id=? OR (? IS NOT NULL AND operation_id=?)')
        .all(accountId, operationId ?? null, operationId ?? null);
    },
    /**
     * @param {Binding} row
     * @param {string} opId
     * @param {number} seq
     * @param {()=>boolean} canWrite
     * @param {AccountDeletion} [deletion]
     */
    prepare(row, opId, seq, canWrite, deletion) {
      const actual = stable();
      if (row.store_id !== actual.store_id || row.generation !== actual.generation ||
          row.committed_seq !== actual.committed_seq || seq !== nextCounter(actual.committed_seq)) throw fenced();
      return transaction(control.db, () => {
        const update = control.db.prepare(`
          UPDATE authority SET phase='PREPARED', pending_op_id=?, next_seq=? WHERE singleton=1
        `);
        control.probe?.('before-prepare-update');
        if (!canWrite()) return false;
        changed(update.run(opId, seq));
        if (deletion) {
          changed(control.db.prepare('INSERT INTO account_fences VALUES (?, ?)').run(deletion.accountId, deletion.operationId));
        }
        return true;
      });
    },
    /**
     * @param {Binding} row
     * @param {string} opId
     * @param {number} seq
     * @param {number} now
     */
    finish(row, opId, seq, now) {
      const current = live(control);
      if (current.phase !== 'PREPARED' || current.pending_op_id !== opId || current.next_seq !== seq ||
          current.store_id !== row.store_id || current.generation !== row.generation ||
          current.committed_seq !== row.committed_seq || !isCounter(now) || now < current.last_auth_wall_ms) throw fenced();
      verifyBinding(readSessionMeta(session.db), { ...row, committed_seq: seq, committed_op_id: opId });
      transaction(control.db, () => {
        changed(control.db.prepare(`
          UPDATE authority SET phase='STABLE', committed_seq=?, committed_op_id=?, pending_op_id=NULL,
            next_seq=NULL, last_auth_wall_ms=? WHERE singleton=1
        `).run(seq, opId, now));
      });
    },
    /** @param {number} finalWall */
    closeClean(finalWall) {
      if (closed || denied) throw fenced();
      try {
        const row = stable();
        if (!isCounter(finalWall) || finalWall < row.last_auth_wall_ms) throw fenced();
        session.db.close();
        transaction(control.db, () => {
          changed(control.db.prepare(`
            UPDATE authority SET clean_shutdown=1, last_auth_wall_ms=? WHERE singleton=1
          `).run(finalWall));
        });
      } catch (error) {
        fence();
        if (session.db.isOpen) session.db.close();
        throw safeFault(error);
      } finally {
        closed = true;
        release(control);
      }
    },
    closeDenied() {
      if (closed) return;
      closed = true;
      try { session.db.close(); } finally { release(control); }
    },
  });
}

/** @param {AuthorityOptions} options */
export function initializeAuthority(options) {
  /** @type {Control|undefined} */
  let control;
  try {
    const paths = pathsOf(options);
    if (readdirSync(paths.sessionRoot).length || readdirSync(paths.controlRoot).length) throw unavailable();
    control = openControl(paths, true, options[syntheticSessionHooks]?.onStage);
    const binding = { store_id: newSessionId(), generation: 1, committed_seq: 0, committed_op_id: null };
    createEmptySession(paths, binding);
    const { db } = control;
    transaction(db, () => {
      db.prepare(`
        INSERT INTO authority(singleton, profile_version, schema_version, store_id, generation,
          committed_seq, phase, last_auth_wall_ms, clean_shutdown)
        VALUES (1, ?, 1, ?, 1, 0, 'STABLE', 0, 0)
      `).run(profile, binding.store_id);
    });
    syncPath(paths.controlRoot, true);
    syncPath(paths.runtimeRoot, true);
  } catch (error) {
    if (control) release(control);
    throw safeFault(error);
  }
  return start(control, true);
}

/**
 * @param {AuthorityOptions} options
 * @param {object} [activation]
 */
export function reopenAuthority(options, activation) {
  try {
    const paths = pathsOf(options);
    if (activation === undefined) return start(openControl(paths, false, options[syntheticSessionHooks]?.onStage), false);
    const handoff = activationHandles.get(activation);
    if (!handoff || handoff.control.paths.runtimeRoot !== paths.runtimeRoot) throw fenced();
    const control = handoff.take();
    return start(control, true);
  } catch (error) {
    throw safeFault(error);
  }
}

// Private offline bootstrap only. The caller retains the issued ID before mutating.
// A receipt is read-only. Only the live invocation that publishes a new reset
// can hand its still-held lock to one startup, so an old receipt cannot reopen a dirty store.
/**
 * @param {AuthorityOptions} options
 * @param {boolean} maintenanceConfirmed
 */
export function openOfflineRecovery(options, maintenanceConfirmed) {
  if (maintenanceConfirmed !== true) throw unavailable();
  /** @type {Control|undefined} */
  let control;
  try {
    control = openControl(pathsOf(options), false, options[syntheticSessionHooks]?.onStage);
    rejectNewerSessionWitness(control, live(control));
  } catch (error) {
    if (control) release(control);
    throw safeFault(error);
  }
  /** @type {string|null} */ let reserved = null;
  /** @type {object|null} */ let issuedActivation = null;
  const lockedControl = control;
  let ownedControl = true;
  function active() {
    if (!ownedControl) throw fenced();
    return live(lockedControl);
  }
  return Object.freeze({
    reserveResetId() {
      try {
        const row = active();
        if (issuedActivation || row.phase === 'RESETTING' ||
            (row.phase === 'STABLE' && row.clean_shutdown === 1)) throw fenced();
        reserved ??= newSessionId();
        return reserved;
      } catch (error) {
        throw safeFault(error);
      }
    },
    /**
     * @param {string} resetOpId
     * @returns {Readonly<{completed:true,activation?:object}>}
     */
    confirmReset(resetOpId) {
      try {
        if (!validId(resetOpId)) throw unavailable();
        let row = active();
        if (row.last_reset_op_id === resetOpId) return Object.freeze({ completed: true });
        if (issuedActivation) throw fenced();
        if (resetOpId === reserved && (row.phase === 'PREPARED' ||
            (row.phase === 'STABLE' && row.clean_shutdown === 0))) {
          commitFence(lockedControl);
          row = active();
        }
        if (row.phase === 'FENCED' && resetOpId === reserved) {
          const generation = nextCounter(row.generation);
          transaction(lockedControl.db, () => {
            changed(lockedControl.db.prepare(`
              UPDATE authority SET phase='RESETTING', reset_op_id=?,
                reset_generation=?, reset_store_id=?, clean_shutdown=0 WHERE singleton=1
            `).run(resetOpId, generation, newSessionId()));
          });
          row = active();
        }
        if (row.phase !== 'RESETTING' || row.reset_op_id !== resetOpId ||
            row.reset_store_id === null || row.reset_generation === null) throw fenced();
        const previous = rejectNewerSessionWitness(lockedControl, row);
        createEmptySession(lockedControl.paths, {
          store_id: row.reset_store_id, generation: row.reset_generation,
          committed_seq: 0, committed_op_id: null,
        }, true);
        lockedControl.probe?.('before-reset-publish');
        transaction(lockedControl.db, () => {
          changed(lockedControl.db.prepare(`
            INSERT INTO retired_session_stores(store_id, generation, committed_seq, committed_op_id,
              next_seq, pending_op_id, witness_state, directory_inode, file_inode, corrupt_sha256,
              witness_seq, witness_op_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(row.store_id, row.generation, row.committed_seq, row.committed_op_id,
            row.next_seq, row.pending_op_id, previous.state, previous.directoryInode, previous.fileInode,
            previous.corruptHash, previous.seq, previous.opId));
          changed(lockedControl.db.prepare(`
            UPDATE authority SET store_id=reset_store_id, generation=reset_generation, committed_seq=0,
              committed_op_id=NULL, pending_op_id=NULL, next_seq=NULL, phase='STABLE',
              last_reset_op_id=reset_op_id, reset_op_id=NULL,
              reset_generation=NULL, reset_store_id=NULL WHERE singleton=1 AND phase='RESETTING' AND reset_op_id=?
          `).run(resetOpId));
        });
        lockedControl.probe?.('after-reset-publish');
        const token = Object.freeze(Object.create(null));
        issuedActivation = token;
        activationHandles.set(token, {
          control: lockedControl,
          take() {
            if (!ownedControl || issuedActivation !== token) throw fenced();
            activationHandles.delete(token);
            ownedControl = false;
            return lockedControl;
          },
        });
        return Object.freeze({ completed: true, activation: token });
      } catch (error) {
        throw safeFault(error);
      }
    },
    close() {
      if (!ownedControl) return;
      ownedControl = false;
      if (issuedActivation) activationHandles.delete(issuedActivation);
      try { release(lockedControl); } catch (error) { throw safeFault(error); }
    },
  });
}
