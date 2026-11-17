import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { open, mkdir, lstat, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
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
/** @returns {Promise<Account[]>} */
export async function users() {
  const path = await legacyAccountPath();
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
  try {
    const info = await file.stat();
    if (!info.isFile() || info.nlink !== 1) throw new Error('Недопустимый файл аккаунтов.');
    return JSON.parse(await file.readFile('utf8'));
  } finally {
    await file.close();
  }
}
/** @param {string} username @param {string} password */
export async function addUser(username, password) {
  if (!/^[a-zA-Z0-9_-]{3,40}$/.test(username)) throw new Error('Логин: 3–40 латинских букв, цифр, _ или -.');
  if (password.length < 12 || password.length > 128) throw new Error('Пароль: от 12 до 128 символов.');
  const list = await users();
  if (list.some(user => user.username === username)) throw new Error('Этот логин уже существует.');
  list.push({ id: randomBytes(16).toString('hex'), username, passwordHash: hashPassword(password) });
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const destination = await legacyAccountPath();
  const flags = constants.O_WRONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  let file;
  try {
    file = await open(destination, flags);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    file = await open(destination, flags | constants.O_CREAT | constants.O_EXCL, 0o600);
  }
  try {
    const info = await file.stat();
    if (!info.isFile() || info.nlink !== 1) throw new Error('Недопустимый файл аккаунтов.');
    await file.truncate(0);
    await file.writeFile(JSON.stringify(list, null, 2));
  } finally {
    await file.close();
  }
}
