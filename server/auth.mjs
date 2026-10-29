import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
export const dataDir = resolve(process.env.DATA_DIR || '.data');
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, hash) {
  const [salt, digest] = hash.split(':');
  const expected = Buffer.from(digest, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function users() {
  try { return JSON.parse(await readFile(resolve(dataDir, 'users.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
export async function addUser(username, password) {
  if (!/^[a-zA-Z0-9_-]{3,40}$/.test(username)) throw new Error('Логин: 3–40 латинских букв, цифр, _ или -.');
  if (password.length < 12 || password.length > 128) throw new Error('Пароль: от 12 до 128 символов.');
  const list = await users();
  if (list.some(user => user.username === username)) throw new Error('Этот логин уже существует.');
  list.push({ id: randomBytes(16).toString('hex'), username, passwordHash: hashPassword(password) });
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await writeFile(resolve(dataDir, 'users.json'), JSON.stringify(list, null, 2), { mode: 0o600 });
}
