import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preflightJsonKeysUnicode } from '../src/readonly/json-preflight-keys';
import { preflightJsonGrammar } from '../src/readonly/json-preflight-grammar';
import { JSON_PREFLIGHT_TEST_LIMITS as limits } from '../src/readonly/json-preflight-limits';
import { inspectJsonText } from '../src/readonly/inspect-json-text';
import type { JsonKeysUnicodePreflight } from '../src/readonly/json-preflight-keys.types';

const hidden = ['checked', 'valid', 'parsed', 'value', 'digest', 'tokens', 'decoded', 'decodedKeys'];

function absent(result: JsonKeysUnicodePreflight) {
  assert.equal(result.scope, 'F1B-I02');
  assert.equal(result.profileId, 'balanced-i01-test-v1');
  assert.equal(result.profileStatus, 'PROVISIONAL_TEST_ONLY');
  assert.equal(result.policyInspection, 'INCOMPLETE');
  assert.equal(result.semanticAdmission, 'NOT_EVALUATED');
  assert.equal(result.checks.numericPolicy, 'NOT_IMPLEMENTED');
  assert.equal(result.checks.policyReport, 'NOT_IMPLEMENTED');
  assert.equal(result.checks.trustedAdmission, 'NOT_IMPLEMENTED');
  for (const key of hidden) assert.equal(Object.hasOwn(result, key), false);
}

function passed(raw: string) {
  const result = preflightJsonKeysUnicode(raw);
  absent(result);
  assert.equal(result.kind, 'keys-unicode-complete');
  if (result.kind !== 'keys-unicode-complete') throw new Error('Expected local completion.');
  assert.equal(result.counterSemantics, 'COMPLETE_DOCUMENT');
  assert.equal(result.rawText, raw);
  assert.equal(result.checks.grammar, 'PASS');
  assert.equal(result.checks.structuralLimits, 'PASS');
  assert.equal(result.checks.duplicateKeys, 'PASS');
  assert.equal(result.checks.unicodePolicy, 'PASS');
  assert.equal(Object.hasOwn(result, 'issue'), false);
  return result;
}

function failed(raw: string) {
  const result = preflightJsonKeysUnicode(raw);
  absent(result);
  assert.equal(result.kind, 'rejected');
  if (result.kind !== 'rejected') throw new Error('Expected rejection.');
  assert.equal(result.rawText, raw);
  assert.equal(result.issue.path, '');
  assert.equal(result.checks.grammar, 'PASS');
  assert.equal(result.checks.structuralLimits, 'PASS');
  assert.equal(result.counterSemantics, 'COMPLETE_DOCUMENT');
  return result;
}

test('distinct objects, case, lookalikes and non-NFC spellings are not duplicates', () => {
  for (const raw of ['{}', '[]', '"text"', '0', 'true', 'false', 'null',
    ' \r\n{"a":1}\n', '{"x":{"a":1},"y":{"a":2}}', '[{"a":1},{"a":2}]',
    '{"A":1,"a":2}', '{"é":1,"e\u0301":2}', '{"a":1,"а":2}',
    String.raw`{"\u0061":1,"\u006A":2}`, String.raw`{"\u0041":1,"\u0061":2}`]) {
    const before = raw;
    passed(raw);
    assert.equal(raw, before);
  }
});

test('the same decoded key is one occurrence inside nested owners', () => {
  let nested = '1';
  for (let depth = 0; depth < 32; depth++) nested = '{"k":' + nested + '}';
  passed(nested);
  passed('{"a":{"a":{"a":1}}}');
  passed('[{"k":1,"n":[{"k":true}]}]');
});

test('raw and escaped duplicates use exact key-token spans and stop at the second one', () => {
  const same = '{"a":1,"a":1}';
  const repeated = failed(same);
  assert.equal(repeated.issue.code, 'PREFLIGHT_DUPLICATE_KEY');
  assert.equal(repeated.issue.message, 'Duplicate decoded key.');
  assert.equal(repeated.checks.duplicateKeys, 'FAIL');
  assert.equal(repeated.checks.unicodePolicy, 'UNKNOWN');
  assert.deepEqual(repeated.issue.priorSpan, { start: 1, end: 4 });
  assert.deepEqual(repeated.issue.span, { start: 7, end: 10 });
  assert.equal(same.slice(1, 4), '"a"');
  assert.equal(same.slice(7, 10), '"a"');

  const triple = '{"a":1,"a":2,"a":3}';
  const third = failed(triple);
  assert.deepEqual(third.issue.span, { start: 7, end: 10 });
  assert.deepEqual(third.issue.priorSpan, { start: 1, end: 4 });
  assert.notEqual(triple.slice(third.issue.span!.start, third.issue.span!.end), '"a":3');

  const escaped = String.raw`{"a":1,"\u0061":2}`;
  const escape = failed(escaped);
  assert.equal(escaped.slice(escape.issue.priorSpan!.start, escape.issue.priorSpan!.end), '"a"');
  assert.equal(escaped.slice(escape.issue.span!.start, escape.issue.span!.end), String.raw`"\u0061"`);

  const slash = String.raw`{"a\\b":1,"a\u005Cb":2}`;
  const solidus = String.raw`{"\/":1,"/":2}`;
  const empty = '{"":1,"":2}';
  const nul = String.raw`{"\u0000":1,"\u0000":2}`;
  const emoji = '{"😀":1,' + String.raw`"\uD83D\uDE00"` + ':2}';
  const accent = String.raw`{"é":1,"\u00e9":2}`;
  const upper = String.raw`{"A":1,"\u0041":2}`;
  for (const raw of [slash, solidus, empty, nul, emoji, accent, upper]) {
    const result = failed(raw);
    assert.equal(result.issue.code, 'PREFLIGHT_DUPLICATE_KEY');
    assert.equal(result.checks.unicodePolicy, 'UNKNOWN');
    assert.ok(result.issue.priorSpan && result.issue.span);
    assert.ok(result.issue.priorSpan.start < result.issue.span.start);
  }
  assert.equal(empty.slice(1, 3), '""');
  assert.deepEqual(failed(empty).issue.priorSpan, { start: 1, end: 3 });
  assert.deepEqual(failed(empty).issue.span, { start: 6, end: 8 });
  const emojiResult = failed(emoji);
  assert.equal(emoji.slice(emojiResult.issue.priorSpan!.start, emojiResult.issue.priorSpan!.end), '"😀"');
  assert.equal(emoji.slice(emojiResult.issue.span!.start, emojiResult.issue.span!.end), String.raw`"\uD83D\uDE00"`);
});

test('a nested duplicate does not blame the same key in an outer object', () => {
  const raw = '{"a":1,"b":{"a":1,"a":2}}';
  const result = failed(raw);
  const inner = raw.indexOf('{"a":1,"a":2}');
  assert.equal(result.issue.code, 'PREFLIGHT_DUPLICATE_KEY');
  assert.deepEqual(result.issue.priorSpan, { start: inner + 1, end: inner + 4 });
  assert.deepEqual(result.issue.span, { start: inner + 7, end: inner + 10 });
  assert.equal(raw.slice(result.issue.span!.start, result.issue.span!.end), '"a"');
});

test('well-formed astral text and escaped pairs pass without normalization', () => {
  passed('{"x":"😀","y":' + String.raw`"\uD83D\uDE00"` + '}');
  passed(String.raw`"\uD800\uDC00"`);
  passed('"' + '\uD800\uDC00' + '"');
  passed('"\uFFFD"');
  passed(String.raw`"\uFFFD"`);
  const lone = '"' + '\uD800' + '"';
  const replacement = '"\uFFFD"';
  const result = failed(lone);
  assert.equal(result.rawText, lone);
  assert.notEqual(result.rawText, replacement);
  assert.equal(result.rawText!.includes('\uFFFD'), false);
});

test('literal and escaped unpaired surrogates point at that code unit or escape', () => {
  const literal = '"' + '\uD800' + '"';
  const high = failed(literal);
  assert.equal(high.issue.code, 'PREFLIGHT_UNPAIRED_SURROGATE');
  assert.equal(high.issue.message, 'Unpaired UTF-16 surrogate.');
  assert.equal(high.checks.unicodePolicy, 'FAIL');
  assert.equal(high.checks.duplicateKeys, 'UNKNOWN');
  assert.equal(high.issue.priorSpan, null);
  assert.deepEqual(high.issue.span, { start: 1, end: 2 });
  assert.equal(literal.charCodeAt(1), 0xD800);

  const lowLiteral = '"' + '\uDC00' + '"';
  assert.deepEqual(failed(lowLiteral).issue.span, { start: 1, end: 2 });

  const escaped = String.raw`"\uD800"`;
  const escape = failed(escaped);
  assert.deepEqual(escape.issue.span, { start: 1, end: 7 });
  assert.equal(escaped.slice(1, 7), String.raw`\uD800`);

  const escapedLow = String.raw`"\uDC00"`;
  assert.deepEqual(failed(escapedLow).issue.span, { start: 1, end: 7 });
  const doubled = String.raw`"\uD800\uD800"`;
  assert.deepEqual(failed(doubled).issue.span, { start: 1, end: 7 });
  const lowThenHigh = String.raw`"\uDE00\uD83D"`;
  assert.deepEqual(failed(lowThenHigh).issue.span, { start: 1, end: 7 });

  const inside = String.raw`{"a":"zz\uD800zz"}`;
  const value = failed(inside);
  const at = inside.indexOf(String.raw`\uD800`);
  assert.deepEqual(value.issue.span, { start: at, end: at + 6 });
  assert.equal(inside.slice(at, at + 6), String.raw`\uD800`);

  const key = String.raw`{"\uD800":1}`;
  assert.deepEqual(failed(key).issue.span, { start: 2, end: 8 });
});

test('a literal surrogate does not borrow a partner from a neighboring escape', () => {
  const highThenEscape = '"' + '\uD800' + String.raw`\uDC00` + '"';
  const high = failed(highThenEscape);
  assert.deepEqual(high.issue.span, { start: 1, end: 2 });
  assert.equal(highThenEscape.charCodeAt(1), 0xD800);
  assert.equal(highThenEscape.slice(high.issue.span!.start, high.issue.span!.end), '\uD800');

  const low = '\uDE00';
  const escapeThenLow = String.raw`"\uD83D` + low + '"';
  const result = failed(escapeThenLow);
  const at = escapeThenLow.indexOf(low);
  assert.deepEqual(result.issue.span, { start: at, end: at + 1 });
  assert.equal(escapeThenLow.charCodeAt(at), 0xDE00);
});

test('the earlier source offset wins between a duplicate and a later surrogate', () => {
  const duplicateFirst = '{"a":1,"a":' + String.raw`"\uD800"` + '}';
  const first = failed(duplicateFirst);
  assert.equal(first.issue.code, 'PREFLIGHT_DUPLICATE_KEY');
  assert.equal(first.checks.duplicateKeys, 'FAIL');
  assert.equal(first.checks.unicodePolicy, 'UNKNOWN');
  assert.deepEqual(first.issue.span, { start: 7, end: 10 });
  assert.equal(duplicateFirst.slice(7, 10), '"a"');

  const unicodeFirst = '{"a":' + String.raw`"\uD800"` + ',"a":1}';
  const second = failed(unicodeFirst);
  assert.equal(second.issue.code, 'PREFLIGHT_UNPAIRED_SURROGATE');
  assert.equal(second.checks.unicodePolicy, 'FAIL');
  assert.equal(second.checks.duplicateKeys, 'UNKNOWN');
  const at = unicodeFirst.indexOf(String.raw`\uD800`);
  assert.deepEqual(second.issue.span, { start: at, end: at + 6 });
  assert.equal(second.issue.priorSpan, null);

  const illFormedKey = String.raw`{"\uD800":1,"\uD800":2}`;
  const third = failed(illFormedKey);
  assert.equal(third.issue.code, 'PREFLIGHT_UNPAIRED_SURROGATE');
  assert.deepEqual(third.issue.span, { start: 2, end: 8 });
});

test('numeric literals stay inside this package without a numeric verdict', () => {
  for (const raw of ['-0', '0.0', '1e400', '9007199254740993', '0.10000000000000001']) {
    const result = passed(raw);
    assert.equal(result.checks.numericPolicy, 'NOT_IMPLEMENTED');
  }
});

test('malformed I01 input stays an I01 rejection and is not a local PASS', () => {
  for (const raw of ['', '{', '[1,]', '{"a":1,}', '\ufeff{}']) {
    const grammar = preflightJsonGrammar(raw);
    const result = preflightJsonKeysUnicode(raw);
    assert.equal(grammar.kind, 'rejected');
    assert.equal(result.kind, 'rejected');
    if (grammar.kind !== 'rejected' || result.kind !== 'rejected') throw new Error('Expected rejection.');
    absent(result);
    assert.equal(result.issue.code, 'PREFLIGHT_SYNTAX');
    assert.equal(result.issue.message, grammar.issue.message);
    assert.deepEqual(result.issue.span, grammar.issue.span);
    assert.equal(result.issue.priorSpan, null);
    assert.equal(result.counterSemantics, grammar.counterSemantics);
    assert.deepEqual(result.counters, grammar.counters);
    assert.equal(result.checks.grammar, 'FAIL');
    assert.equal(result.checks.structuralLimits, 'UNKNOWN');
    assert.equal(result.checks.duplicateKeys, 'UNKNOWN');
    assert.equal(result.checks.unicodePolicy, 'UNKNOWN');
    assert.equal(result.rawText, raw);
  }
  const deep = '['.repeat(limits.depth + 1) + '0' + ']'.repeat(limits.depth + 1);
  const depth = preflightJsonKeysUnicode(deep);
  assert.equal(depth.kind, 'rejected');
  if (depth.kind !== 'rejected') throw new Error('Expected depth rejection.');
  assert.equal(depth.issue.code, 'PREFLIGHT_DEPTH');
  assert.equal(depth.checks.duplicateKeys, 'UNKNOWN');
  assert.equal(depth.checks.unicodePolicy, 'UNKNOWN');
  assert.equal(depth.checks.structuralLimits, 'FAIL');
});

test('a policy rejection keeps the finished grammar counters and the original raw', () => {
  const raw = ' \r\n{"secret":1,"secret":2}\r\n';
  const grammar = preflightJsonGrammar(raw);
  const result = failed(raw);
  assert.equal(grammar.kind, 'grammar-structural-complete');
  if (grammar.kind !== 'grammar-structural-complete') throw new Error('Expected grammar completion.');
  assert.deepEqual(result.counters, grammar.counters);
  assert.equal(result.rawText, raw);
  assert.doesNotMatch(JSON.stringify(result.issue), /secret/);
  assert.equal(Object.hasOwn(result, 'tokens'), false);
});

test('prototype-like keys stay data and do not change Object.prototype', () => {
  const before = Object.getOwnPropertyDescriptors(Object.prototype);
  passed('{"__proto__":1,"constructor":2,"toString":3}');
  const duplicated = failed('{"__proto__":1,"__proto__":2}');
  assert.equal(duplicated.issue.code, 'PREFLIGHT_DUPLICATE_KEY');
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), before);
  assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false);
});

test('I01 and F1a keep their own results for duplicates and lone surrogates', () => {
  for (const raw of ['{"a":1,"a":2}', String.raw`"\uD800"`, '"' + '\uD800' + '"', '-0']) {
    const grammar = preflightJsonGrammar(raw);
    assert.equal(grammar.kind, 'grammar-structural-complete');
    if (grammar.kind !== 'grammar-structural-complete') throw new Error('Expected I01 completion.');
    assert.equal(grammar.scope, 'F1B-I01');
    assert.equal(grammar.checks.duplicateKeys, 'NOT_IMPLEMENTED');
    assert.equal(grammar.checks.unicodePolicy, 'NOT_IMPLEMENTED');
    assert.equal(grammar.policyInspection, 'INCOMPLETE');
    const syntax = inspectJsonText(raw);
    assert.equal(syntax.kind, 'syntax-valid');
    assert.equal(syntax.semanticAdmission, 'NOT_EVALUATED');
    assert.equal(syntax.rawText, raw);
  }
});

test('non-string input is forwarded without coercion or Proxy traps', () => {
  let calls = 0;
  const proxy = new Proxy({}, { get() { calls++; return ''; } });
  const result = preflightJsonKeysUnicode(proxy);
  absent(result);
  assert.equal(result.kind, 'rejected');
  if (result.kind !== 'rejected') throw new Error('Expected rejection.');
  assert.equal(result.issue.code, 'PREFLIGHT_INPUT_TYPE');
  assert.equal(result.rawText, null);
  assert.equal(result.checks.duplicateKeys, 'UNKNOWN');
  assert.equal(result.checks.unicodePolicy, 'UNKNOWN');
  assert.equal(calls, 0);
});

test('this package does not call JSON.parse, storage, network or console', () => {
  const original = JSON.parse;
  let parses = 0;
  JSON.parse = () => { parses++; throw new Error('native parse'); };
  const names = ['localStorage', 'fetch'] as const;
  const prior = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const log = console.log;
  let side = 0;
  try {
    for (const name of names) Object.defineProperty(globalThis, name, {
      configurable: true, get() { side++; throw new Error('side effect'); },
    });
    console.log = () => { side++; };
    passed('{"a":"\\u0061"}');
    failed('{"a":1,"a":2}');
    failed(String.raw`"\uD800"`);
    assert.equal(parses, 0);
    assert.equal(side, 0);
  } finally {
    JSON.parse = original;
    console.log = log;
    names.forEach((name, index) => {
      if (prior[index]) Object.defineProperty(globalThis, name, prior[index]);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
});
