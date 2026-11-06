import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preflightJsonNumeric } from '../src/readonly/json-preflight-numeric';
import { preflightJsonGrammar } from '../src/readonly/json-preflight-grammar';
import { preflightJsonKeysUnicode } from '../src/readonly/json-preflight-keys';
import { inspectJsonText } from '../src/readonly/inspect-json-text';
import { JSON_PREFLIGHT_TEST_LIMITS as limits } from '../src/readonly/json-preflight-limits';
import type { JsonNumericIssueCode, JsonNumericPreflight } from '../src/readonly/json-preflight-numeric.types';

const hidden = ['checked', 'valid', 'parsed', 'value', 'digest', 'tokens', 'number', 'decimal', 'numericValue'];

function absent(result: JsonNumericPreflight) {
  assert.equal(result.scope, 'F1B-I03');
  assert.equal(result.profileId, 'balanced-i01-test-v1');
  assert.equal(result.profileStatus, 'PROVISIONAL_TEST_ONLY');
  assert.equal(result.policyInspection, 'INCOMPLETE');
  assert.equal(result.semanticAdmission, 'NOT_EVALUATED');
  assert.equal(result.checks.duplicateKeys, 'NOT_IMPLEMENTED');
  assert.equal(result.checks.unicodePolicy, 'NOT_IMPLEMENTED');
  assert.equal(result.checks.policyReport, 'NOT_IMPLEMENTED');
  assert.equal(result.checks.trustedAdmission, 'NOT_IMPLEMENTED');
  for (const key of hidden) assert.equal(Object.hasOwn(result, key), false);
}

function passed(raw: string) {
  const result = preflightJsonNumeric(raw);
  absent(result);
  assert.equal(result.kind, 'numeric-complete', result.kind === 'rejected' ? result.issue.code : '');
  if (result.kind !== 'numeric-complete') throw new Error('Expected local numeric completion.');
  assert.equal(result.counterSemantics, 'COMPLETE_DOCUMENT');
  assert.equal(result.rawText, raw);
  assert.equal(result.checks.grammar, 'PASS');
  assert.equal(result.checks.structuralLimits, 'PASS');
  assert.equal(result.checks.numericPolicy, 'PASS');
  assert.equal(Object.hasOwn(result, 'issue'), false);
  return result;
}

function failed(raw: string, code: JsonNumericIssueCode) {
  const result = preflightJsonNumeric(raw);
  absent(result);
  assert.equal(result.kind, 'rejected');
  if (result.kind !== 'rejected') throw new Error('Expected rejection.');
  assert.equal(result.rawText, raw);
  assert.equal(result.issue.code, code);
  assert.equal(result.issue.path, '');
  assert.equal(result.counterSemantics, 'COMPLETE_DOCUMENT');
  assert.equal(result.checks.grammar, 'PASS');
  assert.equal(result.checks.structuralLimits, 'PASS');
  assert.equal(result.checks.numericPolicy, 'FAIL');
  return result;
}

test('finite safe decimals and ordinary documents pass only the local numeric check', () => {
  for (const raw of ['0', '0.0', '0e2', '0e+2', '0E2', '0e999', '0e1000', '0.5', '0.1',
    '1.2300e2', '1e+2', '1E-2', '0.0000001', '123.4500', '9007199254740991',
    '-9007199254740991', '9007199254740990', '9007199254740991.0', '-0.1', '5e-324',
    '{"n":0.1,"m":[0.5,1.2300e2,9007199254740991]}',
    '{"a":-9007199254740991,"b":0}', '[]', 'true', '"1e309"']) {
    const before = raw;
    const result = passed(raw);
    assert.equal(raw, before);
    assert.deepEqual(result, preflightJsonNumeric(raw));
  }
});

test('lexical negative zero is rejected without rewriting the raw lexeme', () => {
  for (const raw of ['-0', '-0.0', '-0.00', '-0e2', '-0e+2', '-0E2', '-0.0e0', '-0e999', '-0e1000']) {
    const result = failed(raw, 'PREFLIGHT_NUMBER_NEGATIVE_ZERO');
    assert.equal(result.issue.message, 'Lexical negative zero.');
    assert.deepEqual(result.issue.span, { start: 0, end: raw.length });
    assert.equal(result.rawText, raw);
    assert.equal(result.rawText!.includes('0') && result.rawText!.startsWith('-'), true);
    assert.doesNotMatch(JSON.stringify(result.issue), /^-0|\\u002d0/);
  }
});

test('safe-integer, precision, non-finite and underflow use the N3 priority', () => {
  for (const raw of ['9007199254740992', '9007199254740993', '9007199254740992.0',
    '-9007199254740992', '1e308', '1e20']) {
    const result = failed(raw, 'PREFLIGHT_NUMBER_UNSAFE_INTEGER');
    assert.equal(result.issue.message, 'Numeric integer exceeds the safe integer range.');
    assert.deepEqual(result.issue.span, { start: 0, end: raw.length });
  }
  // 1e308 is finite and its toString spelling 1e+308 is the same decimal.
  // The integer rule is reported first, not round-trip and not non-finite.
  assert.equal(Number.isFinite(Number('1e308')), true);
  assert.equal(failed('1e308', 'PREFLIGHT_NUMBER_UNSAFE_INTEGER').issue.code,
    'PREFLIGHT_NUMBER_UNSAFE_INTEGER');

  for (const raw of ['9007199254740991.1', '0.10000000000000001', '9007199254740991.10']) {
    const result = failed(raw, 'PREFLIGHT_NUMBER_PRECISION');
    assert.equal(result.issue.message, 'Numeric decimal does not round-trip.');
    assert.deepEqual(result.issue.span, { start: 0, end: raw.length });
    assert.doesNotMatch(JSON.stringify(result.issue), /9007199254740991|10000000000000001/);
  }

  for (const raw of ['1e309', '-1e400', '1e1000', '-1e309']) {
    const result = failed(raw, 'PREFLIGHT_NUMBER_NON_FINITE');
    assert.equal(result.issue.message, 'Numeric value is not finite.');
    assert.deepEqual(result.issue.span, { start: 0, end: raw.length });
  }
  assert.notEqual(failed('-1e400', 'PREFLIGHT_NUMBER_NON_FINITE').issue.code,
    'PREFLIGHT_NUMBER_NEGATIVE_ZERO');

  for (const raw of ['1e-324', '-1e-324']) {
    const result = failed(raw, 'PREFLIGHT_NUMBER_UNDERFLOW');
    assert.equal(result.issue.message, 'Nonzero numeric value underflows to zero.');
    assert.deepEqual(result.issue.span, { start: 0, end: raw.length });
  }
  assert.equal(failed('-1e-324', 'PREFLIGHT_NUMBER_UNDERFLOW').issue.code,
    'PREFLIGHT_NUMBER_UNDERFLOW');
});

test('the earlier number token wins inside one document', () => {
  const negativeFirst = '[-0,1e309]';
  const negative = failed(negativeFirst, 'PREFLIGHT_NUMBER_NEGATIVE_ZERO');
  assert.deepEqual(negative.issue.span, { start: 1, end: 3 });
  assert.equal(negativeFirst.slice(1, 3), '-0');

  const infiniteFirst = '[1e309,-0]';
  const infinite = failed(infiniteFirst, 'PREFLIGHT_NUMBER_NON_FINITE');
  assert.deepEqual(infinite.issue.span, { start: 1, end: 6 });
  assert.equal(infiniteFirst.slice(1, 6), '1e309');

  const tinyFirst = '[1e-324,0.10000000000000001]';
  const tiny = failed(tinyFirst, 'PREFLIGHT_NUMBER_UNDERFLOW');
  assert.equal(tinyFirst.slice(tiny.issue.span!.start, tiny.issue.span!.end), '1e-324');

  const fractionFirst = '[0.10000000000000001,1e309]';
  const fraction = failed(fractionFirst, 'PREFLIGHT_NUMBER_PRECISION');
  assert.equal(fractionFirst.slice(fraction.issue.span!.start, fraction.issue.span!.end),
    '0.10000000000000001');

  const located = '{"KEEP-PRIVATE":-0.0}';
  const secret = failed(located, 'PREFLIGHT_NUMBER_NEGATIVE_ZERO');
  assert.equal(located.slice(secret.issue.span!.start, secret.issue.span!.end), '-0.0');
  assert.doesNotMatch(JSON.stringify(secret.issue), /KEEP-PRIVATE/);
  assert.equal(secret.rawText, located);
});

test('exponent and token budgets stay I01 rejections and are not precision findings', () => {
  const cases: Array<[string, JsonNumericIssueCode]> = [
    ['1e1001', 'PREFLIGHT_EXPONENT_MAGNITUDE'],
    ['0e1001', 'PREFLIGHT_EXPONENT_MAGNITUDE'],
    ['1e00000', 'PREFLIGHT_EXPONENT_DIGITS'],
    ['1' + '0'.repeat(limits.numberTokenUnits), 'PREFLIGHT_NUMBER_TOKEN'],
    ['01', 'PREFLIGHT_SYNTAX'],
    ['+1', 'PREFLIGHT_SYNTAX'],
    ['NaN', 'PREFLIGHT_SYNTAX'],
    ['Infinity', 'PREFLIGHT_SYNTAX'],
    ['-', 'PREFLIGHT_SYNTAX'],
    ['', 'PREFLIGHT_SYNTAX'],
  ];
  for (const [raw, code] of cases) {
    const grammar = preflightJsonGrammar(raw);
    const result = preflightJsonNumeric(raw);
    assert.equal(grammar.kind, 'rejected');
    assert.equal(result.kind, 'rejected');
    if (grammar.kind !== 'rejected' || result.kind !== 'rejected') throw new Error('Expected rejection.');
    absent(result);
    assert.equal(result.issue.code, code);
    assert.equal(result.issue.message, grammar.issue.message);
    assert.deepEqual(result.issue.span, grammar.issue.span);
    assert.equal(result.counterSemantics, grammar.counterSemantics);
    assert.deepEqual(result.counters, grammar.counters);
    assert.equal(result.checks.numericPolicy, 'UNKNOWN');
    assert.notEqual(result.checks.numericPolicy, 'PASS');
    assert.equal(result.rawText, raw);
  }
  const exact = '1' + '0'.repeat(limits.numberTokenUnits - 1);
  assert.equal(exact.length, limits.numberTokenUnits);
  failed(exact, 'PREFLIGHT_NUMBER_UNSAFE_INTEGER');
  passed('0e' + '9'.repeat(limits.exponentDigits - 1));
  passed('1e' + '0'.repeat(limits.exponentDigits - 1) + '1');
});

test('a finished grammar rejection keeps counters while a numeric rejection does too', () => {
  const raw = ' \r\n{"n":-0}\r\n';
  const grammar = preflightJsonGrammar(raw);
  const result = failed(raw, 'PREFLIGHT_NUMBER_NEGATIVE_ZERO');
  assert.equal(grammar.kind, 'grammar-structural-complete');
  if (grammar.kind !== 'grammar-structural-complete') throw new Error('Expected grammar completion.');
  assert.deepEqual(result.counters, grammar.counters);
  assert.equal(result.rawText, raw);
  assert.equal(raw.slice(result.issue.span!.start, result.issue.span!.end), '-0');
});

test('I01, I02 and F1a do not gain a numeric verdict from this package', () => {
  for (const raw of ['-0', '1e400', '9007199254740993', '0.1', '5e-324']) {
    const grammar = preflightJsonGrammar(raw);
    assert.equal(grammar.kind, 'grammar-structural-complete');
    if (grammar.kind !== 'grammar-structural-complete') throw new Error('Expected I01 completion.');
    assert.equal(grammar.scope, 'F1B-I01');
    assert.equal(grammar.checks.numericPolicy, 'NOT_IMPLEMENTED');
    assert.equal(grammar.checks.duplicateKeys, 'NOT_IMPLEMENTED');
    const keys = preflightJsonKeysUnicode(raw);
    assert.equal(keys.scope, 'F1B-I02');
    assert.equal(keys.kind, 'keys-unicode-complete');
    if (keys.kind !== 'keys-unicode-complete') throw new Error('Expected I02 completion.');
    assert.equal(keys.checks.duplicateKeys, 'PASS');
    assert.equal(keys.checks.unicodePolicy, 'PASS');
    assert.equal(keys.checks.numericPolicy, 'NOT_IMPLEMENTED');
    assert.equal(keys.policyInspection, 'INCOMPLETE');
    const syntax = inspectJsonText(raw);
    assert.equal(syntax.kind, 'syntax-valid');
    assert.equal(syntax.semanticAdmission, 'NOT_EVALUATED');
    assert.equal(syntax.rawText, raw);
  }
  failed('-0', 'PREFLIGHT_NUMBER_NEGATIVE_ZERO');
  failed('1e400', 'PREFLIGHT_NUMBER_NON_FINITE');
  failed('9007199254740993', 'PREFLIGHT_NUMBER_UNSAFE_INTEGER');
  passed('0.1');
  passed('5e-324');
});

test('non-string input is forwarded and JSON.parse is not used', () => {
  let calls = 0;
  const proxy = new Proxy({}, { get() { calls++; return ''; } });
  const result = preflightJsonNumeric(proxy);
  absent(result);
  assert.equal(result.kind, 'rejected');
  if (result.kind !== 'rejected') throw new Error('Expected rejection.');
  assert.equal(result.issue.code, 'PREFLIGHT_INPUT_TYPE');
  assert.equal(result.rawText, null);
  assert.equal(result.checks.numericPolicy, 'UNKNOWN');
  assert.equal(calls, 0);

  const original = JSON.parse;
  let parses = 0;
  JSON.parse = () => { parses++; throw new Error('native parse'); };
  try {
    passed('{"a":0.1,"b":-12.5}');
    failed('-0.0', 'PREFLIGHT_NUMBER_NEGATIVE_ZERO');
    failed('1e309', 'PREFLIGHT_NUMBER_NON_FINITE');
    assert.equal(parses, 0);
  } finally {
    JSON.parse = original;
  }
});
