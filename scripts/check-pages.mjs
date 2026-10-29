import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
const root = 'dist';
const html = await readFile(join(root, 'index.html'), 'utf8');
for (const [, path] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  assert.ok(path.startsWith('/emikman_builder/'), `Incorrect asset base: ${path}`);
  assert.ok((await stat(join(root, path.slice('/emikman_builder/'.length)))).isFile());
}
async function check(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    assert.ok(!/^(?:server|\.data|\.env.*|\.git|\.backups|users\.json)$/.test(entry.name), `Private file: ${entry.name}`);
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { await check(path); continue; }
    if (/\.(js|html|css|json|svg)$/.test(entry.name)) {
      const text = await readFile(path, 'utf8');
      assert.ok(!/\/api\/(?:me|login|logout)|passwordHash|BEGIN [A-Z ]*PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{20}/.test(text), `Auth/secret material in ${path}`);
    }
  }
}
await check(root);
console.log('Pages artifact: subpath entry assets exist; server auth and private files excluded.');
