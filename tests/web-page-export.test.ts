import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildWebPageExport, openExportInput, writeWebPageExport } from '../server/web-page/export';
import { WEB_PAGE_MAX_BYTES } from '../src/web-page/validate';

const fixture = new URL('./fixtures/web-page/event.valid.json', import.meta.url);
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

test('WebPage export preserves structure, escapes text, and accounts for every portable file', async () => {
  const bytes = await readFile(fixture);
  const document = JSON.parse(bytes.toString('utf8'));
  document.hero.heading = 'Мастерские & «дизайн»';
  document.hero.body.text = 'https://example.invalid/?a=1&b=2';
  const source = Buffer.from(JSON.stringify(document, null, 2) + '\n');
  const digest = sha256(source);
  const files = await buildWebPageExport(source, 'ru');
  const again = await buildWebPageExport(source, 'ru');
  assert.deepEqual(files, again);
  assert.equal(sha256(source), digest);

  const html = files.get('index.html')!.toString();
  const css = files.get('styles.css')!.toString();
  const manifest = JSON.parse(files.get('manifest.json')!.toString());
  assert.match(html, /^<!doctype html>\n<html lang="ru">/);
  assert.match(html, /<h1>Мастерские &amp; «дизайн»<\/h1>/);
  assert.match(html, /<p>https:\/\/example\.invalid\/\?a=1&amp;b=2<\/p>/);
  assert.match(html, /<h2>Программа<\/h2>/);
  assert.match(html, /<li>Экскурсия по мастерским<\/li>/);
  assert.match(html, /src="\.\/icons\/event-mark\.svg" alt="Знак мероприятия"/);
  assert.match(html, /data-layout="split"/);
  assert.match(html, /href="#([^"]+)"[^>]*>[^<]+<\/a>.*id="\1"/);
  assert.doesNotMatch(html, /<script\b|<base\b|\s(?:href|src)="(?:\/|https?:)/);
  assert.match(css, /@container \(min-width: 36rem\)/);
  const dependencies = [...html.matchAll(/(?:href|src)="\.\/([^"]+)"/g), ...css.matchAll(/url\(\.\/([^)]*)\)/g)];
  for (const [, path] of dependencies) assert.ok(files.has(path), path);
  assert.equal(manifest.formatVersion, 'zarya.web-page.static-export/v1');
  assert.equal(manifest.contractVersion, '0.1');
  assert.equal(manifest.inputSha256, digest);
  assert.equal(manifest.entry, 'index.html');
  assert.deepEqual(manifest.files.map(({ path }: { path: string }) => path),
    [...files.keys()].filter(path => path !== 'manifest.json').sort());
  for (const { path, bytes, sha256: expected } of manifest.files) {
    const data = files.get(path)!;
    assert.equal(data.byteLength, bytes);
    assert.equal(sha256(data), expected);
  }
});

test('WebPage export rejects invalid or unsupported documents before reading dependencies', async () => {
  const valid = await readFile(fixture, 'utf8');
  const rejectRead = async () => assert.fail('Read a dependency for invalid input');
  await assert.rejects(buildWebPageExport(Buffer.from(valid.replace('0.1', '0.2')), 'ru', rejectRead),
    /INVALID_WEB_PAGE: VERSION/);
  await assert.rejects(buildWebPageExport(Buffer.from(valid.replace('event-mark', '..\/users.json')), 'ru', rejectRead),
    /INVALID_WEB_PAGE: ASSET/);
  await assert.rejects(buildWebPageExport(Buffer.alloc(WEB_PAGE_MAX_BYTES + 1), 'ru', rejectRead),
    /INVALID_WEB_PAGE: SIZE/);
  await assert.rejects(buildWebPageExport(Buffer.from([0xff]), 'ru', rejectRead), /INVALID_WEB_PAGE: UTF8/);
});

test('WebPage export fails closed on missing files and a stylesheet with unknown resources', async () => {
  const input = await readFile(fixture);
  await assert.rejects(buildWebPageExport(input, 'ru', async path => {
    if (String(path).endsWith('/manrope-latin-500-normal.woff2')) throw Error('ENOENT');
    return readFile(path);
  }), /MISSING_EXPORT_DEPENDENCY: manrope-latin-500-normal\.woff2/);
  await assert.rejects(buildWebPageExport(input, 'ru', async path => {
    if (String(path).endsWith('/web-page-content.css')) return Buffer.from('body { background: url(https://example.invalid); }');
    return readFile(path);
  }), /UNSUPPORTED_EXPORT_CSS_DEPENDENCY/);
});

test('WebPage export writes a stack bundle and refuses to overwrite an existing destination', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'zarya-web-export-test-')));
  try {
    const input = Buffer.from((await readFile(fixture, 'utf8')).replace('"split"', '"stack"'));
    const output = join(root, 'preview');
    await writeWebPageExport(input, output);
    const before = await readFile(join(output, 'index.html'), 'utf8');
    assert.match(before, /<html lang="und">/);
    assert.match(before, /data-layout="stack"/);
    assert.equal(JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')).inputSha256, sha256(input));
    await assert.rejects(writeWebPageExport(await readFile(fixture), output), { code: 'EEXIST' });
    assert.equal(await readFile(join(output, 'index.html'), 'utf8'), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test('competing exports publish one complete bundle and leave no staging directories', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'zarya-web-export-race-')));
  try {
    const original = await readFile(fixture);
    const alternate = Buffer.from(original.toString().replace('День открытых мастерских', 'День дизайна'));
    const target = join(root, 'result');
    const results = await Promise.allSettled([original, alternate].map(data => writeWebPageExport(data, target, 'ru')));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const failure = results.find(result => result.status === 'rejected');
    assert.equal(failure?.reason.code, 'EEXIST');
    const winner = results[0].status === 'fulfilled' ? original : alternate;
    const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'));
    assert.equal(manifest.inputSha256, sha256(winner));
    for (const { path, sha256: digest } of manifest.files) {
      assert.equal(sha256(await readFile(join(target, path))), digest);
    }
    assert.deepEqual(await readdir(root), ['result']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('input and destination symlinks do not expose or overwrite their targets', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'zarya-web-export-links-')));
  try {
    const original = await readFile(fixture);
    const real = join(root, 'real');
    await mkdir(real);
    await writeFile(join(real, 'sentinel'), original);
    const alias = join(root, 'alias');
    const leaf = join(root, 'leaf');
    await symlink(real, alias);
    await symlink(join(real, 'sentinel'), leaf);
    await assert.rejects(openExportInput(leaf), { code: 'ELOOP' });
    await assert.rejects(openExportInput(join(alias, 'sentinel')), /SYMLINK_EXPORT_INPUT_PARENT/);
    await assert.rejects(writeWebPageExport(original, alias), { code: 'EEXIST' });
    await assert.rejects(writeWebPageExport(original, join(alias, 'escaped')), /SYMLINK_EXPORT_OUTPUT_PARENT/);
    await assert.rejects(writeWebPageExport(original, join(root, 'missing', 'output')), { code: 'ENOENT' });
    assert.deepEqual(await readdir(real), ['sentinel']);
    assert.deepEqual(await readFile(join(real, 'sentinel')), original);
    assert.deepEqual((await readdir(root)).sort(), ['alias', 'leaf', 'real']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an OS file size limit interrupts staging without publishing a partial export', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'zarya-web-export-fault-')));
  try {
    const output = join(root, 'result');
    // Ignore the signal so Node receives EFBIG and the exporter can roll back normally.
    const cli = fileURLToPath(new URL('../scripts/export-web-page.ts', import.meta.url));
    const script = "process.on('SIGXFSZ', () => {}); await import(process.argv[1]);";
    const result = spawnSync('sh', ['-c', 'ulimit -f 2 && exec "$@"', 'sh', process.execPath,
      '--import', 'tsx', '--input-type=module', '-e', script, cli, fileURLToPath(fixture), output, 'ru'],
    { encoding: 'utf8', env: { ...process.env, TSX_DISABLE_CACHE: '1' } });
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /EFBIG/);
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
