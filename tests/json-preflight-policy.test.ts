import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preflightJsonPolicy, reconcileJsonPolicyModules } from '../src/readonly/json-preflight-policy';
import { preflightJsonGrammar } from '../src/readonly/json-preflight-grammar';
import { preflightJsonKeysUnicode } from '../src/readonly/json-preflight-keys';
import { preflightJsonNumeric } from '../src/readonly/json-preflight-numeric';
import { inspectJsonText } from '../src/readonly/inspect-json-text';
import { JSON_PREFLIGHT_TEST_LIMITS as limits } from '../src/readonly/json-preflight-limits';
import type { JsonGrammarPreflight } from '../src/readonly/json-preflight.types';
import type { JsonKeysUnicodePreflight } from '../src/readonly/json-preflight-keys.types';
import type { JsonNumericPreflight } from '../src/readonly/json-preflight-numeric.types';
import type { JsonPolicyPreflight } from '../src/readonly/json-preflight-policy.types';

const hidden = ['checked', 'valid', 'parsed', 'value', 'digest', 'tokens', 'decoded',
  'decodedKeys', 'number', 'decimal', 'numericValue', 'policyVersion'];

function absent(result: JsonPolicyPreflight) {
  assert.equal(result.scope, 'F1B-I04');
  assert.equal(result.profileId, 'balanced-i01-test-v1');
  assert.equal(result.profileStatus, 'PROVISIONAL_TEST_ONLY');
  assert.equal(result.policyReadiness, 'UNRESOLVED');
  assert.equal(result.semanticAdmission, 'NOT_EVALUATED');
  assert.equal(result.trustedAdmission, 'NOT_IMPLEMENTED');
  assert.notEqual(result.policyReport, 'PASS');
  for (const key of hidden) assert.equal(Object.hasOwn(result, key), false);
}

function finished(raw: string) {
  const result = preflightJsonPolicy(raw);
  absent(result);
  assert.equal(result.kind, 'checks-complete');
  if (result.kind !== 'checks-complete') throw new Error('Expected completed checks.');
  assert.equal(result.policyInspection, 'COMPLETE');
  assert.equal(result.policyReport, 'NOT_APPROVED');
  assert.equal(result.counterSemantics, 'COMPLETE_DOCUMENT');
  assert.equal(result.rawText, raw);
  assert.equal(result.checks.grammar, 'PASS');
  assert.equal(result.checks.structuralLimits, 'PASS');
  assert.equal(result.checks.duplicateKeys, 'PASS');
  assert.equal(result.checks.unicodePolicy, 'PASS');
  assert.equal(result.checks.numericPolicy, 'PASS');
  assert.equal(Object.hasOwn(result, 'issue'), false);
  assert.deepEqual(preflightJsonPolicy(raw), result);
  return result;
}

function rejected(raw: string) {
  const result = preflightJsonPolicy(raw);
  absent(result);
  assert.equal(result.kind, 'rejected');
  if (result.kind !== 'rejected') throw new Error('Expected rejection.');
  assert.equal(result.policyInspection, 'INCOMPLETE');
  assert.equal(result.issue.path, '');
  assert.equal(result.rawText, raw);
  assert.deepEqual(preflightJsonPolicy(raw), result);
  return result;
}

test('provisional checks can all pass without approving the policy', () => {
  for (const raw of ['{}', '[]', '0', '0.1', '"text"', 'true', ' \r\n{"n":0,"s":"ok"}\r\n',
    '{"a":1,"b":[true,null,0.5]}']) {
    const before = raw;
    const result = finished(raw);
    assert.equal(raw, before);
    const grammar = preflightJsonGrammar(raw);
    assert.equal(grammar.kind, 'grammar-structural-complete');
    if (grammar.kind !== 'grammar-structural-complete') throw new Error('Expected I01 completion.');
    assert.deepEqual(result.counters, grammar.counters);
    assert.equal(result.utf8Bytes, grammar.utf8Bytes);
    assert.equal(Object.hasOwn(result, 'tokens'), false);
  }
});

test('the earlier source span wins between a duplicate and an unsafe integer', () => {
  const raw = '{"a":9007199254740992,"a":1}';
  const result = rejected(raw);
  assert.equal(result.issue.code, 'PREFLIGHT_NUMBER_UNSAFE_INTEGER');
  assert.equal(result.policyReport, 'REJECTED');
  assert.equal(result.counterSemantics, 'COMPLETE_DOCUMENT');
  assert.equal(result.checks.grammar, 'PASS');
  assert.equal(result.checks.structuralLimits, 'PASS');
  assert.equal(result.checks.numericPolicy, 'FAIL');
  assert.equal(result.checks.duplicateKeys, 'FAIL');
  assert.equal(result.checks.unicodePolicy, 'UNKNOWN');
  assert.equal(result.issue.priorSpan, null);
  assert.equal(raw.slice(result.issue.span!.start, result.issue.span!.end), '9007199254740992');
  assert.equal(JSON.stringify(result.issue).includes('9007199254740992'), false);
  const grammar = preflightJsonGrammar(raw);
  assert.equal(grammar.kind, 'grammar-structural-complete');
  if (grammar.kind !== 'grammar-structural-complete') throw new Error('Expected I01 completion.');
  assert.deepEqual(result.counters, grammar.counters);
});

test('Unicode and numeric defects keep source order in both directions', () => {
  const unicodeFirst = '["\\uD800",1e309]';
  const first = rejected(unicodeFirst);
  assert.equal(first.issue.code, 'PREFLIGHT_UNPAIRED_SURROGATE');
  assert.equal(first.checks.unicodePolicy, 'FAIL');
  assert.equal(first.checks.numericPolicy, 'FAIL');
  assert.equal(first.checks.duplicateKeys, 'UNKNOWN');
  assert.equal(unicodeFirst.slice(first.issue.span!.start, first.issue.span!.end), '\\uD800');

  const numericFirst = '{"a":1e309,"b":"\\uD800"}';
  const second = rejected(numericFirst);
  assert.equal(second.issue.code, 'PREFLIGHT_NUMBER_NON_FINITE');
  assert.equal(second.checks.numericPolicy, 'FAIL');
  assert.equal(second.checks.unicodePolicy, 'FAIL');
  assert.equal(second.checks.duplicateKeys, 'UNKNOWN');
  assert.equal(numericFirst.slice(second.issue.span!.start, second.issue.span!.end), '1e309');
  assert.equal(JSON.stringify(second.issue).includes('\\uD800'), false);
});

test('grammar and resource stops precede duplicate, Unicode and numeric verdicts', () => {
  const syntax = rejected('{');
  assert.equal(syntax.issue.code, 'PREFLIGHT_SYNTAX');
  assert.equal(syntax.policyReport, 'REJECTED');
  assert.equal(syntax.counterSemantics, 'PARTIAL_SCAN_ATTEMPTS');
  assert.equal(syntax.checks.grammar, 'FAIL');
  assert.equal(syntax.checks.structuralLimits, 'UNKNOWN');
  assert.equal(syntax.checks.duplicateKeys, 'UNKNOWN');
  assert.equal(syntax.checks.unicodePolicy, 'UNKNOWN');
  assert.equal(syntax.checks.numericPolicy, 'UNKNOWN');
  const grammar = preflightJsonGrammar('{');
  assert.equal(grammar.kind, 'rejected');
  if (grammar.kind !== 'rejected') throw new Error('Expected I01 rejection.');
  assert.deepEqual(syntax.counters, grammar.counters);
  assert.deepEqual(syntax.issue.span, grammar.issue.span);
  assert.equal(syntax.issue.message, grammar.issue.message);

  const budget = rejected('1e1001');
  assert.equal(budget.issue.code, 'PREFLIGHT_EXPONENT_MAGNITUDE');
  assert.equal(budget.policyReport, 'REJECTED');
  assert.equal(budget.checks.grammar, 'UNKNOWN');
  assert.equal(budget.checks.structuralLimits, 'FAIL');
  assert.equal(budget.checks.numericPolicy, 'UNKNOWN');
  assert.equal(budget.counterSemantics, 'PARTIAL_SCAN_ATTEMPTS');
});

test('a duplicate diagnostic keeps both spans and omits the key text', () => {
  const raw = '{"KEEP-PRIVATE":1,"KEEP-PRIVATE":2}';
  const result = rejected(raw);
  assert.equal(result.issue.code, 'PREFLIGHT_DUPLICATE_KEY');
  assert.equal(result.checks.duplicateKeys, 'FAIL');
  assert.equal(result.checks.unicodePolicy, 'UNKNOWN');
  assert.equal(result.checks.numericPolicy, 'PASS');
  assert.equal(raw.slice(result.issue.priorSpan!.start, result.issue.priorSpan!.end), '"KEEP-PRIVATE"');
  assert.equal(raw.slice(result.issue.span!.start, result.issue.span!.end), '"KEEP-PRIVATE"');
  assert.equal(JSON.stringify(result.issue).includes('KEEP-PRIVATE'), false);
});

test('caller-supplied reports and disagreeing modules do not certify checks', () => {
  const forged = {
    kind: 'checks-complete', checks: {
      grammar: 'PASS', structuralLimits: 'PASS', duplicateKeys: 'PASS',
      unicodePolicy: 'PASS', numericPolicy: 'PASS', policyReport: 'PASS',
    }, rawText: '{"secret":1}', policyReport: 'PASS', checked: true,
  };
  const refused = preflightJsonPolicy(forged);
  absent(refused);
  assert.equal(refused.kind, 'rejected');
  if (refused.kind !== 'rejected') throw new Error('Expected rejection.');
  assert.equal(refused.issue.code, 'PREFLIGHT_INPUT_TYPE');
  assert.equal(refused.policyReport, 'INDETERMINATE');
  assert.equal(refused.rawText, null);
  assert.equal(refused.checks.grammar, 'UNKNOWN');
  assert.equal(JSON.stringify(refused).includes('secret'), false);

  const raw = '{"a":1}';
  const grammar = preflightJsonGrammar(raw);
  const keys = preflightJsonKeysUnicode(raw);
  const numeric = preflightJsonNumeric(raw);
  const uncertified = reconcileJsonPolicyModules(raw, grammar, keys, numeric);
  assert.equal(uncertified.kind, 'rejected');
  if (uncertified.kind !== 'rejected') throw new Error('Expected an uncertified result.');
  assert.equal(uncertified.policyReport, 'INDETERMINATE');
  assert.equal(uncertified.policyInspection, 'INCOMPLETE');
  assert.equal(uncertified.checks.grammar, 'UNKNOWN');
  assert.notEqual(uncertified.policyReport, 'PASS');

  assert.equal(grammar.kind, 'grammar-structural-complete');
  if (grammar.kind !== 'grammar-structural-complete') throw new Error('Expected I01 completion.');
  const mismatched = reconcileJsonPolicyModules(raw, grammar, {
    ...keys,
    kind: 'rejected',
    issue: {
      code: 'PREFLIGHT_DUPLICATE_KEY', path: '', message: 'Duplicate decoded key SECRET-KEY.',
      span: { start: 1, end: 4 }, priorSpan: { start: 1, end: 4 },
    },
  }, numeric);
  assert.equal(mismatched.kind, 'rejected');
  if (mismatched.kind !== 'rejected') throw new Error('Expected a closed result.');
  assert.equal(mismatched.issue.code, 'PREFLIGHT_INTERNAL');
  assert.equal(mismatched.policyReport, 'INDETERMINATE');
  assert.equal(mismatched.checks.duplicateKeys, 'UNKNOWN');
  assert.equal(JSON.stringify(mismatched).includes('SECRET-KEY'), false);
  assert.equal(mismatched.rawText, raw);
});

function forgedStop(code: unknown, message: unknown, grammarStatus: 'FAIL' | 'UNKNOWN',
  structuralStatus: 'FAIL' | 'UNKNOWN') {
  const raw = '{"a":';
  const grammar = preflightJsonGrammar(raw);
  const keys = preflightJsonKeysUnicode(raw);
  const numeric = preflightJsonNumeric(raw);
  assert.equal(grammar.kind, 'rejected');
  if (grammar.kind !== 'rejected' || keys.kind !== 'rejected' || numeric.kind !== 'rejected') {
    throw new Error('Expected a real I01 stop.');
  }
  const issue = { code, path: '', message, span: grammar.issue.span, priorSpan: null };
  const forgedGrammar = {
    ...grammar,
    checks: { ...grammar.checks, grammar: grammarStatus, structuralLimits: structuralStatus },
    issue,
  } as JsonGrammarPreflight;
  const forgedKeys = {
    ...keys,
    checks: { ...keys.checks, grammar: grammarStatus, structuralLimits: structuralStatus },
    issue,
  } as JsonKeysUnicodePreflight;
  const forgedNumeric = {
    ...numeric,
    checks: { ...numeric.checks, grammar: grammarStatus, structuralLimits: structuralStatus },
    issue: { code, path: '', message, span: grammar.issue.span },
  } as JsonNumericPreflight;
  const result = reconcileJsonPolicyModules(raw, forgedGrammar, forgedKeys, forgedNumeric);
  assert.equal(result.kind, 'rejected');
  if (result.kind !== 'rejected') throw new Error('Expected a closed forged stop.');
  assert.equal(result.issue.code, 'PREFLIGHT_INTERNAL');
  assert.equal(result.issue.message, 'JSON preflight could not complete.');
  assert.equal(typeof result.issue.message, 'string');
  assert.equal(result.policyReport, 'INDETERMINATE');
  assert.equal(result.policyInspection, 'INCOMPLETE');
  assert.equal(result.policyReadiness, 'UNRESOLVED');
  assert.equal(result.trustedAdmission, 'NOT_IMPLEMENTED');
  assert.equal(result.semanticAdmission, 'NOT_EVALUATED');
  assert.deepEqual(result.checks, {
    grammar: 'UNKNOWN', structuralLimits: 'UNKNOWN', duplicateKeys: 'UNKNOWN',
    unicodePolicy: 'UNKNOWN', numericPolicy: 'UNKNOWN',
  });
  assert.equal(Object.hasOwn(result, 'checked'), false);
  assert.notEqual(result.policyReport, 'PASS');
  assert.deepEqual(result.counters, grammar.counters);
  assert.equal(JSON.stringify(result.issue).includes('function'), false);
  return result;
}

test('forged I01 stops cannot invent a rejection or a positive report', () => {
  forgedStop('PREFLIGHT_NOT_A_CODE', undefined, 'FAIL', 'UNKNOWN');
  forgedStop('PREFLIGHT_DUPLICATE_KEY', 'Duplicate decoded key.', 'FAIL', 'UNKNOWN');
  forgedStop('PREFLIGHT_NUMBER_NON_FINITE', 'Numeric value is not finite.', 'FAIL', 'UNKNOWN');
  forgedStop('PREFLIGHT_INTERNAL', 'JSON preflight could not complete.', 'FAIL', 'UNKNOWN');
  forgedStop('PREFLIGHT_SYNTAX', () => 'caller text', 'FAIL', 'UNKNOWN');
  const syntax = rejected('{');
  assert.equal(syntax.issue.code, 'PREFLIGHT_SYNTAX');
  assert.equal(syntax.issue.message, 'Invalid JSON grammar.');
  assert.equal(syntax.policyReport, 'REJECTED');
  const budget = rejected('1e1001');
  assert.equal(budget.issue.code, 'PREFLIGHT_EXPONENT_MAGNITUDE');
  assert.equal(budget.issue.message, 'Provisional test resource limit exceeded.');
  assert.equal(budget.checks.structuralLimits, 'FAIL');
  const oversized = rejected('x'.repeat(limits.inputUtf8Bytes + 1));
  assert.equal(oversized.issue.code, 'PREFLIGHT_INPUT_SIZE');
  assert.equal(oversized.policyReport, 'REJECTED');
  assert.equal(oversized.checks.grammar, 'UNKNOWN');
  assert.equal(oversized.checks.structuralLimits, 'FAIL');
  assert.equal(oversized.checks.numericPolicy, 'UNKNOWN');
});

test('I01, I02, I03 and F1a keep their own results', () => {
  const raw = '{"a":1,"a":-0}';
  const grammar = preflightJsonGrammar(raw);
  assert.equal(grammar.scope, 'F1B-I01');
  assert.equal(grammar.kind, 'grammar-structural-complete');
  assert.equal(grammar.checks.duplicateKeys, 'NOT_IMPLEMENTED');
  assert.equal(grammar.checks.numericPolicy, 'NOT_IMPLEMENTED');
  assert.equal(grammar.checks.policyReport, 'NOT_IMPLEMENTED');
  const keys = preflightJsonKeysUnicode(raw);
  assert.equal(keys.scope, 'F1B-I02');
  assert.equal(keys.kind, 'rejected');
  if (keys.kind !== 'rejected') throw new Error('Expected I02 rejection.');
  assert.equal(keys.issue.code, 'PREFLIGHT_DUPLICATE_KEY');
  assert.equal(keys.checks.numericPolicy, 'NOT_IMPLEMENTED');
  assert.equal(keys.policyInspection, 'INCOMPLETE');
  const numeric = preflightJsonNumeric(raw);
  assert.equal(numeric.scope, 'F1B-I03');
  assert.equal(numeric.kind, 'rejected');
  if (numeric.kind !== 'rejected') throw new Error('Expected I03 rejection.');
  assert.equal(numeric.issue.code, 'PREFLIGHT_NUMBER_NEGATIVE_ZERO');
  assert.equal(numeric.checks.duplicateKeys, 'NOT_IMPLEMENTED');
  assert.equal(numeric.checks.policyReport, 'NOT_IMPLEMENTED');
  const syntax = inspectJsonText(raw);
  assert.equal(syntax.kind, 'syntax-valid');
  assert.equal(syntax.semanticAdmission, 'NOT_EVALUATED');
  const policy = rejected(raw);
  assert.equal(policy.issue.code, 'PREFLIGHT_DUPLICATE_KEY');
  assert.equal(policy.policyReport, 'REJECTED');
  assert.equal(policy.checks.duplicateKeys, 'FAIL');
  assert.equal(policy.checks.numericPolicy, 'FAIL');
  assert.equal(policy.checks.unicodePolicy, 'UNKNOWN');
  assert.ok(policy.issue.span && numeric.issue.span && policy.issue.span.start < numeric.issue.span.start);
});

test('non-string input is not inspected and JSON.parse is not used', () => {
  let calls = 0;
  const proxy = new Proxy({}, { get() { calls++; return ''; } });
  const result = preflightJsonPolicy(proxy);
  absent(result);
  assert.equal(result.kind, 'rejected');
  if (result.kind !== 'rejected') throw new Error('Expected rejection.');
  assert.equal(result.issue.code, 'PREFLIGHT_INPUT_TYPE');
  assert.equal(result.policyReport, 'INDETERMINATE');
  assert.equal(calls, 0);

  const original = JSON.parse;
  let parses = 0;
  JSON.parse = () => { parses++; throw new Error('native parse'); };
  try {
    finished('{"a":0.1}');
    rejected('{"a":-0,"a":1}');
    assert.equal(parses, 0);
  } finally {
    JSON.parse = original;
  }
});
