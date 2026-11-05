import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectJsonText, JSON_TEXT_MAX_BYTES } from '../src/readonly/inspect-json-text';
import type { JsonTextInspection } from '../src/readonly/ingest.types';

function syntaxValid(raw: string) {
  const result = inspectJsonText(raw);
  assert.equal(result.kind, 'syntax-valid');
  assert.equal(result.rawText, raw);
  assert.equal(result.utf8Bytes, Buffer.byteLength(raw, 'utf8'));
  assert.equal(result.semanticAdmission, 'NOT_EVALUATED');
  assert.deepEqual(Object.keys(result).sort(), ['kind', 'rawText', 'semanticAdmission', 'utf8Bytes']);
  return result;
}

function rejection(result: JsonTextInspection, code: string) {
  assert.equal(result.kind, 'rejected');
  if (result.kind !== 'rejected') throw new Error('Expected rejection.');
  assert.equal(result.issue.code, code);
  assert.equal(result.issue.path, '');
  assert.equal(result.semanticAdmission, 'NOT_EVALUATED');
  assert.deepEqual(Object.keys(result).sort(), ['issue', 'kind', 'rawText', 'semanticAdmission', 'utf8Bytes']);
  return result;
}

test('objects, arrays and every JSON primitive receive syntax-only results without parsed data', () => {
  for (const raw of ['{}', '{"component":"unverified","unknown":1}', '[]', '[1,{"x":true},null]',
    '"text"', '0', '-12.5e2', 'true', 'false', 'null']) syntaxValid(raw);
});

test('whitespace, line endings and Unicode text remain exactly as supplied', () => {
  for (const raw of ['  \r\n{ "label": "Привет 👋" }\r\n\t',
    '"é"', '"e\u0301"', String.raw`"\u0061\ud83d\ude00"`]) {
    const before = raw;
    syntaxValid(raw);
    assert.equal(raw, before);
    assert.deepEqual(inspectJsonText(raw), inspectJsonText(raw));
  }
});

test('empty, malformed, BOM-prefixed and trailing input is rejected without leaking parser text', () => {
  for (const raw of ['', '  \r\n', '{', '[1,]', '{"secret":"KEEP-PRIVATE",}', 'null extra', '\ufeff{}']) {
    const result = rejection(inspectJsonText(raw), 'INGEST_SYNTAX');
    assert.equal(result.rawText, raw);
    assert.equal(result.utf8Bytes, Buffer.byteLength(raw, 'utf8'));
    assert.deepEqual(result.issue, { code: 'INGEST_SYNTAX', path: '', message: 'Invalid JSON syntax.' });
    assert.doesNotMatch(JSON.stringify(result.issue), /KEEP-PRIVATE|SyntaxError|stack/);
  }
});

test('decimal UTF-8 byte limit is inclusive and differs from character count', () => {
  assert.equal(JSON_TEXT_MAX_BYTES, 2_000_000);
  const asciiAtLimit = '"' + 'a'.repeat(JSON_TEXT_MAX_BYTES - 2) + '"';
  syntaxValid(asciiAtLimit);
  const earlyOversize = asciiAtLimit + ' ';
  const early = rejection(inspectJsonText(earlyOversize), 'INGEST_SIZE');
  assert.equal(early.rawText, earlyOversize);
  assert.equal(early.utf8Bytes, null); // Lower-bound refusal did not measure bytes.

  const unicodeAtLimit = '"' + 'я'.repeat((JSON_TEXT_MAX_BYTES - 2) / 2) + '"';
  assert.ok(unicodeAtLimit.length < JSON_TEXT_MAX_BYTES);
  syntaxValid(unicodeAtLimit);
  const unicodeOversize = unicodeAtLimit.slice(0, -1) + 'a"';
  assert.ok(unicodeOversize.length < JSON_TEXT_MAX_BYTES);
  const measured = rejection(inspectJsonText(unicodeOversize), 'INGEST_SIZE');
  assert.equal(measured.utf8Bytes, JSON_TEXT_MAX_BYTES + 1);
  assert.equal(measured.rawText, unicodeOversize);
});

test('valid JSON at 1,999,999 UTF-8 bytes preserves raw text and remains syntax-only', () => {
  const raw = '"' + 'a'.repeat(1_999_997) + '"';
  assert.equal(Buffer.byteLength(raw, 'utf8'), 1_999_999);
  const result = syntaxValid(raw);
  assert.equal(result.utf8Bytes, 1_999_999);
  assert.equal(result.rawText, raw);
  assert.equal(result.semanticAdmission, 'NOT_EVALUATED');
});

test('astral emoji use four UTF-8 bytes and respect the exact byte limit', () => {
  const emoji = '😀';
  assert.equal(emoji.length, 2);
  assert.equal(Buffer.byteLength(emoji, 'utf8'), 4);
  const raw = '"' + emoji.repeat(499_999) + 'aa"';
  assert.equal(raw.length, 1_000_002);
  assert.equal(Buffer.byteLength(raw, 'utf8'), 2_000_000);
  const result = syntaxValid(raw);
  assert.equal(result.utf8Bytes, 2_000_000);
  assert.equal(result.rawText, raw);

  const overLimit = raw.slice(0, -1) + 'a"';
  assert.ok(overLimit.length < JSON_TEXT_MAX_BYTES);
  assert.equal(Buffer.byteLength(overLimit, 'utf8'), 2_000_001);
  const rejected = rejection(inspectJsonText(overLimit), 'INGEST_SIZE');
  assert.equal(rejected.utf8Bytes, 2_000_001);
  assert.equal(rejected.rawText, overLimit);
  assert.equal(rejected.semanticAdmission, 'NOT_EVALUATED');
});

test('malformed JSON at exactly 2,000,000 bytes is a syntax error with a safe diagnostic', () => {
  const prefix = '{"secret":"BOUNDARY-PRIVATE","broken":';
  const raw = prefix + ' '.repeat(2_000_000 - Buffer.byteLength(prefix, 'utf8'));
  assert.equal(Buffer.byteLength(raw, 'utf8'), 2_000_000);
  const result = rejection(inspectJsonText(raw), 'INGEST_SYNTAX');
  assert.equal(result.utf8Bytes, 2_000_000);
  assert.equal(result.rawText, raw);
  assert.equal(result.semanticAdmission, 'NOT_EVALUATED');
  assert.deepEqual(result.issue, { code: 'INGEST_SYNTAX', path: '', message: 'Invalid JSON syntax.' });
  assert.doesNotMatch(JSON.stringify(result.issue), /BOUNDARY-PRIVATE|secret|broken|SyntaxError|stack/);
});

test('lone UTF-16 surrogates preserve JS text while size follows TextEncoder', () => {
  for (const surrogate of ['\ud800', '\udc00']) {
    const raw = '"' + surrogate + '"';
    const encodedSize = new TextEncoder().encode(raw).byteLength;
    assert.equal(raw.length, 3);
    assert.equal(encodedSize, 5);
    const result = syntaxValid(raw);
    assert.equal(result.utf8Bytes, encodedSize);
    assert.equal(result.rawText, raw);
    assert.equal(result.rawText!.charCodeAt(1), surrogate.charCodeAt(0));
    assert.equal(result.rawText!.includes('\ufffd'), false);
    assert.equal(result.semanticAdmission, 'NOT_EVALUATED');
    // This preserves the supplied JS string, not bytes of an external file.
  }
});

test('size rejection precedes parsing for both UTF-16 lower-bound and measured UTF-8 excess', () => {
  const original = JSON.parse;
  let calls = 0;
  JSON.parse = () => { calls++; throw new Error('Parser must not run.'); };
  try {
    rejection(inspectJsonText('{'.repeat(JSON_TEXT_MAX_BYTES + 1)), 'INGEST_SIZE');
    rejection(inspectJsonText('я'.repeat(1_000_001)), 'INGEST_SIZE');
    assert.equal(calls, 0);
  } finally { JSON.parse = original; }
});

test('non-string inputs are rejected without coercion, getters or Proxy traps', () => {
  let accesses = 0;
  const hostile = Object.defineProperty({}, 'raw', { get() { accesses++; throw new Error('Getter'); } });
  Object.defineProperty(hostile, 'toString', { get() { accesses++; throw new Error('Coercion'); } });
  const proxy = new Proxy({}, {
    get() { accesses++; throw new Error('get'); },
    ownKeys() { accesses++; throw new Error('ownKeys'); },
    getPrototypeOf() { accesses++; throw new Error('getPrototypeOf'); },
  });
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  for (const input of [undefined, null, 1, true, Symbol('raw'), 1n, () => {}, [], {},
    new String('{}'), hostile, proxy, revoked.proxy]) {
    const result = rejection(inspectJsonText(input), 'INGEST_INPUT_TYPE');
    assert.equal(result.rawText, null);
    assert.equal(result.utf8Bytes, null);
  }
  assert.equal(accesses, 0);
});

test('prototype-related JSON keys remain untrusted data without modifying prototypes', () => {
  const before = Object.getOwnPropertyDescriptors(Object.prototype);
  syntaxValid('{"__proto__":{"polluted":true},"constructor":{"prototype":{}},"toString":"data"}');
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), before);
  assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false);
});

test('deep JSON within the byte limit is inspected without inventing a depth admission policy', () => {
  const depth = 10_000;
  syntaxValid('['.repeat(depth) + '0' + ']'.repeat(depth));
});

test('duplicate keys and numeric semantics are not presented as semantically admitted', () => {
  for (const raw of ['{"x":1,"x":2}', '1e400', '9007199254740993']) syntaxValid(raw);
});

test('JSON text never executes embedded code and inspection neither accesses storage nor logs raw', () => {
  const names = ['localStorage', 'indexedDB', 'window', 'fetch'] as const;
  const prior = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const log = console.log, warn = console.warn, error = console.error;
  let accesses = 0, logs = 0;
  try {
    for (const name of names) Object.defineProperty(globalThis, name, {
      configurable: true, get() { accesses++; throw new Error('Unexpected storage/network access.'); },
    });
    console.log = console.warn = console.error = () => { logs++; };
    syntaxValid('{"code":"globalThis.__f1aExecuted = true","source":"not-a-default-profile"}');
    rejection(inspectJsonText('globalThis.__f1aExecuted = true'), 'INGEST_SYNTAX');
    assert.equal(Object.hasOwn(globalThis, '__f1aExecuted'), false);
    assert.equal(accesses, 0);
    assert.equal(logs, 0);
  } finally {
    names.forEach((name, i) => {
      if (prior[i]) Object.defineProperty(globalThis, name, prior[i]!);
      else Reflect.deleteProperty(globalThis, name);
    });
    console.log = log; console.warn = warn; console.error = error;
  }
});

test('encoding and unexpected parser failures return safe diagnostics and preserve raw', () => {
  const raw = '{"secret":"KEEP-PRIVATE"}';
  const encoder = globalThis.TextEncoder;
  try {
    globalThis.TextEncoder = class { constructor() { throw new Error(raw); } } as unknown as typeof TextEncoder;
    const result = rejection(inspectJsonText(raw), 'INGEST_INTERNAL');
    assert.equal(result.rawText, raw);
    assert.equal(result.utf8Bytes, null);
    assert.doesNotMatch(JSON.stringify(result.issue), /KEEP-PRIVATE/);
  } finally { globalThis.TextEncoder = encoder; }

  const parse = JSON.parse;
  try {
    JSON.parse = () => { throw new Error(raw); };
    const result = rejection(inspectJsonText(raw), 'INGEST_INTERNAL');
    assert.equal(result.rawText, raw);
    assert.equal(result.utf8Bytes, Buffer.byteLength(raw));
    assert.doesNotMatch(JSON.stringify(result.issue), /KEEP-PRIVATE/);
  } finally { JSON.parse = parse; }
});
