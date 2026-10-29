import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'wdeaf-auth-test-'));
process.env.DATA_DIR = directory;
const { addUser, users, verifyPassword } = await import('../server/auth.mjs');
const { createApp } = await import('../server/index.mjs');

test('server protects assets, validates login/origin, rotates and revokes sessions', async () => {
  await addUser('tester', 'test-password-12345');
  const [user] = await users();
  assert.notEqual(user.passwordHash, 'test-password-12345');
  assert.equal(verifyPassword('wrong', user.passwordHash), false);
  assert.equal(verifyPassword('test-password-12345', user.passwordHash), true);
  const origin = 'http://localhost:5173';
  const app = await createApp({ origin });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const login = (password, extra = {}) => fetch(base + '/api/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify({ username: 'tester', password }) });
  try {
    assert.match(await (await fetch(base)).text(), /Вход в WDeaf/);
    assert.equal((await fetch(base + '/assets/private.js')).status, 401);
    assert.equal((await fetch(base + '/api/me')).status, 401);
    assert.equal((await login('test-password-12345', { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await login('wrong')).status, 401);
    const response = await login('test-password-12345');
    assert.equal(response.status, 200);
    const header = response.headers.get('set-cookie');
    assert.match(header, /HttpOnly/); assert.match(header, /SameSite=Strict/);
    const cookie = header.split(';')[0];
    // A second browser has its own cookie, without revoking the first browser.
    const secondLogin = await login('test-password-12345');
    const secondCookie = secondLogin.headers.get('set-cookie').split(';')[0];
    assert.notEqual(secondCookie, cookie);
    assert.equal((await fetch(base + '/api/me', { headers: { Cookie: secondCookie } })).status, 200);
    const me = await (await fetch(base + '/api/me', { headers: { Cookie: cookie } })).json();
    assert.equal(me.username, 'tester'); assert.equal(me.passwordHash, undefined);
    assert.match(await (await fetch(base, { headers: { Cookie: cookie } })).text(), /src=|script/);
    const rotated = await login('test-password-12345', { Cookie: cookie });
    const nextCookie = rotated.headers.get('set-cookie').split(';')[0];
    assert.notEqual(nextCookie, cookie);
    assert.equal((await fetch(base + '/api/me', { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await fetch(base + '/api/logout', { method: 'POST', headers: { Cookie: nextCookie, Origin: origin } })).status, 200);
    assert.equal((await fetch(base + '/api/me', { headers: { Cookie: nextCookie } })).status, 401);
    assert.equal((await fetch(base + '/api/me', { headers: { Cookie: secondCookie } })).status, 200);
    assert.equal((await fetch(base + '/icons/eye.svg')).status, 200);
    assert.equal((await fetch(base + '/icons/eye-off.svg')).status, 200);
    assert.equal((await fetch(base + '/.data/users.json')).status, 401);
    for (let i = 0; i < 10; i++) assert.equal((await login('wrong')).status, 401);
    assert.equal((await login('wrong')).status, 429);
  } finally { await app.close(); }
});

test('HTTPS session cookies are Secure and sessions expire', async () => {
  const origin = 'https://builder.example';
  const app = await createApp({ origin, sessionTTL: 1 });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    const response = await fetch(base + '/api/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'tester', password: 'test-password-12345' }) });
    assert.match(response.headers.get('set-cookie'), /; Secure/);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal((await fetch(base + '/api/me', { headers: { Cookie: cookie } })).status, 401);
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
