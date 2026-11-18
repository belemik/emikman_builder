import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { open, mkdir, lstat, realpath, stat, rename, rmdir, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
/** @typedef {{id:string,username:string,passwordHash:string}} Account */
export const dataDir = resolve(process.env.DATA_DIR || '.data');
const accountFile = resolve(dataDir, 'users.json');
const durableNamespace = /^(?:\/private)?\/var\/tmp\/zarya-g1b-c1-[a-z0-9-]+(?:\/|$)/i;

/** @param {string} path */
async function assertLegacyPath(path) {
  const reject = () => { throw new Error('Каталог зарезервирован для долговечных сессий.'); };
  if (durableNamespace.test(path)) reject();
  for (let entry = path; entry !== dirname(entry); entry = dirname(entry)) {
    if (!/^zarya-g1b-c1-[a-z0-9-]+$/i.test(basename(entry))) continue;
    // APFS can expose the same directory through a firmlink for which
    // realpath returns a different spelling of the physical volume.
    const root = await stat('/private/var/tmp').catch(error => {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      return null;
    });
    if (!root) return;
    const parent = await stat(dirname(entry)).catch(error => {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      return null;
    });
    if (parent?.dev === root.dev && parent.ino === root.ino) reject();
  }
}

/** @param {string} path */
async function existingPath(path) {
  try {
    return await realpath(path);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    try {
      await lstat(path);
    } catch (missing) {
      if (!(missing instanceof Error && 'code' in missing && missing.code === 'ENOENT')) throw missing;
      return null;
    }
    // A dangling alias cannot be classified as a legacy destination.
    throw error;
  }
}

export async function legacyAccountPath() {
  await assertLegacyPath(dataDir);
  for (let path = dataDir; path !== dirname(path); path = dirname(path)) {
    const physical = await existingPath(path);
    if (physical) {
      await assertLegacyPath(physical);
      break;
    }
  }
  const target = await existingPath(accountFile);
  if (target) {
    await assertLegacyPath(target);
    const info = await lstat(target);
    if (!info.isFile() || info.nlink !== 1) throw new Error('Недопустимый файл аккаунтов.');
    return target;
  }
  return resolve(await existingPath(dataDir) ?? dataDir, 'users.json');
}

/** @param {string} password */
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
/** @param {string} password @param {string} hash */
export function verifyPassword(password, hash) {
  const [salt, digest] = hash.split(':');
  const expected = Buffer.from(digest, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
/** @param {import('node:fs').Stats} info */
const privateDirectory = info => info.isDirectory() && info.uid === process.getuid?.() && (info.mode & 0o7777) === 0o700;
/** @param {import('node:fs').Stats} a @param {import('node:fs').Stats} b */
const sameInode = (a, b) => a.dev === b.dev && a.ino === b.ino;
const unsafeAccounts = () => new Error('Недопустимый файл аккаунтов.');

/** @returns {Promise<Account[]>} */
export async function users() {
  /** @type {{path:string,parent:import('node:fs').Stats,replacement:import('node:fs').Stats}|undefined} */
  let expected;
  // Two bounded reopen attempts. A detached FD alone never authorises a retry.
  for (let attempt = 0; attempt < 3; attempt++) {
    const path = await legacyAccountPath();
    let parent;
    try { parent = await lstat(dirname(path)); }
    catch (error) {
      if (!expected && error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    }
    if (expected && (path !== expected.path || !sameInode(parent, expected.parent))) throw unsafeAccounts();
    let file;
    try {
      file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    } catch (error) {
      if (!expected && error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    }
    try {
      const info = await file.stat();
      if (!info.isFile() || (info.nlink !== 0 && info.nlink !== 1)) throw unsafeAccounts();
      if (expected && (!sameInode(info, expected.replacement) ||
          info.uid !== process.getuid?.() || (info.mode & 0o7777) !== 0o600)) throw unsafeAccounts();
      if (info.nlink === 1) return JSON.parse(await file.readFile('utf8'));
      if (attempt === 2 || !privateDirectory(parent) || info.uid !== process.getuid?.()) throw unsafeAccounts();
      // Only a different, private regular inode at the SAME trusted binding is
      // a confirmed replacement in the cooperating-local-writer threat model.
      const currentPath = await legacyAccountPath();
      const currentParent = await lstat(dirname(path));
      const replacement = await lstat(path);
      if (currentPath !== path || !privateDirectory(currentParent) || !sameInode(parent, currentParent) ||
          !replacement.isFile() || replacement.nlink !== 1 || replacement.uid !== process.getuid?.() ||
          (replacement.mode & 0o7777) !== 0o600 || replacement.dev !== info.dev || sameInode(info, replacement)) {
        throw unsafeAccounts();
      }
      expected = { path, parent, replacement };
    } finally {
      await file.close();
    }
  }
  throw unsafeAccounts();
}

/** @typedef {'NOT_PUBLISHED'|'PUBLISHED_UNCONFIRMED'|'COMMITTED_CLEANUP_FAILED'} WriteFailurePhase */
class AccountWriteError extends Error {
  /** @param {WriteFailurePhase} phase @param {unknown} cause @param {boolean} cleanupFailed @param {unknown[]} cleanupCauses */
  constructor(phase, cause, cleanupFailed, cleanupCauses = []) {
    const messages = {
      NOT_PUBLISHED: 'Запись аккаунта не опубликована. При ошибке очистки нужна ручная проверка.',
      PUBLISHED_UNCONFIRMED: 'Публикация аккаунта или её долговечность не подтверждена. Не повторяйте запись; нужна ручная проверка.',
      COMMITTED_CLEANUP_FAILED: 'Аккаунт записан и синхронизирован, но очистка не завершена. Не повторяйте запись; нужна ручная проверка.',
    };
    super(messages[phase], { cause: cleanupCauses.length ? new AggregateError([cause, ...cleanupCauses], 'Account write and cleanup failed') : cause });
    this.code = 'ACCOUNT_WRITE_' + phase;
    this.phase = phase;
    this.cleanupFailed = cleanupFailed;
  }
}

/**
 * The writer requires pre-provisioned, owned 0700 directories and trusted stable
 * local ancestors. It does not provision DATA_DIR or claim power-loss proof.
 * @param {string} path
 */
async function syncPrivateDirectory(path) {
  const info = await lstat(path);
  if (!privateDirectory(info)) throw new Error('Нужен заранее подготовленный приватный каталог аккаунтов.');
  const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    if (!sameInode(info, await handle.stat())) throw unsafeAccounts();
    await handle.sync();
  } finally {
    await handle.close();
  }
  return info;
}

/** @param {string} destination */
async function acquireWriter(destination) {
  const lockPath = join(dirname(destination), '.users.json.writer-lock');
  const started = performance.now();
  while (true) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
      const info = await lstat(lockPath);
      if (!privateDirectory(info)) throw unsafeAccounts();
      return { lockPath, info };
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      if (performance.now() - started >= 15_000) {
        const busy = new Error('Файл аккаунтов занят. Не удаляйте блокировку без ручной проверки всех writers.');
        throw Object.assign(busy, { code: 'ACCOUNT_WRITER_BUSY', phase: 'NOT_PUBLISHED' });
      }
      await sleep(25);
    }
  }
}

/** @param {string} username @param {string} password */
async function publishAccount(username, password) {
  // Validate namespace before any write. Directory provisioning is deliberately
  // separate: callers must prepare and qualify its ancestor chain beforehand.
  const destination = await legacyAccountPath();
  const canonicalDataDir = await realpath(dataDir);
  await assertLegacyPath(canonicalDataDir);
  await syncPrivateDirectory(canonicalDataDir);
  const parent = await syncPrivateDirectory(dirname(destination));
  const lock = await acquireWriter(destination);
  /** @type {'NOT_PUBLISHED'|'PUBLISHED_UNCONFIRMED'|'COMMITTED'} */
  let phase = 'NOT_PUBLISHED';
  /** @type {{cause:unknown}|undefined} */
  let failure;
  /** @type {unknown[]} */
  const cleanupCauses = [];
  let cleanupFailed = false;
  /** @type {string|undefined} */
  let temporary;
  try {
    if (await legacyAccountPath() !== destination || !sameInode(parent, await lstat(dirname(destination)))) throw unsafeAccounts();
    const list = await users();
    if (list.some(user => user.username === username)) {
      throw Object.assign(new Error('Этот логин уже существует.'), { code: 'ACCOUNT_DUPLICATE', phase: 'NOT_PUBLISHED' });
    }
    list.push({ id: randomBytes(16).toString('hex'), username, passwordHash: hashPassword(password) });
    if (await legacyAccountPath() !== destination || !sameInode(parent, await lstat(dirname(destination)))) throw unsafeAccounts();
    temporary = join(dirname(destination), `.users-${process.pid}-${randomBytes(8).toString('hex')}.tmp`);
    const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() || (info.mode & 0o7777) !== 0o600) throw unsafeAccounts();
      await file.writeFile(JSON.stringify(list, null, 2));
      await file.sync();
    } catch (error) {
      failure = { cause: error };throw error;
    } finally {
      try { await file.close(); } catch (error) {
        cleanupFailed = true;
        if (failure) cleanupCauses.push(error);else throw error;
      }
    }
    // An attempted rename may have taken effect even when its acknowledgement
    // fails. Conservatively retain the lock from this point on any uncertainty.
    phase = 'PUBLISHED_UNCONFIRMED';
    await rename(temporary, destination);
    // A failure after rename retains the lock. It is never an automatic replay
    // or a claim that the newly visible account has been rolled back.
    const directory = await open(dirname(destination), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
      if (!sameInode(parent, await directory.stat())) throw unsafeAccounts();
      await directory.sync();
      phase = 'COMMITTED';
    } catch (error) {
      failure = { cause: error };throw error;
    } finally {
      try { await directory.close(); } catch (error) {
        cleanupFailed = true;
        if (failure) cleanupCauses.push(error);else throw error;
      }
    }
  } catch (error) {
    failure ??= { cause: error };
  }
  if (temporary && phase === 'NOT_PUBLISHED') {
    try { await unlink(temporary); }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) { cleanupFailed = true; if (failure) cleanupCauses.push(error);else failure = { cause: error }; }
    }
  }
  // Unknown publication/durability or cleanup leaves the owned lock for the
  // offline operator. No timestamp-based stale-lock reclamation is performed.
  if ((!failure && phase === 'COMMITTED') || (phase === 'NOT_PUBLISHED' && !cleanupFailed)) {
    try {
      const info = await lstat(lock.lockPath);
      if (!privateDirectory(info) || !sameInode(info, lock.info)) throw unsafeAccounts();
      await rmdir(lock.lockPath);
    } catch (error) { cleanupFailed = true; if (failure) cleanupCauses.push(error);else failure = { cause: error }; }
  }
  if (failure) {
    if (phase === 'NOT_PUBLISHED' && !cleanupFailed && failure.cause instanceof Error &&
        'code' in failure.cause && failure.cause.code === 'ACCOUNT_DUPLICATE') throw failure.cause;
    throw new AccountWriteError(phase === 'COMMITTED' ? 'COMMITTED_CLEANUP_FAILED' : phase, failure.cause, cleanupFailed, cleanupCauses);
  }
}

/** @param {string} username @param {string} password */
export async function addUser(username, password) {
  if (!/^[a-zA-Z0-9_-]{3,40}$/.test(username)) throw new Error('Логин: 3–40 латинских букв, цифр, _ или -.');
  if (password.length < 12 || password.length > 128) throw new Error('Пароль: от 12 до 128 символов.');
  try {
    await publishAccount(username, password);
  } catch (error) {
    if (error instanceof AccountWriteError || (error instanceof Error && 'code' in error &&
        (error.code === 'ACCOUNT_DUPLICATE' || error.code === 'ACCOUNT_WRITER_BUSY'))) throw error;
    throw new AccountWriteError('NOT_PUBLISHED', error, false);
  }
}
