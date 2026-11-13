import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { TextDecoder } from 'node:util';
import { readFileSync } from 'node:fs';
import { decodeProjectCommandTestOnly as decode } from '../server/projects/decode-project-command';
import { PROJECT_INGEST_TEST_PROFILE as limits } from '../server/projects/ingest-profile';
import type { ProjectDecodeCode } from '../server/projects/ingest-profile';
import type { RepositoryOperation, RequestRecord } from '../src/projects/repository.dto';
import { inspectProjectRequest } from '../src/projects/request.validation';
const projectId = 'prj_00000001-0000-4000-8000-000000000000';
const header = { dtoVersion: '1.0.0', modelId: 'zarya.project-envelope', modelVersion: '1.0.0',
  registry: { id: 'zarya.project-definitions', version: '1.1.0-draft.1' } } as const;
const metadata = () => ({ name: 'Metadata fixture', description: 'Keep \r\n e\u0301 unchanged', defaultProductRef: null });
const revision = (n = '1') => ({ kind: 'project', id: `prv_0000000${n}-0000-4000-8000-000000000000`, projectId,
  integrity: { algorithm: 'sha256', encoding: 'hex-lower', byteDomain: 'zarya.project-manifest.jcs/v1', value: 'a'.repeat(64) } });
const operations: readonly RepositoryOperation[] = ['create-project', 'read-project', 'list-projects', 'update-metadata',
  'list-revisions', 'read-revision', 'create-revision', 'restore-project', 'soft-delete-project'];
function fixture(operation: RepositoryOperation): RequestRecord {
  const base = { ...header, registry: { ...header.registry } };
  switch (operation) {
    case 'create-project': return { ...base, metadata: metadata(), idempotencyKey: 'retry-1' };
    case 'read-project': return { ...base, projectId };
    case 'list-projects': return { ...base, cursor: null };
    case 'list-revisions': return { ...base, projectId, cursor: null };
    case 'read-revision': return { ...base, projectId, revision: revision() };
    case 'update-metadata': case 'create-revision': return { ...base, projectId, metadata: metadata(), expectedRevision: revision(), idempotencyKey: 'retry-1' };
    case 'restore-project': return { ...base, projectId, expectedRevision: revision(), sourceRevision: revision('2'), idempotencyKey: 'retry-1' };
    case 'soft-delete-project': return { ...base, projectId, expectedRevision: revision(), idempotencyKey: 'retry-1' };
  }
}
const bytes = (text: string) => new TextEncoder().encode(text);
const createText = (description: string) => JSON.stringify({ ...fixture('create-project'), metadata: { ...metadata(), description } });
function reject(text: string, code: ProjectDecodeCode, operation = 'create-project') {
  const result = decode(operation, bytes(text));
  assert.equal(result.kind, 'rejected', JSON.stringify(result));
  assert.equal(result.diagnostics[0]?.code, code, JSON.stringify(result));
  assert.equal(result.diagnostics.length, 1); assert.equal(result.counterSemantics, 'PARTIAL_SCAN_ATTEMPTS');
  assert.equal(result.persistencePermission, 'NOT_GRANTED'); assert.equal(result.productionInput, 'BLOCKED_BY_D05');
  assert.equal(result.diagnostics[0].path, '');
  const offset = result.diagnostics[0].offset; if (offset !== null) assert.ok(offset >= 0 && offset <= text.length);
  return result;
}
const positives: [string, RepositoryOperation, RequestRecord][] = operations.map(op => [op, op, fixture(op)]);
positives.push(['product-ref', 'create-project', { ...fixture('create-project'), metadata: { ...metadata(), defaultProductRef: { id: 'product:mobile-app', definitionVersion: '1.0.0' } } }],
  ['padded-key', 'create-project', { ...fixture('create-project'), idempotencyKey: ' retry-1 ' }],
  ['opaque-cursor', 'list-projects', { ...fixture('list-projects'), cursor: 'opaque-cursor' }]);
for (const [name, operation, input] of positives) test(`R1 P02 positive fixture ${name}: compact and pretty`, () => {
  assert.equal(inspectProjectRequest(operation, input).kind, 'dto-shape-recognized');
  for (const text of [JSON.stringify(input), JSON.stringify(input, null, 2)]) {
    const data = bytes(text), before = data.slice(), result = decode(operation, data);
    assert.equal(result.kind, 'test-dto-inspected', JSON.stringify(result)); assert.deepEqual(data, before);
    assert.equal(result.bodyBytes, data.byteLength); assert.equal(result.counterSemantics, 'COMPLETE_DOCUMENT');
    assert.equal(result.profileId, 'zarya.p04.r1.conformance.test/v0'); assert.equal(result.performance, 'UNKNOWN');
    for (const k of ['value', 'request', 'parsed', 'raw', 'bytes', 'candidate', 'trustedValue', 'fingerprint']) assert.equal(Object.hasOwn(result, k), false);
    assert.equal(result.verifiedPrincipal, 'NOT_PROVIDED'); assert.equal(result.productionCandidate, 'NOT_IMPLEMENTED');
    assert.equal(result.executionPermission, 'NOT_GRANTED'); assert.equal(result.semanticAdmission, 'NOT_EVALUATED');
    assert.equal(result.trustedAdmission, 'NOT_IMPLEMENTED'); assert.deepEqual(result.diagnostics, []);
  }
});
for (const [name, text] of Object.entries({ empty: '', whitespace: ' \r\n\t', object: '{', array: '[', colon: '{"x"}',
  comma: '{"x":null,}', arrayComma: '[null,]', repeatedComma: '[null,,null]', garbage: '{}x', twoRoots: '{}{}',
  undefined: 'undefined', comment: '//comment\n{}', badEscape: '"\\q"', badHex: '"\\u0xx0"',
  control: '"a\nb"', bom: '\ufeff{}', nonJsonWhitespace: '\u00a0{}', missingValue: '{"x":}', unterminated: '"abc' })) {
  test(`R1 malformed ${name}`, () => void reject(text, 'R1_SYNTAX'));
}
for (const text of ['{}', '[]', '"text"', 'true', 'false', 'null', '0', '-0', '1.2', '1e9999', '9007199254740993']) {
  test(`R1 grammar root ${text} never admits unsupported DTO`, () => void reject(text, 'R1_DTO'));
}
for (const text of ['01', '+1', '-', '.1', '1.', '1e', '1e+', '--1', '1e2.3', 'NaN', 'Infinity', '[1,]', '[1,2,]']) {
  test(`R1 malformed numeric/array token ${text}`, () => void reject(text, 'R1_SYNTAX'));
}
for (const text of ['{"x":null,"x":true}', '{"x":null,"\\u0078":true}', '{"x":{"a":1,"\\u0061":2}}', '{"😀":1,"\\ud83d\\ude00":2}']) {
  test(`R1 decoded duplicate ${text}`, () => void reject(text, 'R1_DUPLICATE_KEY'));
}
for (const key of ['__proto__', 'constructor', 'prototype', 'owner', 'account', 'ownerId', 'accountId', 'role', 'roles', 'principal', 'permissions', 'authorization']) {
  test(`R1 forbidden key ${key} at every level including escape spelling`, () => {
    for (const spelling of [JSON.stringify(key), '"\\u' + key.charCodeAt(0).toString(16).padStart(4, '0') + key.slice(1) + '"']) {
      reject(`{${spelling}:"forged"}`, 'R1_FORBIDDEN_KEY'); reject(`{"x":{${spelling}:null}}`, 'R1_FORBIDDEN_KEY');
    }
    assert.equal(Object.hasOwn(Object.prototype, 'forged'), false);
  });
}
for (const cp of [...Array.from({ length: 32 }, (_, n) => 0xfdd0 + n), ...Array.from({ length: 17 }, (_, plane) => [plane * 65536 + 65534, plane * 65536 + 65535]).flat()]) {
  test(`R1 Unicode noncharacter U+${cp.toString(16)} literal and escaped`, () => {
    const char = String.fromCodePoint(cp);
    const escaped = Array.from({ length: char.length }, (_, n) => '\\u' + char.charCodeAt(n).toString(16).padStart(4, '0')).join('');
    reject('"' + char + '"', 'R1_UNICODE'); reject('"' + escaped + '"', 'R1_UNICODE');
    reject('{"' + escaped + '":null}', 'R1_UNICODE');
  });
}
for (const text of ['"\\ud800"', '"\\udfff"', '"\\ud800x"', '"\\ud800\\u0061"']) test(`R1 lone surrogate ${text}`, () => void reject(text, 'R1_UNICODE'));
for (const hex of ['c0af', 'eda080', 'f4908080', 'e282', '80', 'ff', 'e228a1']) test(`R1 fatal UTF8 ${hex}`, () => {
  const result = decode('create-project', Buffer.from(hex, 'hex')); assert.equal(result.diagnostics[0]?.code, 'R1_UTF8');
  assert.equal(result.diagnostics[0].offset, null);
});
test('R1 true U+FFFD, private-use, astral, CR/LF/U+0301, quotes and slashes remain data', () => {
  for (const text of ['\ufffd\ue000😀', 'Keep \r\n e\u0301 unchanged', '"\\/\b\f\t', '\u0000']) {
    const raw = createText(text), data = bytes(raw), original = data.slice();
    assert.equal(decode('create-project', data).kind, 'test-dto-inspected'); assert.deepEqual(data, original);
  }
});
test('R1 NFC/NFD are not normalized: distinct scalar counters and bytes', () => {
  const a = decode('create-project', bytes(createText('é'.repeat(100))));
  const b = decode('create-project', bytes(createText('e\u0301'.repeat(100))));
  assert.equal(a.kind, 'test-dto-inspected'); assert.equal(b.kind, 'test-dto-inspected');
  assert.equal(a.counters.maxStringScalars, 100); assert.equal(b.counters.maxStringScalars, 200);
  assert.notEqual(a.bodyBytes, b.bodyBytes);
  reject('{"é":null,"e\\u0301":null}', 'R1_DTO'); // NOT duplicate.
});
for (const delta of [-1, 0, 1]) {
  test(`R1 actual body bytes L${delta >= 0 ? '+' : ''}${delta}`, () => {
    const raw = createText('😀'), n = limits.bodyBytes + delta, text = raw + ' '.repeat(n - bytes(raw).length);
    const result = decode('create-project', bytes(text)); assert.equal(result.bodyBytes, n);
    if (delta > 0) assert.equal(result.diagnostics[0]?.code, 'R1_SIZE'); else assert.equal(result.kind, 'test-dto-inspected');
  });
  test(`R1 depth L${delta >= 0 ? '+' : ''}${delta}`, () => {
    const n = limits.containerDepth + delta, raw = '['.repeat(n) + 'null' + ']'.repeat(n);
    const r = reject(raw, delta > 0 ? 'R1_DEPTH' : 'R1_DTO');
    assert.equal(r.counters.maxContainerDepth, Math.min(n, limits.containerDepth));
  });
  test(`R1 aggregate properties L${delta >= 0 ? '+' : ''}${delta}`, () => {
    const n = limits.properties + delta, object = (count: number, start: number) => '{' + Array.from({ length: count }, (_, j) => `"p${j + start}":null`).join(',') + '}';
    const r = reject('[' + object(1024, 0) + ',' + object(n - 1024, 1024) + ']', delta > 0 ? 'R1_PROPERTIES' : 'R1_DTO');
    assert.equal(r.counters.properties, Math.min(n, limits.properties));
  });
  test(`R1 aggregate array items L${delta >= 0 ? '+' : ''}${delta}`, () => {
    const n = limits.arrayItems + delta, arr = (count: number) => '[' + Array(count).fill('null').join(',') + ']';
    const r = reject('{"a":' + arr(256) + ',"b":' + arr(n - 256) + '}', delta > 0 ? 'R1_ARRAY_ITEMS' : 'R1_DTO');
    assert.equal(r.counters.arrayItems, Math.min(n, limits.arrayItems));
  });
  test(`R1 decoded key scalars L${delta >= 0 ? '+' : ''}${delta}`, () => {
    const key = '😀'.repeat(limits.keyScalars + delta);
    const r = reject(JSON.stringify({ [key]: null }), delta > 0 ? 'R1_KEY_SCALARS' : 'R1_DTO');
    if (delta <= 0) assert.equal(r.counters.maxKeyScalars, limits.keyScalars + delta);
  });
  test(`R1 decoded string scalars L${delta >= 0 ? '+' : ''}${delta}`, () => {
    const text = createText('a'.repeat(limits.stringScalars + delta)), result = decode('create-project', bytes(text));
    if (delta > 0) assert.equal(result.diagnostics[0]?.code, 'R1_STRING_SCALARS'); else assert.equal(result.kind, 'test-dto-inspected');
  });
  test(`R1 raw string bytes including escapes/quotes L${delta >= 0 ? '+' : ''}${delta}`, () => {
    const n = limits.rawStringTokenBytes + delta, interior = n - 2;
    const token = '"' + '\\u0061'.repeat(Math.floor(interior / 6)) + 'a'.repeat(interior % 6) + '"';
    const raw = createText('').replace('"description":""', '"description":' + token);
    assert.equal(bytes(token).length, n);
    const r = decode('create-project', bytes(raw));
    if (delta > 0) assert.equal(r.diagnostics[0]?.code, 'R1_RAW_STRING_BYTES'); else assert.equal(r.kind, 'test-dto-inspected');
  });
  test(`R1 numeric token bytes L${delta >= 0 ? '+' : ''}${delta}`, () => void reject('1'.repeat(limits.numericTokenBytes + delta), delta > 0 ? 'R1_NUMERIC_BYTES' : 'R1_DTO'));
  test(`R1 conjunctive nodes nominal L${delta >= 0 ? '+' : ''}${delta} is refused at earlier property cap`, () => {
    // A complete JSON tree has nodes=1+properties+arrayItems. At this profile's
    // 2048+512 caps, 4096 cannot be reached. Do not override budgets to manufacture PASS.
    const n = limits.nodes + delta;
    const raw = '{' + Array.from({ length: n - 1 }, (_, j) => `"x${j}":null`).join(',') + '}';
    const r = reject(raw, 'R1_PROPERTIES'); assert.ok(r.counters.nodes < limits.nodes);
  });
}
test('R1 exact structural counter definitions on complete grammar before DTO rejection', () => {
  const r = reject('{"a":[null,true],"b":{"c":"x"}}', 'R1_DTO');
  assert.equal(r.counters.nodes, 6); assert.equal(r.counters.properties, 3); assert.equal(r.counters.arrayItems, 2);
  assert.equal(r.counters.maxContainerDepth, 2);
});
test('R1 10,000 levels and large flat arrays refuse without stack overflow/internal error', () => {
  reject('['.repeat(10000) + 'null' + ']'.repeat(10000), 'R1_DEPTH');
  reject('[' + Array(20000).fill('null').join(',') + ']', 'R1_ARRAY_ITEMS');
});
test('R1 unknown/missing/version/reference/type errors remain closed', () => {
  const base = fixture('create-project');
  const cases = [{ ...base, surprise: 'SECRET' }, { ...base, dtoVersion: 'latest' }, { ...base, modelVersion: '9' },
    { ...base, registry: { ...header.registry, version: 'latest' } }, { ...base, metadata: { ...metadata(), extra: 'SECRET' } },
    { ...base, metadata: { ...metadata(), description: null } }, { ...base, metadata: { ...metadata(), defaultProductRef: { id: 'invented', definitionVersion: '1.0.0' } } },
    { ...fixture('read-project'), projectId: 'mock-1' }];
  for (const v of cases) reject(JSON.stringify(v), 'R1_DTO', Object.hasOwn(v, 'projectId') ? 'read-project' : 'create-project');
  for (const key of Object.keys(base)) { const v = { ...base }; delete v[key]; reject(JSON.stringify(v), 'R1_DTO'); }
});
test('R1 scoped revision references/digest versions are only inspected, not verified', () => {
  const base = fixture('update-metadata');
  reject(JSON.stringify({ ...base, expectedRevision: { ...revision(), projectId: 'prj_00000002-0000-4000-8000-000000000000' } }), 'R1_DTO', 'update-metadata');
  reject(JSON.stringify({ ...base, expectedRevision: { ...revision(), integrity: { ...revision().integrity, byteDomain: 'raw' } } }), 'R1_DTO', 'update-metadata');
});
test('R1 test-versioned key accepts retry-1 and exact spaces; rejects outside printable ASCII/length', () => {
  for (const key of ['retry-1', ' retry-1 ', 'x'.repeat(127), 'x'.repeat(128)])
    assert.equal(decode('create-project', bytes(JSON.stringify({ ...fixture('create-project'), idempotencyKey: key }))).kind, 'test-dto-inspected');
  for (const key of ['x'.repeat(129), 'é', 'x\n']) reject(JSON.stringify({ ...fixture('create-project'), idempotencyKey: key }), 'R1_IDEMPOTENCY_KEY');
  for (const key of ['', '   ']) reject(JSON.stringify({ ...fixture('create-project'), idempotencyKey: key }), 'R1_DTO');
});
test('R1 byte offset/view ownership, Buffer and post-call mutation', () => {
  const raw = createText('original'), storage = Buffer.from('prefix' + raw + 'suffix');
  const input = storage.subarray(6, storage.length - 6), before = input.slice();
  const result = decode('create-project', input); assert.equal(result.kind, 'test-dto-inspected'); assert.deepEqual(input, before);
  const report = JSON.stringify(result); input.fill(0); assert.equal(JSON.stringify(result), report);
});
test('R1 own byte copy is used even if source mutates at platform decode seam', () => {
  const input = bytes(createText('ORIGINAL')), originalDecode = TextDecoder.prototype.decode;
  const replacement = mock.method(TextDecoder.prototype, 'decode', function(this: TextDecoder, ...args: Parameters<TextDecoder['decode']>) {
    input.fill(0); return Reflect.apply(originalDecode, this, args);
  });
  try { assert.equal(decode('create-project', input).kind, 'test-dto-inspected'); assert.ok(input.every(n => n === 0)); }
  finally { replacement.mock.restore(); }
});
test('R1 non-byte objects/Proxy/accessors/serializers are never traversed', () => {
  let traps = 0;
  const bad = new Proxy({}, { get() { traps++; throw Error('NO'); }, getPrototypeOf() { traps++; throw Error('NO'); } });
  const array = new Proxy(bytes(createText('x')), { get() { traps++; throw Error('NO'); }, getPrototypeOf() { traps++; throw Error('NO'); } });
  for (const value of [bad, array, { get byteLength() { traps++; return 1; } }, { toJSON() { traps++; } }, [123], 'text', null]) {
    // Invalid inputs deliberately cross the TS boundary in tests, not an admission cast in runtime.
    const r = decode('create-project', value as Uint8Array); assert.equal(r.diagnostics[0]?.code, 'R1_INPUT');
  }
  assert.equal(traps, 0);
});
test('R1 intrinsic byte-source access ignores subclass getters/iterator', () => {
  let called = 0;
  const input = bytes(createText('safe'));
  for (const key of ['byteLength', 'buffer', 'byteOffset', 'length']) Object.defineProperty(input, key, { get() { called++; throw Error('NO'); } });
  Object.defineProperty(input, Symbol.iterator, { get() { called++; throw Error('NO'); } });
  assert.equal(decode('create-project', input).kind, 'test-dto-inspected'); assert.equal(called, 0);
});
test('R1 shared/detached bytes are refused; no racing byte source', () => {
  const shared = new Uint8Array(new SharedArrayBuffer(10)); assert.equal(decode('create-project', shared).diagnostics[0]?.code, 'R1_INPUT');
  const detached = bytes(createText('x')); structuredClone(detached.buffer, { transfer: [detached.buffer] });
  assert.equal(decode('create-project', detached).diagnostics[0]?.code, 'R1_INPUT');
});
test('R1 operation is exact primitive metadata, never inferred', () => {
  for (const op of ['__proto__', 'constructor', 'generate', 'unknown', 'create-project ']) {
    const r = decode(op, bytes(createText('safe'))); assert.equal(r.diagnostics[0]?.code, 'R1_OPERATION');
  }
});
test('R1 bounded private diagnostics and no partial success on many errors', () => {
  const payload = '{' + Array.from({ length: 1000 }, (_, n) => `"SECRET_${n}":"PRIVATE"`).join(',') + '}';
  const r = reject(payload, 'R1_DTO'); assert.ok(r.diagnostics.length <= limits.diagnostics);
  assert.ok(JSON.stringify(r).length < 1200); assert.ok(!JSON.stringify(r).includes('SECRET')); assert.ok(!JSON.stringify(r).includes('PRIVATE'));
  assert.deepEqual(decode('create-project', bytes(payload)), r);
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.counters) && Object.isFrozen(r.diagnostics) && Object.isFrozen(r.diagnostics[0]));
});
test('R1 internal failure fails closed without echo, fallback or partial result', () => {
  const replacement = mock.method(TextDecoder.prototype, 'decode', () => { throw Error('PRIVATE_DATA'); });
  try { const r = decode('create-project', bytes(createText('safe'))); assert.equal(r.kind, 'rejected'); assert.equal(r.diagnostics[0]?.code, 'R1_UTF8'); assert.ok(!JSON.stringify(r).includes('PRIVATE_DATA')); }
  finally { replacement.mock.restore(); }
});
test('R1 has no IO/server/storage/hash/authority integration', () => {
  const source = readFileSync(new URL('../server/projects/decode-project-command.ts', import.meta.url), 'utf8');
  for (const marker of ['node:fs', 'node:http', 'node:sqlite', 'node:crypto', 'localStorage', 'fetch(', 'JSON.parse', 'test-authority', 'metadata-repository']) assert.ok(!source.includes(marker));
  const http = readFileSync(new URL('../server/index.mjs', import.meta.url), 'utf8'); assert.ok(!http.includes('decode-project-command'));
});
test('R1 escaped astral scalars and escaped schema names share decoded semantics', () => {
  const raw = createText('😀'.repeat(100)).replaceAll('😀', '\\ud83d\\ude00').replace('"dtoVersion"', '"\\u0064toVersion"');
  const r = decode('create-project', bytes(raw)); assert.equal(r.kind, 'test-dto-inspected');
  assert.equal(r.counters.maxStringScalars, 100);
  reject('{"\\u0061":"x","a":"y"}', 'R1_DUPLICATE_KEY');
});
test('R1 raw byte size fails before UTF8 decode; oversized view does not invoke caller methods', () => {
  let calls = 0;
  const replacement = mock.method(TextDecoder.prototype, 'decode', () => { calls++; throw Error('SHOULD_NOT_DECODE'); });
  try {
    const r = decode('create-project', new Uint8Array(limits.bodyBytes + 1));
    assert.equal(r.diagnostics[0]?.code, 'R1_SIZE'); assert.equal(calls, 0); assert.equal(r.bodyBytes, limits.bodyBytes + 1);
  } finally { replacement.mock.restore(); }
});
test('R1 prototype pollution never changes host prototypes and nested duplicated names remain scoped', () => {
  const before = Object.getOwnPropertyDescriptors(Object.prototype);
  reject('{"\\u005f_proto__":{"polluted":true}}', 'R1_FORBIDDEN_KEY');
  reject('{"a":{"same":null},"b":{"same":null}}', 'R1_DTO');
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), before);
});
test('R1 unexpected internal exception cannot yield success or expose exception content', () => {
  const replacement = mock.method(String.prototype, 'codePointAt', () => { throw Error('PRIVATE_INTERNAL_DETAILS'); });
  try {
    const r = decode('create-project', bytes(createText('safe')));
    assert.equal(r.kind, 'rejected'); assert.equal(r.diagnostics[0]?.code, 'R1_INTERNAL');
    assert.ok(!JSON.stringify(r).includes('PRIVATE_INTERNAL_DETAILS')); assert.equal(Object.hasOwn(r, 'value'), false);
  } finally { replacement.mock.restore(); }
});
