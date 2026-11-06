import { preflightJsonGrammar } from './json-preflight-grammar';
import type { JsonGrammarPreflight, JsonTokenSpan } from './json-preflight.types';
import type {
  JsonKeysUnicodeChecks, JsonKeysUnicodePreflight, JsonTextSpan,
} from './json-preflight-keys.types';

type GrammarComplete = Extract<JsonGrammarPreflight, { kind: 'grammar-structural-complete' }>;
type GrammarRejected = Extract<JsonGrammarPreflight, { kind: 'rejected' }>;
type ScanStop = { readonly defect: JsonTextSpan } | { readonly internal: true };

const pendingChecks = {
  numericPolicy: 'NOT_IMPLEMENTED',
  policyReport: 'NOT_IMPLEMENTED',
  trustedAdmission: 'NOT_IMPLEMENTED',
} as const;

function high(code: number): boolean {
  return code >= 0xD800 && code <= 0xDBFF;
}
function low(code: number): boolean {
  return code >= 0xDC00 && code <= 0xDFFF;
}

/** A machine remembers only an unmatched high surrogate and its raw span. */
function takeUnit(pending: JsonTextSpan | null, code: number, span: JsonTextSpan):
  { readonly pending: JsonTextSpan | null; readonly defect: JsonTextSpan | null } {
  if (pending) return low(code) ? { pending: null, defect: null } : { pending: null, defect: pending };
  if (high(code)) return { pending: span, defect: null };
  if (low(code)) return { pending: null, defect: span };
  return { pending: null, defect: null };
}

function hexUnit(raw: string, index: number): number | null {
  let value = 0;
  for (let n = 0; n < 4; n++) {
    const code = raw.charCodeAt(index + n);
    const digit = code >= 48 && code <= 57 ? code - 48
      : code >= 65 && code <= 70 ? code - 55
      : code >= 97 && code <= 102 ? code - 87
      : -1;
    if (digit < 0) return null;
    value = value * 16 + digit;
  }
  return value;
}

function shortEscape(mark: number): number | null {
  switch (mark) {
    case 34: return 34; // "
    case 92: return 92; // \
    case 47: return 47; // /
    case 98: return 8; // b
    case 102: return 12; // f
    case 110: return 10; // n
    case 114: return 13; // r
    case 116: return 9; // t
    default: return null;
  }
}

function unitsToKey(units: readonly number[]): string {
  let key = '';
  for (let index = 0; index < units.length; index += 256) {
    key += String.fromCharCode(...units.slice(index, index + 256));
  }
  return key;
}

type KeyText = { readonly key: string };
type ValueText = { readonly value: true };

/** Decode one quoted token. Values are not stored; keys are exact UTF-16, not NFC. */
function scanString(raw: string, token: JsonTokenSpan, keepKey: boolean): ScanStop | KeyText | ValueText {
  const close = token.end - 1;
  if (raw[token.start] !== '"' || raw[close] !== '"') return { internal: true };
  let rawPending: JsonTextSpan | null = null;
  let decodedPending: JsonTextSpan | null = null;
  const units = keepKey ? [] as number[] : null;
  for (let index = token.start + 1; index < close;) {
    if (raw[index] === '\\') {
      const mark = raw.charCodeAt(index + 1);
      const width = mark === 117 ? 6 : 2;
      if (index + width > close) return { internal: true };
      // Raw units of an escape are ASCII. Feed them before the decoded unit so a
      // preceding literal high is reported at its own earlier offset.
      for (let step = 0; step < width; step++) {
        const stepSpan = { start: index + step, end: index + step + 1 };
        const next = takeUnit(rawPending, raw.charCodeAt(index + step), stepSpan);
        rawPending = next.pending;
        if (next.defect) return { defect: next.defect };
      }
      const decoded = mark === 117 ? hexUnit(raw, index + 2) : shortEscape(mark);
      if (decoded === null) return { internal: true };
      const escapeSpan = { start: index, end: index + width };
      const next = takeUnit(decodedPending, decoded, escapeSpan);
      decodedPending = next.pending;
      if (next.defect) return { defect: next.defect };
      units?.push(decoded);
      index += width;
    } else {
      const span = { start: index, end: index + 1 };
      const code = raw.charCodeAt(index);
      const rawNext = takeUnit(rawPending, code, span);
      rawPending = rawNext.pending;
      if (rawNext.defect) return { defect: rawNext.defect };
      const decodedNext = takeUnit(decodedPending, code, span);
      decodedPending = decodedNext.pending;
      if (decodedNext.defect) return { defect: decodedNext.defect };
      units?.push(code);
      index++;
    }
  }
  if (rawPending && decodedPending) {
    return { defect: decodedPending.start < rawPending.start ? decodedPending : rawPending };
  }
  if (rawPending) return { defect: rawPending };
  if (decodedPending) return { defect: decodedPending };
  return units ? { key: unitsToKey(units) } : { value: true };
}

function shell(grammar: JsonGrammarPreflight, checks: JsonKeysUnicodeChecks) {
  return {
    scope: 'F1B-I02' as const,
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

function forward(grammar: GrammarRejected): JsonKeysUnicodePreflight {
  return {
    ...shell(grammar, {
      grammar: grammar.checks.grammar,
      structuralLimits: grammar.checks.structuralLimits,
      duplicateKeys: 'UNKNOWN',
      unicodePolicy: 'UNKNOWN',
      ...pendingChecks,
    }),
    kind: 'rejected',
    counterSemantics: grammar.counterSemantics,
    issue: {
      code: grammar.issue.code,
      path: '',
      message: grammar.issue.message,
      span: grammar.issue.span,
      priorSpan: null,
    },
  };
}

function policyReject(grammar: GrammarComplete, checks: JsonKeysUnicodeChecks,
  code: 'PREFLIGHT_DUPLICATE_KEY' | 'PREFLIGHT_UNPAIRED_SURROGATE' | 'PREFLIGHT_INTERNAL',
  span: JsonTextSpan | null, priorSpan: JsonTextSpan | null): JsonKeysUnicodePreflight {
  const message = code === 'PREFLIGHT_DUPLICATE_KEY' ? 'Duplicate decoded key.'
    : code === 'PREFLIGHT_UNPAIRED_SURROGATE' ? 'Unpaired UTF-16 surrogate.'
    : 'JSON preflight could not complete.';
  return {
    ...shell(grammar, checks),
    kind: 'rejected',
    counterSemantics: 'COMPLETE_DOCUMENT',
    rawText: grammar.rawText,
    utf8Bytes: grammar.utf8Bytes,
    issue: { code, path: '', message, span, priorSpan },
  };
}

/** Local duplicate and surrogate findings after I01. Not a checked policy report.
 * The token walk is source order. A whole-text surrogate scan is intentionally
 * not done first: it would hide an earlier duplicate behind a later surrogate.
 */
export function preflightJsonKeysUnicode(input: unknown): JsonKeysUnicodePreflight {
  const grammar = preflightJsonGrammar(input);
  if (grammar.kind === 'rejected') return forward(grammar);
  const objects: Map<string, JsonTextSpan>[] = [];
  const stopped: JsonKeysUnicodeChecks = {
    grammar: 'PASS', structuralLimits: 'PASS',
    duplicateKeys: 'UNKNOWN', unicodePolicy: 'UNKNOWN', ...pendingChecks,
  };
  for (const token of grammar.tokens) {
    if (token.kind === '{') {
      objects.push(new Map());
      continue;
    }
    if (token.kind === '}') {
      if (objects.pop() === undefined) return policyReject(grammar, stopped, 'PREFLIGHT_INTERNAL', null, null);
      continue;
    }
    if (token.kind !== 'key' && token.kind !== 'string') continue;
    const keepKey = token.kind === 'key';
    if (keepKey && objects.length === 0) return policyReject(grammar, stopped, 'PREFLIGHT_INTERNAL', null, null);
    const scanned = scanString(grammar.rawText, token, keepKey);
    if ('internal' in scanned) return policyReject(grammar, stopped, 'PREFLIGHT_INTERNAL', null, null);
    if ('defect' in scanned) {
      return policyReject(grammar, {
        ...stopped, unicodePolicy: 'FAIL',
      }, 'PREFLIGHT_UNPAIRED_SURROGATE', scanned.defect, null);
    }
    if ('value' in scanned) continue;
    const keys = objects[objects.length - 1];
    const occurrence = { start: token.start, end: token.end };
    const prior = keys.get(scanned.key);
    if (prior) {
      return policyReject(grammar, {
        ...stopped, duplicateKeys: 'FAIL',
      }, 'PREFLIGHT_DUPLICATE_KEY', occurrence, prior);
    }
    keys.set(scanned.key, occurrence);
  }
  if (objects.length !== 0) return policyReject(grammar, stopped, 'PREFLIGHT_INTERNAL', null, null);
  return {
    ...shell(grammar, {
      grammar: 'PASS', structuralLimits: 'PASS',
      duplicateKeys: 'PASS', unicodePolicy: 'PASS', ...pendingChecks,
    }),
    kind: 'keys-unicode-complete',
    counterSemantics: 'COMPLETE_DOCUMENT',
    rawText: grammar.rawText,
    utf8Bytes: grammar.utf8Bytes,
  };
}
