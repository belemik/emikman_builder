import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { users, verifyPassword, hashPassword } from './auth.mjs';

export async function createApp({ dev = false, origin = 'http://127.0.0.1:5173', sessionTTL = 8 * 60 * 60 * 1000 } = {}) {
  const secure = new URL(origin).protocol === 'https:';
  const sessions = new Map(), attempts = new Map();
  const dummyHash = hashPassword(randomBytes(32).toString('hex'));
  const digest = value => createHash('sha256').update(value).digest('hex');
  const cookie = (token, age) => `wdeaf_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`;
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  let vite;
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const path = new URL(req.url, origin).pathname;
      const now = Date.now();
      for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key);
      for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
      if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== origin) return json(res, 403, { error: 'Недопустимый источник запроса.' });
      const token = /(?:^|;\s*)wdeaf_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const session = token ? sessions.get(digest(token)) : undefined;
      const list = await users();
      const user = session && list.find(item => item.id === session.userId);
      if (path === '/api/login' && req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'Ожидался JSON.' });
        const address = req.socket.remoteAddress; // Never trust arbitrary X-Forwarded-For.
        const bucket = attempts.get(address) || { count: 0, until: now + 15 * 60 * 1000 };
        if (bucket.count >= 10 || sessions.size >= 10000 || attempts.size >= 10000) { res.setHeader('Retry-After', '900'); return json(res, 429, { error: 'Слишком много попыток.' }); }
        bucket.count++; attempts.set(address, bucket);
        let body = '';
        for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 4096) return json(res, 413, { error: 'Запрос слишком большой.' }); }
        let credentials; try { credentials = JSON.parse(body); } catch { return json(res, 400, { error: 'Некорректный JSON.' }); }
        if (!credentials || typeof credentials.username !== 'string' || typeof credentials.password !== 'string' || credentials.username.length > 40 || credentials.password.length > 128) return json(res, 400, { error: 'Некорректные данные.' });
        const found = list.find(item => item.username === credentials.username);
        const valid = verifyPassword(credentials.password, found?.passwordHash || dummyHash);
        if (!found || !valid) return json(res, 401, { error: 'Неверный логин или пароль.' });
        attempts.delete(address);
        if (token) sessions.delete(digest(token));
        const next = randomBytes(32).toString('hex');
        sessions.set(digest(next), { userId: found.id, expires: now + sessionTTL });
        res.setHeader('Set-Cookie', cookie(next, Math.floor(sessionTTL / 1000)));
        return json(res, 200, { ok: true });
      }
      if (path === '/api/logout' && req.method === 'POST') {
        if (token) sessions.delete(digest(token));
        res.setHeader('Set-Cookie', cookie('', 0)); return json(res, 200, { ok: true });
      }
      if (path === '/api/me') {
        if (!user) return json(res, 401, { error: 'Требуется вход.' });
        return json(res, 200, { id: user.id, username: user.username });
      }
      // Only these public, non-sensitive assets are needed by the login form.
      const loginAssets = new Set(['/icons/eye.svg', '/icons/eye-off.svg', '/wdeaf-controls.css']);
      if (loginAssets.has(path) && ['GET', 'HEAD'].includes(req.method)) {
        res.setHeader('Content-Type', path.endsWith('.svg') ? 'image/svg+xml' : 'text/css; charset=utf-8');
        return res.end(req.method === 'HEAD' ? undefined : await readFile(resolve('public', '.' + path)));
      }
      if (!user) {
        if (path === '/' && req.method === 'GET') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(await readFile(new URL('./login.html', import.meta.url))); }
        return json(res, 401, { error: 'Требуется вход.' });
      }
      if (path.startsWith('/api/')) return json(res, 404, { error: 'Не найдено.' });
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Метод недоступен.' });
      if (vite) return vite.middlewares(req, res);
      const root = resolve('dist-server');
      const file = resolve(root, `.${decodeURIComponent(path === '/' ? '/index.html' : path)}`);
      if (!file.startsWith(root + sep)) return json(res, 403, { error: 'Доступ запрещён.' });
      try {
        if (!(await stat(file)).isFile()) return json(res, 404, { error: 'Не найдено.' });
        const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
        res.setHeader('Content-Type', `${mime[extname(file)] || 'application/octet-stream'}; charset=utf-8`);
        res.end(req.method === 'HEAD' ? undefined : await readFile(file));
      } catch (error) { if (error.code === 'ENOENT') return json(res, 404, { error: 'Не найдено.' }); throw error; }
    } catch { if (!res.headersSent) json(res, 500, { error: 'Ошибка сервера.' }); else res.end(); }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  if (dev) {
    const { createServer: createViteServer } = await import('vite');
    vite = await createViteServer({ server: { middlewareMode: true, hmr: false, fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.data/**', '**/server/**'] } }, appType: 'spa' });
  }
  return { server, close: async () => { await vite?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dev = process.argv.includes('--dev');
  const port = Number(process.env.PORT || 5173);
  const origin = process.env.APP_ORIGIN || `http://127.0.0.1:${port}`;
  const host = process.env.HOST || '127.0.0.1';
  if (host !== '127.0.0.1' && (!process.env.APP_ORIGIN || !origin.startsWith('https://'))) throw new Error('Для внешнего доступа задайте APP_ORIGIN=https://ваш-домен и HTTPS reverse proxy.');
  const app = await createApp({ dev, origin });
  app.server.listen(port, host, () => console.log(`WDeaf: ${origin} (${dev ? 'разработка' : 'production'}, вход обязателен)`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(); });
}
