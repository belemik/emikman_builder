import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preflightJsonGrammar } from '../src/readonly/json-preflight-grammar';
import { JSON_PREFLIGHT_TEST_LIMITS as limits } from '../src/readonly/json-preflight-limits';
import type { JsonGrammarPreflight, JsonPreflightIssueCode } from '../src/readonly/json-preflight.types';

function incomplete(result: JsonGrammarPreflight) {
  assert.equal(result.scope, 'F1B-I01');
  assert.equal(result.profileStatus, 'PROVISIONAL_TEST_ONLY');
  assert.equal(result.profileId, 'balanced-i01-test-v1');
  assert.equal(result.policyInspection, 'INCOMPLETE');
  assert.equal(result.semanticAdmission, 'NOT_EVALUATED');
  for (const key of ['duplicateKeys', 'unicodePolicy', 'numericPolicy', 'policyReport', 'trustedAdmission'] as const) {
    assert.equal(result.checks[key], 'NOT_IMPLEMENTED');
  }
  for (const key of ['value', 'parsed', 'parsedObject', 'checked', 'valid', 'digest']) {
    assert.equal(Object.hasOwn(result, key), false);
  }
}
function complete(raw: string) {
  const result = preflightJsonGrammar(raw);
  incomplete(result);
  assert.equal(result.kind, 'grammar-structural-complete',
    result.kind === 'rejected' ? result.issue.code : '');
  if (result.kind !== 'grammar-structural-complete') throw new Error('Expected local completion.');
  assert.equal(result.counterSemantics, 'COMPLETE_DOCUMENT');
  assert.equal(result.rawText, raw);
  assert.equal(result.utf8Bytes, Buffer.byteLength(raw, 'utf8'));
  assert.equal(result.checks.grammar, 'PASS');
  assert.equal(result.checks.structuralLimits, 'PASS');
  return result;
}
function rejected(input: unknown, code: JsonPreflightIssueCode) {
  const result = preflightJsonGrammar(input);
  incomplete(result);
  assert.equal(result.kind, 'rejected');
  if (result.kind !== 'rejected') throw new Error('Expected rejection.');
  assert.equal(result.counterSemantics, 'PARTIAL_SCAN_ATTEMPTS');
  assert.equal(result.issue.code, code);
  assert.equal(result.issue.path, '');
  assert.equal(result.rawText, typeof input === 'string' ? input : null);
  assert.equal(Object.hasOwn(result, 'tokens'), false); // No partial token stream.
  assert.notEqual(result.checks.grammar, 'PASS');
  return result;
}
const array = (n: number) => '[' + Array(n).fill('0').join(',') + ']';
const object = (n: number) => '{' + Array(n).fill('"":0').join(',') + '}';
function chunked(total: number, chunk: number, make: (n: number) => string): string {
  const parts: string[] = [];
  for (let left = total; left > 0; left -= chunk) parts.push(make(Math.min(chunk, left)));
  return '[' + parts.join(',') + ']';
}

test('I01 accepts every JSON root grammar, never a complete policy', () => {
  for (const raw of ['{}', '[]', '[1,{"x":true},null]', '"text"', '0', '-12.5e+2',
    'true', 'false', 'null', ' \t\r\n{"x":[false]} \r\n']) complete(raw);
  assert.equal(Object.isFrozen(limits), true);
});

test('exact grammar rejects malformed roots, containers, trailing commas and garbage', () => {
  for (const raw of ['', ' ', '{', '[', ']', '}', '[1,]', '{"x":1,}', '[,1]',
    '{x:1}', '{"x" 1}', '{"x":}', '{"x":1 "y":2}', '{"x":1,,"y":2}',
    '[1 2]', '[1}', '{"x":1]', 'true false', 'nullx', 'undefined', 'NaN', 'Infinity',
    'True', 'FALSE', '//x\n{}', '/*x*/{}', '\ufeff{}', '\vnull', '\u00a0null']) {
    const result = rejected(raw, 'PREFLIGHT_SYNTAX');
    assert.equal(result.checks.grammar, 'FAIL');
    assert.equal(result.checks.structuralLimits, 'UNKNOWN');
    assert.ok(result.issue.span);
    assert.ok(result.issue.span.start >= 0 && result.issue.span.end <= raw.length);
  }
});

test('number grammar is complete but does not implement numeric policy', () => {
  for (const raw of ['0', '-0', '0.0', '-0.0', '1', '-1', '123.456', '0e0', '1e+2',
    '1E-2', '1e0001', '1e400', '1e-324', '9007199254740993', '0.10000000000000001']) {
    const result = complete(raw);
    assert.equal(result.tokens[0].kind, 'number');
    assert.equal(result.tokens[0].end, raw.length);
  }
  for (const raw of ['-', '+1', '01', '-01', '00', '.1', '1.', '1.e2', '1e', '1e+', '1e-', '--1', '1..0']) {
    rejected(raw, 'PREFLIGHT_SYNTAX');
  }
});

test('string grammar handles all escapes, quotes, backslashes and escaped delimiters', () => {
  for (const raw of [String.raw`"\"\\\/\b\f\n\r\t"`,
    String.raw`{"\u0061":"[{}],:\"\\","a":"\uD83D\uDE00"}`,
    '"é😀"', String.raw`"\u0000\uFFFF"`]) complete(raw);
  for (const raw of ['"', '"abc', '"abc\\', '"a\nb"', '"\t"', '"\u0000"',
    String.raw`"\x20"`, String.raw`"\v"`, String.raw`"\0"`, String.raw`"\u123"`,
    String.raw`"\u12x4"`, String.raw`"\u{1234}"`, String.raw`"\U1234"`]) {
    rejected(raw, 'PREFLIGHT_SYNTAX');
  }
});

test('spans are exact half-open UTF-16 raw token offsets, without decoded values', () => {
  const raw = String.raw` {"\u0061":["😀",-1.2e+3,true,false,null]} `;
  const result = complete(raw);
  assert.deepEqual(result.tokens.map(t => raw.slice(t.start, t.end)),
    ['{', '"\\u0061"', ':', '[', '"😀"', ',', '-1.2e+3', ',', 'true', ',', 'false', ',', 'null', ']', '}']);
  const key = result.tokens.find(t => t.kind === 'key')!;
  assert.equal(key.depth, 1);
  assert.equal(key.decodedUnits, 1);
  assert.equal(key.end - key.start, 8);
  const str = result.tokens.find(t => t.kind === 'string')!;
  assert.equal(str.depth, 2);
  assert.equal(str.decodedUnits, 2);
  assert.equal(str.end - str.start, 4);
  for (const token of result.tokens) {
    assert.deepEqual(Object.keys(token).sort(),
      (token.decodedUnits === undefined ? ['depth', 'end', 'kind', 'start']
        : ['decodedUnits', 'depth', 'end', 'kind', 'start']).sort());
  }
});

test('counters distinguish value nodes, key occurrences, properties, items and string units', () => {
  const raw = String.raw`{"\u0061":["😀","\n"],"x":{}}`;
  const { counters } = complete(raw);
  assert.deepEqual(counters, { nodes: 5, keys: 2, properties: 2, arrayItems: 2,
    maxDepth: 2, maxObjectProperties: 2, maxArrayItems: 2,
    rawStringTokenUnits: 19, maxRawStringTokenUnits: 8,
    decodedKeyUnits: 2, decodedStringUnits: 3, totalDecodedUnits: 5,
    maxKeyUnits: 1, maxStringUnits: 2 });
});

test('depth boundaries include scalar children; root is zero; empty containers obey the same convention', () => {
  for (const n of [limits.depth - 1, limits.depth]) {
    assert.equal(complete('['.repeat(n) + '0' + ']'.repeat(n)).counters.maxDepth, n);
  }
  rejected('['.repeat(limits.depth + 1) + '0' + ']'.repeat(limits.depth + 1), 'PREFLIGHT_DEPTH');
  assert.equal(complete('['.repeat(limits.depth + 1) + ']'.repeat(limits.depth + 1)).counters.maxDepth, limits.depth);
  rejected('['.repeat(limits.depth + 2) + ']'.repeat(limits.depth + 2), 'PREFLIGHT_DEPTH');
  complete('{"x":'.repeat(limits.depth) + '0' + '}'.repeat(limits.depth));
  rejected('{"x":'.repeat(limits.depth + 1) + '0' + '}'.repeat(limits.depth + 1), 'PREFLIGHT_DEPTH');
});

test('10,000 deep arrays and objects stop safely at the provisional depth limit', () => {
  for (const raw of ['['.repeat(10_000) + '0' + ']'.repeat(10_000),
    '{"x":'.repeat(10_000) + '0' + '}'.repeat(10_000)]) {
    const result = rejected(raw, 'PREFLIGHT_DEPTH');
    assert.equal(result.counters.maxDepth, limits.depth);
    assert.ok(result.counters.nodes <= limits.depth + 1);
  }
});

test('node total L-1/L/L+1 is independent of per-array item limit', () => {
  for (const n of [limits.nodes - 1, limits.nodes, limits.nodes + 1]) {
    // root + two nested arrays + their scalar children = n values.
    const raw = '[' + array(49_999) + ',' + array(n - 3 - 49_999) + ']';
    if (n <= limits.nodes) assert.equal(complete(raw).counters.nodes, n);
    else rejected(raw, 'PREFLIGHT_NODES');
  }
});

test('large flat arrays respect inclusive L-1/L/L+1 item limit', () => {
  for (const n of [limits.arrayItems - 1, limits.arrayItems]) {
    const result = complete(array(n));
    assert.equal(result.counters.arrayItems, n);
    assert.equal(result.counters.maxArrayItems, n);
    assert.equal(result.counters.nodes, n + 1);
  }
  rejected(array(limits.arrayItems + 1), 'PREFLIGHT_ARRAY_ITEMS');
});

test('per-object properties L-1/L/L+1 count duplicate occurrences without dedupe', () => {
  for (const n of [limits.objectProperties - 1, limits.objectProperties]) {
    const result = complete(object(n));
    assert.equal(result.counters.properties, n);
    assert.equal(result.counters.keys, n);
    assert.equal(result.counters.maxObjectProperties, n);
  }
  rejected(object(limits.objectProperties + 1), 'PREFLIGHT_OBJECT_PROPERTIES');
});

test('total properties L-1/L/L+1 is distinct from per-object count', () => {
  for (const n of [limits.properties - 1, limits.properties, limits.properties + 1]) {
    const raw = chunked(n, limits.objectProperties, object);
    if (n <= limits.properties) {
      const result = complete(raw);
      assert.equal(result.counters.properties, n);
      assert.equal(result.counters.keys, n);
    } else rejected(raw, 'PREFLIGHT_PROPERTIES');
  }
});

test('decoded string limit L-1/L/L+1 includes astral and escaped UTF-16 units', () => {
  for (const n of [limits.stringUnits - 1, limits.stringUnits, limits.stringUnits + 1]) {
    const raw = '"' + 'a'.repeat(n) + '"';
    if (n <= limits.stringUnits) assert.equal(complete(raw).counters.maxStringUnits, n);
    else rejected(raw, 'PREFLIGHT_STRING_UNITS');
  }
  complete('"' + '😀'.repeat(limits.stringUnits / 2) + '"');
  rejected('"' + '😀'.repeat(limits.stringUnits / 2) + 'a"', 'PREFLIGHT_STRING_UNITS');
  complete('"' + '\\u0061'.repeat(limits.stringUnits) + '"');
  rejected('"' + '\\u0061'.repeat(limits.stringUnits + 1) + '"', 'PREFLIGHT_STRING_UNITS');
});

test('decoded key limit L-1/L/L+1 counts escapes and astral keys', () => {
  for (const n of [limits.keyUnits - 1, limits.keyUnits, limits.keyUnits + 1]) {
    const raw = '{"' + '\\u0061'.repeat(n) + '":0}';
    if (n <= limits.keyUnits) assert.equal(complete(raw).counters.maxKeyUnits, n);
    else rejected(raw, 'PREFLIGHT_KEY_UNITS');
  }
  complete('{"' + '😀'.repeat(limits.keyUnits / 2) + '":0}');
  rejected('{"' + '😀'.repeat(limits.keyUnits / 2) + 'x":0}', 'PREFLIGHT_KEY_UNITS');
});

test('aggregate decoded units L-1/L/L+1 include all key and value occurrences', () => {
  for (const n of [limits.totalDecodedUnits - 1, limits.totalDecodedUnits, limits.totalDecodedUnits + 1]) {
    const raw = chunked(n, limits.stringUnits, size => '"' + 'a'.repeat(size) + '"');
    if (n <= limits.totalDecodedUnits) assert.equal(complete(raw).counters.totalDecodedUnits, n);
    else rejected(raw, 'PREFLIGHT_TOTAL_DECODED_UNITS');
  }
  // 4,000 identical keys are still 4,000 occurrences, never deduped.
  const key = 'k'.repeat(250);
  const exact = '{' + Array(4_000).fill('"' + key + '":0').join(',') + '}';
  assert.equal(complete(exact).counters.totalDecodedUnits, limits.totalDecodedUnits);
  rejected(exact.slice(0, -1) + ',"x":0}', 'PREFLIGHT_TOTAL_DECODED_UNITS');
});

test('raw number token budget L-1/L/L+1 bounds work without applying N3', () => {
  for (const n of [limits.numberTokenUnits - 1, limits.numberTokenUnits]) {
    complete('1'.repeat(n));
  }
  rejected('1'.repeat(limits.numberTokenUnits + 1), 'PREFLIGHT_NUMBER_TOKEN');
});

test('exponent digit and magnitude budgets have independent exact boundaries', () => {
  for (const n of [limits.exponentDigits - 1, limits.exponentDigits]) complete('1e' + '0'.repeat(n));
  rejected('1e' + '0'.repeat(limits.exponentDigits + 1), 'PREFLIGHT_EXPONENT_DIGITS');
  for (const sign of ['', '+', '-']) {
    complete('1e' + sign + (limits.exponentMagnitude - 1));
    complete('1e' + sign + limits.exponentMagnitude);
    rejected('1e' + sign + (limits.exponentMagnitude + 1), 'PREFLIGHT_EXPONENT_MAGNITUDE');
  }
});

test('UTF-8 input bytes L-1/L/L+1 are checked before full scan, including emoji', () => {
  for (const n of [limits.inputUtf8Bytes - 1, limits.inputUtf8Bytes]) {
    assert.equal(complete('0' + ' '.repeat(n - 1)).utf8Bytes, n);
  }
  const early = rejected('0' + ' '.repeat(limits.inputUtf8Bytes), 'PREFLIGHT_INPUT_SIZE');
  assert.equal(early.utf8Bytes, null);
  assert.equal(early.counters.nodes, 0);
  const prefix = '"😀"'; // 6 bytes, only 4 code units.
  const exact = prefix + ' '.repeat(limits.inputUtf8Bytes - 6);
  assert.equal(complete(exact).utf8Bytes, limits.inputUtf8Bytes);
  const measured = rejected(exact + ' ', 'PREFLIGHT_INPUT_SIZE');
  assert.equal(measured.utf8Bytes, limits.inputUtf8Bytes + 1);
  assert.equal(measured.counters.nodes, 0);
  rejected('"' + '😀'.repeat(500_000) + '"', 'PREFLIGHT_INPUT_SIZE');
});

test('malformed JSON at exactly byte ceiling is syntax failure, not size failure', () => {
  const raw = '{"secret":"KEEP-PRIVATE",' + ' '.repeat(limits.inputUtf8Bytes - 25);
  // Count independently; pad to the exact byte ceiling.
  const exact = raw.slice(0, limits.inputUtf8Bytes);
  assert.equal(Buffer.byteLength(exact), limits.inputUtf8Bytes);
  const result = rejected(exact, 'PREFLIGHT_SYNTAX');
  assert.equal(result.utf8Bytes, limits.inputUtf8Bytes);
  assert.doesNotMatch(JSON.stringify(result.issue), /KEEP-PRIVATE|secret|SyntaxError|stack/);
});

test('raw whitespace, line endings and Unicode spelling remain unchanged on success and rejection', () => {
  for (const raw of [' \r\n{ "é": "e\u0301😀" }\n\t', String.raw`{"\u0061":"\n"}`]) {
    const before = raw;
    assert.deepEqual(complete(raw), complete(raw));
    assert.equal(raw, before);
  }
  const raw = ' \r\n{"secret":"KEEP-PRIVATE",}\r\n';
  rejected(raw, 'PREFLIGHT_SYNTAX');
});

test('prototype-like keys are just token spans and never mutate prototypes', () => {
  const before = Object.getOwnPropertyDescriptors(Object.prototype);
  const result = complete('{"__proto__":{"polluted":true},"constructor":0,"toString":null}');
  assert.equal(result.counters.properties, 4);
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), before);
  assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false);
});

test('duplicate and Unicode policy and precision remain NOT_IMPLEMENTED, never checked', () => {
  for (const raw of ['{"a":1,"a":2}', String.raw`{"a":1,"\u0061":2}`,
    '"\ud800"', '"\udc00"', String.raw`"\uD800"`, String.raw`"\uDC00"`,
    '1e400', '9007199254740993', '-0', '0.10000000000000001']) {
    const result = complete(raw);
    incomplete(result);
    assert.notEqual(result.kind as string, 'checked');
    assert.notEqual(result.policyInspection as string, 'checked');
  }
});

test('non-string, Proxy, revoked Proxy and accessor inputs are not inspected or coerced', () => {
  let calls = 0;
  const hostile = Object.defineProperty({}, 'rawText', { get() { calls++; throw new Error('getter'); } });
  Object.defineProperty(hostile, Symbol.toPrimitive, { get() { calls++; throw new Error('coercion'); } });
  const proxy = new Proxy({}, {
    get() { calls++; throw new Error('get'); }, ownKeys() { calls++; throw new Error('keys'); },
    getPrototypeOf() { calls++; throw new Error('prototype'); },
  });
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  for (const raw of [undefined, null, 0, true, Symbol(), 1n, () => {}, [], {}, new String('{}'), hostile, proxy, revoked.proxy]) {
    rejected(raw, 'PREFLIGHT_INPUT_TYPE');
  }
  assert.equal(calls, 0);
});

test('preflight never calls native JSON.parse, including unsafe or oversized input', () => {
  const original = JSON.parse;
  let calls = 0;
  JSON.parse = () => { calls++; throw new Error('Unexpected native parser'); };
  try {
    complete('{"a":[1,true,"\\u0061"]}');
    rejected('[1,]', 'PREFLIGHT_SYNTAX');
    rejected('['.repeat(10_000), 'PREFLIGHT_DEPTH');
    rejected('я'.repeat(1_000_001), 'PREFLIGHT_INPUT_SIZE');
    assert.equal(calls, 0);
  } finally { JSON.parse = original; }
});

test('pure inspection does not access storage/network, log raw or execute source strings', () => {
  const names = ['localStorage', 'sessionStorage', 'indexedDB', 'window', 'fetch', 'XMLHttpRequest', 'WebSocket'] as const;
  const prior = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const logs = [console.log, console.warn, console.error];
  let accesses = 0;
  try {
    names.forEach(name => Object.defineProperty(globalThis, name, {
      configurable: true, get() { accesses++; throw new Error('side effect'); },
    }));
    console.log = console.warn = console.error = () => { accesses++; };
    complete('{"code":"globalThis.__i01Executed = true","url":"https://invalid.test"}');
    rejected('globalThis.__i01Executed = true', 'PREFLIGHT_SYNTAX');
    assert.equal(Object.hasOwn(globalThis, '__i01Executed'), false);
    assert.equal(accesses, 0);
  } finally {
    names.forEach((name, i) => {
      if (prior[i]) Object.defineProperty(globalThis, name, prior[i]!);
      else Reflect.deleteProperty(globalThis, name);
    });
    [console.log, console.warn, console.error] = logs;
  }
});

test('unexpected encoding error yields a safe incomplete result without exposing raw', () => {
  const original = globalThis.TextEncoder;
  const raw = '{"secret":"KEEP-PRIVATE"}';
  try {
    globalThis.TextEncoder = class { constructor() { throw new Error(raw); } } as unknown as typeof TextEncoder;
    const result = rejected(raw, 'PREFLIGHT_INTERNAL');
    assert.equal(result.utf8Bytes, null);
    assert.equal(result.checks.structuralLimits, 'UNKNOWN');
    assert.doesNotMatch(JSON.stringify(result.issue), /secret|KEEP-PRIVATE|stack/);
  } finally { globalThis.TextEncoder = original; }
});

// Deterministic generated grammar cases, no model/research generation or external corpus.
test('bounded deterministic grammar corpus agrees with native syntax oracle', () => {
  let seed = 17;
  const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed; };
  const atoms = ['null', 'true', 'false', '0', '-1.25e2', '"a"', String.raw`"\u0061\n"`];
  for (let n = 0; n < 100; n++) {
    let raw = atoms[next() % atoms.length];
    for (let d = 0; d < 4; d++) {
      raw = next() % 2 ? '[' + raw + ',' + atoms[next() % atoms.length] + ']'
        : '{"x":' + raw + ',"y":' + atoms[next() % atoms.length] + '}';
    }
    assert.doesNotThrow(() => JSON.parse(raw));
    complete(raw);
    for (const mutation of [raw + 'x', raw.slice(0, -1), ',' + raw]) {
      assert.throws(() => JSON.parse(mutation), SyntaxError);
      rejected(mutation, 'PREFLIGHT_SYNTAX');
    }
  }
});


function progress(nodes: number, keys: number, items: number, depth: number,
  objectMax: number, arrayMax: number, keyUnits = 0, stringUnits = 0,
  rawUnits = 0, rawMax = 0, keyMax = 0, stringMax = 0) {
  return { nodes, keys, properties: keys, arrayItems: items, maxDepth: depth,
    maxObjectProperties: objectMax, maxArrayItems: arrayMax,
    rawStringTokenUnits: rawUnits, maxRawStringTokenUnits: rawMax,
    decodedKeyUnits: keyUnits, decodedStringUnits: stringUnits,
    totalDecodedUnits: keyUnits + stringUnits, maxKeyUnits: keyMax, maxStringUnits: stringMax };
}

test('malformed trailing-comma arrays report slot attempts, never valid item counts', () => {
  for (const [raw, expected] of [
    ['[1,]', progress(2, 0, 2, 1, 0, 2)],
    ['[1,2,]', progress(3, 0, 3, 1, 0, 3)],
  ] as const) {
    const result = rejected(raw, 'PREFLIGHT_SYNTAX');
    assert.deepEqual(result.counters, expected);
    assert.equal(result.counterSemantics, 'PARTIAL_SCAN_ATTEMPTS');
    assert.equal(result.rawText, raw);
  }
});

test('malformed object counters count completed keys even without colon or value', () => {
  for (const [raw, expected] of [
    ['{"a":1,}', progress(2, 1, 0, 1, 1, 0, 1, 0, 3, 3, 1)],
    ['{"a":}', progress(1, 1, 0, 0, 1, 0, 1, 0, 3, 3, 1)],
    ['{"a"}', progress(1, 1, 0, 0, 1, 0, 1, 0, 3, 3, 1)],
    ['{"a":tru}', progress(2, 1, 0, 1, 1, 0, 1, 0, 3, 3, 1)],
  ] as const) {
    assert.deepEqual(rejected(raw, 'PREFLIGHT_SYNTAX').counters, expected);
  }
});

test('malformed nested values retain earlier scanner progress without claiming a valid subtree', () => {
  const raw = '[{"a":[1,]}]';
  const result = rejected(raw, 'PREFLIGHT_SYNTAX');
  assert.deepEqual(result.counters, progress(4, 1, 3, 3, 1, 2, 1, 0, 3, 3, 1));
  assert.equal(result.rawText, raw);
  assert.equal(result.policyInspection, 'INCOMPLETE');
  assert.equal(result.semanticAdmission, 'NOT_EVALUATED');
});

test('interrupted strings contribute no completed string units, while their value start is counted', () => {
  const raw = '["ab","unfinished';
  assert.deepEqual(rejected(raw, 'PREFLIGHT_SYNTAX').counters,
    progress(3, 0, 2, 1, 0, 2, 0, 2, 4, 4, 0, 2));
});

test('completed arrays and objects expose exact full-document counters separately from rejected attempts', () => {
  assert.deepEqual(complete('[1,2]').counters, progress(3, 0, 2, 1, 0, 2));
  assert.deepEqual(complete('{"a":[1,2]}').counters,
    progress(4, 1, 2, 2, 1, 2, 1, 0, 3, 3, 1));
  assert.deepEqual(complete('[]').counters, progress(1, 0, 0, 0, 0, 0));
});

test('resource stop preserves bounded attempt counts and completed-token units without relaxing limits', () => {
  const itemStop = rejected(array(limits.arrayItems + 1), 'PREFLIGHT_ARRAY_ITEMS');
  assert.deepEqual(itemStop.counters,
    progress(limits.arrayItems + 1, 0, limits.arrayItems, 1, 0, limits.arrayItems));
  const depthStop = rejected('['.repeat(10_000) + '0' + ']'.repeat(10_000), 'PREFLIGHT_DEPTH');
  assert.deepEqual(depthStop.counters,
    progress(limits.depth + 1, 0, limits.depth + 1, limits.depth, 0, 1));
  const objectStop = rejected(object(limits.objectProperties + 1), 'PREFLIGHT_OBJECT_PROPERTIES');
  assert.deepEqual(objectStop.counters, progress(limits.objectProperties + 1,
    limits.objectProperties, 0, 1, limits.objectProperties, 0, 0, 0,
    limits.objectProperties * 2, 2));
  const stringStop = rejected('["ok","' + 'a'.repeat(limits.stringUnits + 1) + '"]', 'PREFLIGHT_STRING_UNITS');
  assert.deepEqual(stringStop.counters, progress(3, 0, 2, 1, 0, 2, 0, 2, 4, 4, 0, 2));
  for (const result of [itemStop, depthStop, objectStop, stringStop]) {
    assert.equal(result.counterSemantics, 'PARTIAL_SCAN_ATTEMPTS');
    assert.equal(result.checks.structuralLimits, 'FAIL');
    assert.equal(result.checks.grammar, 'UNKNOWN');
    incomplete(result);
  }
});
