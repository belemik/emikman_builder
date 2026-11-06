import { preflightJsonGrammar } from './json-preflight-grammar';
import { JSON_PREFLIGHT_TEST_LIMITS as limits } from './json-preflight-limits';
import type { JsonGrammarPreflight, JsonTokenSpan } from './json-preflight.types';
import type {
  JsonNumericChecks, JsonNumericIssueCode, JsonNumericPreflight,
} from './json-preflight-numeric.types';

type GrammarComplete = Extract<JsonGrammarPreflight, { kind: 'grammar-structural-complete' }>;
type GrammarRejected = Extract<JsonGrammarPreflight, { kind: 'rejected' }>;

/** Canonical decimal: value = ± digits × 10^exp. Empty digits means zero.
 * Trailing zeros are folded into exp. This is not returned to callers. */
type Canon = { readonly negative: boolean; readonly digits: string; readonly exp: number };

const MAX_SAFE_DIGITS = '9007199254740991';
const otherChecks = {
  duplicateKeys: 'NOT_IMPLEMENTED',
  unicodePolicy: 'NOT_IMPLEMENTED',
  policyReport: 'NOT_IMPLEMENTED',
  trustedAdmission: 'NOT_IMPLEMENTED',
} as const;

function digitAt(raw: string, index: number): boolean {
  const code = raw.charCodeAt(index);
  return code >= 48 && code <= 57;
}

function canonicalize(coef: string, exponent: number, fractionLength: number, negative: boolean): Canon {
  let exp = exponent - fractionLength;
  let digits = '';
  for (let index = 0; index < coef.length; index++) {
    if (digits.length === 0 && coef[index] === '0') continue;
    digits += coef[index];
  }
  if (digits.length === 0) return { negative, digits: '', exp: 0 };
  let end = digits.length;
  while (end > 1 && digits[end - 1] === '0') {
    end--;
    exp++;
  }
  return { negative, digits: digits.slice(0, end), exp };
}

/** Parse one JSON number lexeme. Budgets come from the provisional I01 profile.
 * Returns null when the lexeme is outside that grammar or those budgets. */
function parseDecimal(raw: string, start: number, end: number): Canon | null {
  if (end <= start || end - start > limits.numberTokenUnits) return null;
  let index = start;
  const negative = raw[index] === '-';
  if (negative) index++;
  if (!digitAt(raw, index)) return null;
  let coef = '';
  if (raw[index] === '0') coef = raw[index++];
  else while (index < end && digitAt(raw, index)) coef += raw[index++];
  let fractionLength = 0;
  if (raw[index] === '.') {
    index++;
    const fractionStart = index;
    if (!digitAt(raw, index)) return null;
    while (index < end && digitAt(raw, index)) index++;
    fractionLength = index - fractionStart;
    coef += raw.slice(fractionStart, index);
  }
  let exponent = 0;
  if (index < end && (raw[index] === 'e' || raw[index] === 'E')) {
    index++;
    let exponentNegative = false;
    if (raw[index] === '+' || raw[index] === '-') exponentNegative = raw[index++] === '-';
    if (!digitAt(raw, index)) return null;
    let magnitude = 0;
    let exponentDigits = 0;
    while (index < end && digitAt(raw, index)) {
      exponentDigits++;
      if (exponentDigits > limits.exponentDigits) return null;
      magnitude = magnitude * 10 + raw.charCodeAt(index) - 48;
      if (magnitude > limits.exponentMagnitude) return null;
      index++;
    }
    exponent = exponentNegative ? -magnitude : magnitude;
  }
  if (index !== end) return null;
  return canonicalize(coef, exponent, fractionLength, negative);
}

function sameDecimal(left: Canon, right: Canon): boolean {
  return left.negative === right.negative && left.digits === right.digits && left.exp === right.exp;
}

/** Absolute mathematical integer strictly above Number.MAX_SAFE_INTEGER.
 * Width is digits.length + exp. No power of ten is materialised. */
function exceedsSafeInteger(decimal: Canon): boolean {
  if (decimal.digits === '' || decimal.exp < 0) return false;
  if (decimal.digits.length > 16 || decimal.exp > 16) return true;
  const width = decimal.digits.length + decimal.exp;
  if (width < 16) return false;
  if (width > 16) return true;
  const padded = decimal.exp === 0 ? decimal.digits : decimal.digits + '0'.repeat(decimal.exp);
  return padded > MAX_SAFE_DIGITS;
}

function classify(raw: string, token: JsonTokenSpan): JsonNumericIssueCode | 'ok' | 'internal' {
  const decimal = parseDecimal(raw, token.start, token.end);
  if (!decimal) return 'internal';
  // Trial conversion of this bounded lexeme only. JSON.parse is not used.
  const numeric = Number(raw.slice(token.start, token.end));
  if (!Number.isFinite(numeric)) return 'PREFLIGHT_NUMBER_NON_FINITE';
  if (decimal.digits !== '' && numeric === 0) return 'PREFLIGHT_NUMBER_UNDERFLOW';
  if (decimal.digits === '' && decimal.negative) return 'PREFLIGHT_NUMBER_NEGATIVE_ZERO';
  if (exceedsSafeInteger(decimal)) return 'PREFLIGHT_NUMBER_UNSAFE_INTEGER';
  const printed = numeric.toString();
  const roundTrip = parseDecimal(printed, 0, printed.length);
  if (!roundTrip) return 'internal';
  return sameDecimal(decimal, roundTrip) ? 'ok' : 'PREFLIGHT_NUMBER_PRECISION';
}

function message(code: JsonNumericIssueCode): string {
  switch (code) {
    case 'PREFLIGHT_NUMBER_NON_FINITE': return 'Numeric value is not finite.';
    case 'PREFLIGHT_NUMBER_UNDERFLOW': return 'Nonzero numeric value underflows to zero.';
    case 'PREFLIGHT_NUMBER_NEGATIVE_ZERO': return 'Lexical negative zero.';
    case 'PREFLIGHT_NUMBER_UNSAFE_INTEGER': return 'Numeric integer exceeds the safe integer range.';
    case 'PREFLIGHT_NUMBER_PRECISION': return 'Numeric decimal does not round-trip.';
    case 'PREFLIGHT_SYNTAX': return 'Invalid JSON grammar.';
    case 'PREFLIGHT_INPUT_TYPE': return 'Expected a primitive JSON text string.';
    case 'PREFLIGHT_INTERNAL': return 'JSON preflight could not complete.';
    default: return 'Provisional test resource limit exceeded.';
  }
}

function shell(grammar: JsonGrammarPreflight, checks: JsonNumericChecks) {
  return {
    scope: 'F1B-I03' as const,
    profileId: grammar.profileId,
    profileStatus: grammar.profileStatus,
    policyInspection: 'INCOMPLETE' as const,
    semanticAdmission: 'NOT_EVALUATED' as const,
    rawText: grammar.rawText,
    utf8Bytes: grammar.utf8Bytes,
    counters: grammar.counters,
    checks,
  };
}

function forward(grammar: GrammarRejected): JsonNumericPreflight {
  return {
    ...shell(grammar, {
      grammar: grammar.checks.grammar,
      structuralLimits: grammar.checks.structuralLimits,
      numericPolicy: 'UNKNOWN',
      ...otherChecks,
    }),
    kind: 'rejected',
    counterSemantics: grammar.counterSemantics,
    issue: {
      code: grammar.issue.code,
      path: '',
      message: grammar.issue.message,
      span: grammar.issue.span,
    },
  };
}

/** Local N3 classification after I01. Duplicate keys and Unicode are not run.
 * Inside one token the order is non-finite, underflow, lexical -0, safe integer, round-trip.
 * A budget rejection from I01 stays that rejection and does not become a precision finding.
 */
export function preflightJsonNumeric(input: unknown): JsonNumericPreflight {
  const grammar = preflightJsonGrammar(input);
  if (grammar.kind === 'rejected') return forward(grammar);
  const stopped: JsonNumericChecks = {
    grammar: 'PASS', structuralLimits: 'PASS', numericPolicy: 'UNKNOWN', ...otherChecks,
  };
  for (const token of grammar.tokens) {
    if (token.kind !== 'number') continue;
    const finding = classify(grammar.rawText, token);
    if (finding === 'ok') continue;
    const code = finding === 'internal' ? 'PREFLIGHT_INTERNAL' : finding;
    return {
      ...shell(grammar, finding === 'internal' ? stopped : { ...stopped, numericPolicy: 'FAIL' }),
      kind: 'rejected',
      counterSemantics: 'COMPLETE_DOCUMENT',
      rawText: grammar.rawText,
      utf8Bytes: grammar.utf8Bytes,
      issue: {
        code,
        path: '',
        message: message(code),
        span: finding === 'internal' ? null : { start: token.start, end: token.end },
      },
    };
  }
  return {
    ...shell(grammar, {
      grammar: 'PASS', structuralLimits: 'PASS', numericPolicy: 'PASS', ...otherChecks,
    }),
    kind: 'numeric-complete',
    counterSemantics: 'COMPLETE_DOCUMENT',
    rawText: grammar.rawText,
    utf8Bytes: grammar.utf8Bytes,
  };
}
