import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { WEB_PAGE_ASSETS } from '../src/web-page/contract';
import { validateWebPage, WEB_PAGE_MAX_BYTES, type WebPageIssue } from '../src/web-page/validate';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/web-page/event.${name}.json`, import.meta.url), 'utf8');
const valid = fixture('valid');
const page = () => JSON.parse(valid) as {
  version: string;
  hero: { layout: string; heading: string; body: { text: string }; image: { assetId: string; alt: string }; cta: { label: string; targetId: string } };
  program: { id: string; heading: string; items: { text: string }[] };
};

function rejected(input: unknown, code: WebPageIssue['code'], path: string) {
  const result = validateWebPage(input);
  assert.equal(result.valid, false);
  if (result.valid) assert.fail('Invalid page accepted.');
  assert.equal(result.issue.code, code);
  assert.equal(result.issue.path, path);
  return result.issue;
}

test('valid fixture round-trips deterministically into a recursively frozen value', () => {
  const result = validateWebPage(valid);
  assert.ok(result.valid);
  assert.deepEqual(result.value, page());
  assert.deepEqual(result, validateWebPage(valid));
  function frozen(value: unknown) {
    if (value && typeof value === 'object') {
      assert.ok(Object.isFrozen(value));
      Object.values(value).forEach(frozen);
    }
  }
  frozen(result.value);
  assert.ok(Object.isFrozen(WEB_PAGE_ASSETS));
  for (const path of Object.values(WEB_PAGE_ASSETS)) {
    assert.ok(readFileSync(new URL('../public' + path, import.meta.url)).length > 0);
  }
});

test('invalid fixture reports the catalog failure', () => {
  rejected(fixture('invalid'), 'ASSET', '/hero/image/assetId');
});

test('the boundary accepts primitive JSON only and never inspects an object', () => {
  rejected(new Proxy({}, { get() { assert.fail('Read an untrusted object'); } }), 'INPUT', '');
  rejected(new String(valid), 'INPUT', '');
  rejected('null', 'SHAPE', '');
  rejected('{"version":', 'JSON', '');
});

test('duplicate decoded keys and unpaired surrogates fail before structural validation', () => {
  const duplicate = valid.replace('"version": "0.1"', '"version": "0.2", "\\u0076ersion": "0.1"');
  assert.ok(rejected(duplicate, 'JSON', '').span);
  rejected(valid.replace('Знак мероприятия', '\\ud800'), 'JSON', '');
});

test('unknown fields fail without echoing input keys', () => {
  const issue = rejected(valid.replace('"version": "0.1"', '"version": "0.1", "__proto__": {}'), 'UNKNOWN_FIELD', '');
  assert.ok(!JSON.stringify(issue).includes('__proto__'));
  for (const key of ['html', 'css', 'javascript', 'src', 'href', 'onClick']) {
    const input = page();
    Object.assign(input.hero.cta, { [key]: 'unsupported' });
    rejected(JSON.stringify(input), 'UNKNOWN_FIELD', '/hero/cta');
  }
});

test('links are section IDs and image references are catalog IDs', () => {
  for (const value of ['https://example.invalid/page', 'javascript:void(0)', 'data:image/png,example', '../image', 'constructor']) {
    const input = page();
    input.hero.image.assetId = value;
    rejected(JSON.stringify(input), 'ASSET', '/hero/image/assetId');
    input.hero.image.assetId = 'event-mark';
    input.hero.cta.targetId = value;
    rejected(JSON.stringify(input), value === 'constructor' ? 'TARGET' : 'ID', '/hero/cta/targetId');
  }
  const input = page();
  input.hero.cta.targetId = 'missing';
  rejected(JSON.stringify(input), 'TARGET', '/hero/cta/targetId');
});

test('version, layout, required text and program item shape are checked', () => {
  rejected(JSON.stringify({ ...page(), version: '0.2' }), 'VERSION', '/version');
  const input = page();
  input.hero.layout = 'grid';
  rejected(JSON.stringify(input), 'LAYOUT', '/hero/layout');
  input.hero.layout = 'stack';
  input.hero.heading = '<strong>Heading</strong>';
  rejected(JSON.stringify(input), 'TEXT', '/hero/heading');
  input.hero.heading = 'Heading';
  input.hero.image.alt = ' ';
  rejected(JSON.stringify(input), 'TEXT', '/hero/image/alt');
  const noAlt = page();
  rejected(JSON.stringify({ ...noAlt, hero: { ...noAlt.hero, image: { assetId: 'event-mark' } } }), 'SHAPE', '/hero/image/alt');
  rejected(JSON.stringify({ ...page(), program: { ...page().program, items: [null] } }), 'SHAPE', '/program/items/0');
});

test('byte, item and decoded text limits are inclusive', () => {
  const bytes = new TextEncoder().encode(valid).length;
  assert.ok(validateWebPage(valid + ' '.repeat(WEB_PAGE_MAX_BYTES - bytes)).valid);
  rejected(valid + ' '.repeat(WEB_PAGE_MAX_BYTES - bytes + 1), 'SIZE', '');
  rejected(JSON.stringify({ ...page(), padding: 'я'.repeat(9_000) }), 'SIZE', '');
  const input = page();
  input.program.items = Array.from({ length: 8 }, () => ({ text: 'а'.repeat(500) }));
  assert.ok(validateWebPage(JSON.stringify(input)).valid);
  input.program.items.push({ text: 'Extra' });
  rejected(JSON.stringify(input), 'SHAPE', '/program/items');
  input.program.items.pop();
  input.program.items[0].text += 'а';
  rejected(JSON.stringify(input), 'TEXT', '/program/items/0/text');
});
