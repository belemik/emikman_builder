import { preflightJsonGrammar } from './json-preflight-grammar';
import { preflightJsonKeysUnicode } from './json-preflight-keys';
import { JSON_PREFLIGHT_TEST_LIMITS as limits } from './json-preflight-limits';
import { preflightJsonNumeric } from './json-preflight-numeric';
import type {
  JsonGrammarPreflight, JsonStructuralCounters,
} from './json-preflight.types';
import type { JsonKeysUnicodePreflight } from './json-preflight-keys.types';
import type { JsonNumericPreflight } from './json-preflight-numeric.types';
import type {
  JsonPolicyChecks, JsonPolicyIssue, JsonPolicyIssueCode, JsonPolicyPreflight, JsonTextSpan,
} from './json-preflight-policy.types';

type GrammarComplete = Extract<JsonGrammarPreflight, { kind: 'grammar-structural-complete' }>;
type Finding = {
  readonly code: JsonPolicyIssueCode;
  readonly span: JsonTextSpan;
  readonly priorSpan: JsonTextSpan | null;
  readonly order: number;
};

const counterKeys = [
  'nodes', 'keys', 'properties', 'arrayItems', 'maxDepth', 'maxObjectProperties',
  'maxArrayItems', 'rawStringTokenUnits', 'maxRawStringTokenUnits', 'decodedKeyUnits',
  'decodedStringUnits', 'totalDecodedUnits', 'maxKeyUnits', 'maxStringUnits',
] as const;

const messages: Record<JsonPolicyIssueCode, string> = {
  PREFLIGHT_INPUT_TYPE: 'Expected a primitive JSON text string.',
  PREFLIGHT_INPUT_SIZE: 'Provisional test resource limit exceeded.',
  PREFLIGHT_SYNTAX: 'Invalid JSON grammar.',
  PREFLIGHT_DEPTH: 'Provisional test resource limit exceeded.',
  PREFLIGHT_NODES: 'Provisional test resource limit exceeded.',
  PREFLIGHT_PROPERTIES: 'Provisional test resource limit exceeded.',
  PREFLIGHT_OBJECT_PROPERTIES: 'Provisional test resource limit exceeded.',
  PREFLIGHT_ARRAY_ITEMS: 'Provisional test resource limit exceeded.',
  PREFLIGHT_STRING_UNITS: 'Provisional test resource limit exceeded.',
  PREFLIGHT_KEY_UNITS: 'Provisional test resource limit exceeded.',
  PREFLIGHT_TOTAL_DECODED_UNITS: 'Provisional test resource limit exceeded.',
  PREFLIGHT_NUMBER_TOKEN: 'Provisional test resource limit exceeded.',
  PREFLIGHT_EXPONENT_DIGITS: 'Provisional test resource limit exceeded.',
  PREFLIGHT_EXPONENT_MAGNITUDE: 'Provisional test resource limit exceeded.',
  PREFLIGHT_INTERNAL: 'JSON preflight could not complete.',
  PREFLIGHT_DUPLICATE_KEY: 'Duplicate decoded key.',
  PREFLIGHT_UNPAIRED_SURROGATE: 'Unpaired UTF-16 surrogate.',
  PREFLIGHT_NUMBER_NON_FINITE: 'Numeric value is not finite.',
  PREFLIGHT_NUMBER_UNDERFLOW: 'Nonzero numeric value underflows to zero.',
  PREFLIGHT_NUMBER_NEGATIVE_ZERO: 'Lexical negative zero.',
  PREFLIGHT_NUMBER_UNSAFE_INTEGER: 'Numeric integer exceeds the safe integer range.',
  PREFLIGHT_NUMBER_PRECISION: 'Numeric decimal does not round-trip.',
};

/** I01 rejections that may be forwarded. INTERNAL and I02/I03 codes are absent on purpose. */
const i01ConfirmedStop = {
  PREFLIGHT_SYNTAX: ['FAIL', 'UNKNOWN'],
  PREFLIGHT_INPUT_TYPE: ['UNKNOWN', 'UNKNOWN'],
  PREFLIGHT_INPUT_SIZE: ['UNKNOWN', 'FAIL'],
  PREFLIGHT_DEPTH: ['UNKNOWN', 'FAIL'],
  PREFLIGHT_NODES: ['UNKNOWN', 'FAIL'],
  PREFLIGHT_PROPERTIES: ['UNKNOWN', 'FAIL'],
  PREFLIGHT_OBJECT_PROPERTIES: ['UNKNOWN', 'FAIL'],
  PREFLIGHT_ARRAY_ITEMS: ['UNKNOWN', 'FAIL'],
  PREFLIGHT_STRING_UNITS: ['UNKNOWN', 'FAIL'],
  PREFLIGHT_KEY_UNITS: ['UNKNOWN', 'FAIL'],
  PREFLIGHT_TOTAL_DECODED_UNITS: ['UNKNOWN', 'FAIL'],
  PREFLIGHT_NUMBER_TOKEN: ['UNKNOWN', 'FAIL'],
  PREFLIGHT_EXPONENT_DIGITS: ['UNKNOWN', 'FAIL'],
  PREFLIGHT_EXPONENT_MAGNITUDE: ['UNKNOWN', 'FAIL'],
} as const;

const unknownChecks: JsonPolicyChecks = {
  grammar: 'UNKNOWN', structuralLimits: 'UNKNOWN', duplicateKeys: 'UNKNOWN',
  unicodePolicy: 'UNKNOWN', numericPolicy: 'UNKNOWN',
};

function emptyCounters(): JsonStructuralCounters {
  return {
    nodes: 0, keys: 0, properties: 0, arrayItems: 0, maxDepth: 0,
    maxObjectProperties: 0, maxArrayItems: 0, rawStringTokenUnits: 0,
    maxRawStringTokenUnits: 0, decodedKeyUnits: 0, decodedStringUnits: 0,
    totalDecodedUnits: 0, maxKeyUnits: 0, maxStringUnits: 0,
  };
}

function copyCounters(counters: JsonStructuralCounters): JsonStructuralCounters {
  return {
    nodes: counters.nodes, keys: counters.keys, properties: counters.properties,
    arrayItems: counters.arrayItems, maxDepth: counters.maxDepth,
    maxObjectProperties: counters.maxObjectProperties, maxArrayItems: counters.maxArrayItems,
    rawStringTokenUnits: counters.rawStringTokenUnits,
    maxRawStringTokenUnits: counters.maxRawStringTokenUnits,
    decodedKeyUnits: counters.decodedKeyUnits, decodedStringUnits: counters.decodedStringUnits,
    totalDecodedUnits: counters.totalDecodedUnits, maxKeyUnits: counters.maxKeyUnits,
    maxStringUnits: counters.maxStringUnits,
  };
}

function sameCounters(left: JsonStructuralCounters, right: JsonStructuralCounters): boolean {
  return counterKeys.every((key) => left[key] === right[key] && typeof left[key] === 'number');
}

function sameSpan(left: JsonTextSpan | null, right: JsonTextSpan | null): boolean {
  if (left === null || right === null) return left === right;
  return left.start === right.start && left.end === right.end;
}

function offsetSpan(span: JsonTextSpan | null, length: number): boolean {
  if (span === null) return true;
  return Number.isInteger(span.start) && Number.isInteger(span.end)
    && span.start >= 0 && span.end >= span.start && span.end <= length;
}

function tokenSpan(span: JsonTextSpan | null, length: number): span is JsonTextSpan {
  return span !== null && Number.isInteger(span.start) && Number.isInteger(span.end)
    && span.start >= 0 && span.end > span.start && span.end <= length;
}

function base<Raw extends string | null, Bytes extends number | null,
  Semantics extends JsonPolicyPreflight['counterSemantics']>(
  rawText: Raw, utf8Bytes: Bytes,
  counters: JsonStructuralCounters, counterSemantics: Semantics) {
  return {
    scope: 'F1B-I04' as const,
    profileId: limits.profileId,
    profileStatus: limits.profileStatus,
    policyReadiness: 'UNRESOLVED' as const,
    semanticAdmission: 'NOT_EVALUATED' as const,
    trustedAdmission: 'NOT_IMPLEMENTED' as const,
    rawText, utf8Bytes, counters: copyCounters(counters), counterSemantics,
  };
}

function closed(rawText: string | null, utf8Bytes: number | null,
  counters: JsonStructuralCounters,
  counterSemantics: JsonPolicyPreflight['counterSemantics']): JsonPolicyPreflight {
  return {
    ...base(rawText, utf8Bytes, counters, counterSemantics),
    kind: 'rejected',
    policyInspection: 'INCOMPLETE',
    policyReport: 'INDETERMINATE',
    checks: unknownChecks,
    issue: {
      code: 'PREFLIGHT_INTERNAL', path: '', message: messages.PREFLIGHT_INTERNAL,
      span: null, priorSpan: null,
    },
  };
}

function ownMessage(code: string): string | null {
  if (!Object.hasOwn(messages, code)) return null;
  const message = messages[code as JsonPolicyIssueCode];
  return typeof message === 'string' ? message : null;
}

function issueOf(code: JsonPolicyIssueCode, span: JsonTextSpan | null,
  priorSpan: JsonTextSpan | null): JsonPolicyIssue | null {
  const message = ownMessage(code);
  if (message === null) return null;
  return { code, path: '', message, span, priorSpan };
}

function shellAgrees(input: unknown, grammar: JsonGrammarPreflight,
  keys: JsonKeysUnicodePreflight, numeric: JsonNumericPreflight): boolean {
  if (grammar.scope !== 'F1B-I01' || keys.scope !== 'F1B-I02' || numeric.scope !== 'F1B-I03') return false;
  if (grammar.profileId !== limits.profileId || keys.profileId !== limits.profileId
    || numeric.profileId !== limits.profileId) return false;
  if (grammar.profileStatus !== 'PROVISIONAL_TEST_ONLY'
    || keys.profileStatus !== 'PROVISIONAL_TEST_ONLY'
    || numeric.profileStatus !== 'PROVISIONAL_TEST_ONLY') return false;
  if (grammar.policyInspection !== 'INCOMPLETE' || keys.policyInspection !== 'INCOMPLETE'
    || numeric.policyInspection !== 'INCOMPLETE') return false;
  if (grammar.semanticAdmission !== 'NOT_EVALUATED' || keys.semanticAdmission !== 'NOT_EVALUATED'
    || numeric.semanticAdmission !== 'NOT_EVALUATED') return false;
  const reports = [grammar.checks, keys.checks, numeric.checks];
  if (reports.some((checks) => checks.policyReport !== 'NOT_IMPLEMENTED'
    || checks.trustedAdmission !== 'NOT_IMPLEMENTED')) return false;
  if (grammar.rawText !== keys.rawText || grammar.rawText !== numeric.rawText) return false;
  if (grammar.utf8Bytes !== keys.utf8Bytes || grammar.utf8Bytes !== numeric.utf8Bytes) return false;
  if (!sameCounters(grammar.counters, keys.counters) || !sameCounters(grammar.counters, numeric.counters)) return false;
  if (grammar.counterSemantics !== keys.counterSemantics
    || grammar.counterSemantics !== numeric.counterSemantics) return false;
  if (grammar.checks.grammar !== keys.checks.grammar
    || grammar.checks.grammar !== numeric.checks.grammar) return false;
  if (grammar.checks.structuralLimits !== keys.checks.structuralLimits
    || grammar.checks.structuralLimits !== numeric.checks.structuralLimits) return false;
  if (typeof input === 'string') return grammar.rawText === input;
  return grammar.rawText === null;
}

function isConfirmedStop(code: unknown): code is keyof typeof i01ConfirmedStop {
  return typeof code === 'string' && Object.hasOwn(i01ConfirmedStop, code);
}

function confirmedStopCode(grammar: Extract<JsonGrammarPreflight, { kind: 'rejected' }>,
  keys: JsonKeysUnicodePreflight, numeric: JsonNumericPreflight): keyof typeof i01ConfirmedStop | null {
  if (keys.kind !== 'rejected' || numeric.kind !== 'rejected') return null;
  if (keys.checks.duplicateKeys !== 'UNKNOWN' || keys.checks.unicodePolicy !== 'UNKNOWN'
    || keys.checks.numericPolicy !== 'NOT_IMPLEMENTED') return null;
  if (numeric.checks.numericPolicy !== 'UNKNOWN' || numeric.checks.duplicateKeys !== 'NOT_IMPLEMENTED'
    || numeric.checks.unicodePolicy !== 'NOT_IMPLEMENTED') return null;
  if (keys.issue.priorSpan !== null) return null;
  const code: unknown = grammar.issue.code;
  if (!isConfirmedStop(code)) return null;
  const [grammarStatus, structuralStatus] = i01ConfirmedStop[code];
  if (grammar.checks.grammar !== grammarStatus
    || grammar.checks.structuralLimits !== structuralStatus) return null;
  const message = ownMessage(code);
  if (message === null || grammar.issue.message !== message) return null;
  if (keys.issue.code !== code || numeric.issue.code !== code) return null;
  if (keys.issue.message !== message || numeric.issue.message !== message) return null;
  if (keys.issue.path !== '' || numeric.issue.path !== '') return null;
  if (!sameSpan(keys.issue.span, grammar.issue.span)
    || !sameSpan(numeric.issue.span, grammar.issue.span)) return null;
  return code;
}

function located(code: JsonPolicyIssueCode, span: JsonTextSpan | null,
  priorSpan: JsonTextSpan | null, length: number, order: number): Finding | null {
  if (!tokenSpan(span, length)) return null;
  if (code === 'PREFLIGHT_DUPLICATE_KEY') {
    if (!tokenSpan(priorSpan, length)) return null;
    return { code, span, priorSpan, order };
  }
  if (priorSpan !== null) return null;
  return { code, span, priorSpan: null, order };
}

function keyFinding(keys: JsonKeysUnicodePreflight, length: number): Finding | null | 'internal' | 'none' {
  if (keys.kind === 'keys-unicode-complete') {
    return keys.checks.duplicateKeys === 'PASS' && keys.checks.unicodePolicy === 'PASS'
      && keys.checks.numericPolicy === 'NOT_IMPLEMENTED' ? 'none' : 'internal';
  }
  const code = keys.issue.code;
  if (code === 'PREFLIGHT_INTERNAL') return 'internal';
  if (code === 'PREFLIGHT_DUPLICATE_KEY') {
    if (keys.checks.duplicateKeys !== 'FAIL' || keys.checks.unicodePolicy !== 'UNKNOWN') return 'internal';
    return located(code, keys.issue.span, keys.issue.priorSpan, length, 0);
  }
  if (code === 'PREFLIGHT_UNPAIRED_SURROGATE') {
    if (keys.checks.unicodePolicy !== 'FAIL' || keys.checks.duplicateKeys !== 'UNKNOWN') return 'internal';
    return located(code, keys.issue.span, keys.issue.priorSpan, length, 0);
  }
  return 'internal';
}

function numericFinding(numeric: JsonNumericPreflight, length: number): Finding | null | 'internal' | 'none' {
  if (numeric.checks.duplicateKeys !== 'NOT_IMPLEMENTED'
    || numeric.checks.unicodePolicy !== 'NOT_IMPLEMENTED') return 'internal';
  if (numeric.kind === 'numeric-complete') {
    return numeric.checks.numericPolicy === 'PASS' ? 'none' : 'internal';
  }
  const code = numeric.issue.code;
  if (code === 'PREFLIGHT_INTERNAL') return 'internal';
  if (numeric.checks.numericPolicy !== 'FAIL') return 'internal';
  if (code !== 'PREFLIGHT_NUMBER_NON_FINITE' && code !== 'PREFLIGHT_NUMBER_UNDERFLOW'
    && code !== 'PREFLIGHT_NUMBER_NEGATIVE_ZERO' && code !== 'PREFLIGHT_NUMBER_UNSAFE_INTEGER'
    && code !== 'PREFLIGHT_NUMBER_PRECISION') return 'internal';
  return located(code, numeric.issue.span, null, length, 1);
}

function earlier(left: Finding, right: Finding): Finding {
  if (left.span.start !== right.span.start) return left.span.start < right.span.start ? left : right;
  if (left.span.end !== right.span.end) return left.span.end < right.span.end ? left : right;
  return left.order <= right.order ? left : right;
}

function judge(input: unknown, grammar: JsonGrammarPreflight,
  keys: JsonKeysUnicodePreflight, numeric: JsonNumericPreflight,
  certify: boolean): JsonPolicyPreflight {
  const preserved = typeof input === 'string' ? input : null;
  if (!shellAgrees(input, grammar, keys, numeric)) {
    return closed(preserved, null, emptyCounters(), 'PARTIAL_SCAN_ATTEMPTS');
  }
  const rawText = grammar.rawText;
  const utf8Bytes = grammar.utf8Bytes;
  const counters = grammar.counters;
  const counterSemantics = grammar.counterSemantics;
  if (grammar.kind === 'rejected') {
    const stop = confirmedStopCode(grammar, keys, numeric);
    const length = rawText === null ? 0 : rawText.length;
    const issue = stop === null ? null : issueOf(stop, grammar.issue.span, null);
    if (stop === null || issue === null || !offsetSpan(grammar.issue.span, length)) {
      return closed(rawText, utf8Bytes, counters, counterSemantics);
    }
    const checks: JsonPolicyChecks = {
      grammar: i01ConfirmedStop[stop][0],
      structuralLimits: i01ConfirmedStop[stop][1],
      duplicateKeys: 'UNKNOWN', unicodePolicy: 'UNKNOWN', numericPolicy: 'UNKNOWN',
    };
    const failed = checks.grammar === 'FAIL' || checks.structuralLimits === 'FAIL';
    return {
      ...base(rawText, utf8Bytes, counters, counterSemantics),
      kind: 'rejected', policyInspection: 'INCOMPLETE',
      policyReport: failed ? 'REJECTED' : 'INDETERMINATE',
      checks,
      issue,
    };
  }
  if (rawText === null || utf8Bytes === null) return closed(rawText, utf8Bytes, counters, counterSemantics);
  const fromKeys = keyFinding(keys, rawText.length);
  const fromNumeric = numericFinding(numeric, rawText.length);
  if (fromKeys === 'internal' || fromNumeric === 'internal' || fromKeys === null || fromNumeric === null) {
    return closed(rawText, utf8Bytes, counters, counterSemantics);
  }
  const checks: JsonPolicyChecks = {
    grammar: 'PASS', structuralLimits: 'PASS',
    duplicateKeys: fromKeys === 'none' ? 'PASS' : keys.checks.duplicateKeys,
    unicodePolicy: fromKeys === 'none' ? 'PASS' : keys.checks.unicodePolicy,
    numericPolicy: fromNumeric === 'none' ? 'PASS' : numeric.checks.numericPolicy,
  };
  if (fromKeys === 'none' && fromNumeric === 'none') {
    if (!certify) return closed(rawText, utf8Bytes, counters, 'PARTIAL_SCAN_ATTEMPTS');
    const passed: GrammarComplete = grammar;
    return {
      ...base(passed.rawText, passed.utf8Bytes, passed.counters, 'COMPLETE_DOCUMENT'),
      kind: 'checks-complete', policyInspection: 'COMPLETE', policyReport: 'NOT_APPROVED',
      checks: {
        grammar: 'PASS', structuralLimits: 'PASS', duplicateKeys: 'PASS',
        unicodePolicy: 'PASS', numericPolicy: 'PASS',
      },
    };
  }
  const winner = fromKeys !== 'none' && fromNumeric !== 'none' ? earlier(fromKeys, fromNumeric)
    : fromKeys === 'none' ? fromNumeric : fromKeys;
  if (winner === 'none') return closed(rawText, utf8Bytes, counters, counterSemantics);
  const issue = issueOf(winner.code, winner.span, winner.priorSpan);
  if (issue === null) return closed(rawText, utf8Bytes, counters, counterSemantics);
  return {
    ...base(rawText, utf8Bytes, counters, 'COMPLETE_DOCUMENT'),
    kind: 'rejected', policyInspection: 'INCOMPLETE', policyReport: 'REJECTED',
    checks, issue,
  };
}

/**
 * Compare three module results. A direct call never certifies completed checks:
 * only preflightJsonPolicy may do that, after it has run the modules itself.
 */
export function reconcileJsonPolicyModules(input: unknown, grammar: JsonGrammarPreflight,
  keys: JsonKeysUnicodePreflight, numeric: JsonNumericPreflight): JsonPolicyPreflight {
  return judge(input, grammar, keys, numeric, false);
}

/** Read-only composition of I01, I02 and I03. Not trusted admission and not policy approval. */
export function preflightJsonPolicy(input: unknown): JsonPolicyPreflight {
  return judge(input, preflightJsonGrammar(input), preflightJsonKeysUnicode(input),
    preflightJsonNumeric(input), true);
}
