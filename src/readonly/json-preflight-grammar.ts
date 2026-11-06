import { JSON_PREFLIGHT_TEST_LIMITS as limits } from './json-preflight-limits';
import type {
  JsonGrammarPreflight, JsonPreflightChecks, JsonPreflightIssue,
  JsonPreflightIssueCode, JsonStructuralCounters, JsonTokenKind, JsonTokenSpan,
} from './json-preflight.types';

type Counters = { -readonly [K in keyof JsonStructuralCounters]: number };
type Frame = {
  kind: 'object' | 'array'; depth: number; count: number;
  state: 'key-or-end' | 'key' | 'colon' | 'value-or-end' | 'value' | 'comma-or-end';
};
class Stop extends Error {
  constructor(readonly code: JsonPreflightIssueCode, readonly offset: number) {
    super('JSON preflight stopped.');
  }
}
const digit = (s: string, i: number) => s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57;
const hex = (n: number) => (n >= 48 && n <= 57) || (n >= 65 && n <= 70) || (n >= 97 && n <= 102);

function checks(grammar: JsonPreflightChecks['grammar'],
  structuralLimits: JsonPreflightChecks['structuralLimits']): JsonPreflightChecks {
  return { grammar, structuralLimits, duplicateKeys: 'NOT_IMPLEMENTED',
    unicodePolicy: 'NOT_IMPLEMENTED', numericPolicy: 'NOT_IMPLEMENTED',
    policyReport: 'NOT_IMPLEMENTED', trustedAdmission: 'NOT_IMPLEMENTED' };
}

/** Iterative grammar and counters only; never calls JSON.parse or returns values.
 * Raw means the supplied JS string, not original file bytes. Surrogates,
 * duplicates, -0 and precision are NOT admitted or checked by this module.
 * Fixed provisional test profile, no caller-controlled policy or callbacks.
 */
export function preflightJsonGrammar(input: unknown): JsonGrammarPreflight {
  const counters: Counters = { nodes: 0, keys: 0, properties: 0, arrayItems: 0,
    maxDepth: 0, maxObjectProperties: 0, maxArrayItems: 0,
    rawStringTokenUnits: 0, maxRawStringTokenUnits: 0, decodedKeyUnits: 0,
    decodedStringUnits: 0, totalDecodedUnits: 0, maxKeyUnits: 0, maxStringUnits: 0 };
  const rawText = typeof input === 'string' ? input : null;
  let utf8Bytes: number | null = null;
  const base = () => ({ scope: 'F1B-I01' as const, profileId: limits.profileId,
    profileStatus: limits.profileStatus, policyInspection: 'INCOMPLETE' as const,
    semanticAdmission: 'NOT_EVALUATED' as const, rawText, utf8Bytes, counters });
  function reject(code: JsonPreflightIssueCode, offset: number | null): JsonGrammarPreflight {
    const issue: JsonPreflightIssue = { code, path: '',
      message: code === 'PREFLIGHT_SYNTAX' ? 'Invalid JSON grammar.'
        : code === 'PREFLIGHT_INPUT_TYPE' ? 'Expected a primitive JSON text string.'
        : code === 'PREFLIGHT_INTERNAL' ? 'JSON preflight could not complete.'
        : 'Provisional test resource limit exceeded.',
      span: offset === null ? null : { start: offset, end: Math.min(offset + 1, rawText!.length) } };
    return { ...base(), kind: 'rejected', counterSemantics: 'PARTIAL_SCAN_ATTEMPTS', issue,
      checks: checks(code === 'PREFLIGHT_SYNTAX' ? 'FAIL' : 'UNKNOWN',
        code === 'PREFLIGHT_SYNTAX' || code === 'PREFLIGHT_INTERNAL'
          || code === 'PREFLIGHT_INPUT_TYPE' ? 'UNKNOWN' : 'FAIL') };
  }
  // typeof only: do not touch arbitrary objects, getters or even revoked Proxy.
  if (rawText === null) return reject('PREFLIGHT_INPUT_TYPE', null);
  if (rawText.length > limits.inputUtf8Bytes) return reject('PREFLIGHT_INPUT_SIZE', null);
  try {
    utf8Bytes = new TextEncoder().encode(rawText).byteLength;
    if (utf8Bytes > limits.inputUtf8Bytes) return reject('PREFLIGHT_INPUT_SIZE', null);
    const raw = rawText;
    let i = 0;
    const tokens: JsonTokenSpan[] = [];
    const stack: Frame[] = [];
    function stop(code: JsonPreflightIssueCode, offset = i): never { throw new Stop(code, offset); }
    function budget(value: number, max: number, code: JsonPreflightIssueCode) {
      if (value > max) stop(code);
    }
    function whitespace() {
      while (raw[i] === ' ' || raw[i] === '\t' || raw[i] === '\n' || raw[i] === '\r') i++;
    }
    function token(kind: JsonTokenKind, start: number, depth: number, decodedUnits?: number) {
      tokens.push(decodedUnits === undefined ? { kind, start, end: i, depth }
        : { kind, start, end: i, depth, decodedUnits });
    }
    function punctuation(kind: '{' | '}' | '[' | ']' | ':' | ',', depth: number) {
      const start = i++; token(kind, start, depth);
    }
    function string(key: boolean, depth: number) {
      const start = i++;
      let decoded = 0;
      while (i < raw.length && raw[i] !== '"') {
        const code = raw.charCodeAt(i);
        if (code < 32) stop('PREFLIGHT_SYNTAX');
        if (raw[i] === '\\') {
          i++;
          if (raw[i] === 'u') {
            for (let n = 1; n <= 4; n++) {
              if (!hex(raw.charCodeAt(i + n))) stop('PREFLIGHT_SYNTAX', Math.min(i + n, raw.length));
            }
            i += 5;
          } else {
            if (i >= raw.length || !'"\\/bfnrt'.includes(raw[i])) stop('PREFLIGHT_SYNTAX');
            i++;
          }
        } else i++;
        // No decoded string allocation, Unicode normalization or surrogate gate.
        decoded++;
        budget(decoded, key ? limits.keyUnits : limits.stringUnits,
          key ? 'PREFLIGHT_KEY_UNITS' : 'PREFLIGHT_STRING_UNITS');
        budget(counters.totalDecodedUnits + decoded, limits.totalDecodedUnits, 'PREFLIGHT_TOTAL_DECODED_UNITS');
      }
      if (raw[i] !== '"') stop('PREFLIGHT_SYNTAX');
      i++;
      const rawUnits = i - start; // Raw token including both quotes and escapes.
      counters.rawStringTokenUnits += rawUnits;
      counters.maxRawStringTokenUnits = Math.max(counters.maxRawStringTokenUnits, rawUnits);
      counters.totalDecodedUnits += decoded;
      if (key) {
        counters.decodedKeyUnits += decoded;
        counters.maxKeyUnits = Math.max(counters.maxKeyUnits, decoded);
      } else {
        counters.decodedStringUnits += decoded;
        counters.maxStringUnits = Math.max(counters.maxStringUnits, decoded);
      }
      token(key ? 'key' : 'string', start, depth, decoded);
    }
    function number(depth: number) {
      const start = i;
      function advance() {
        budget(i - start + 1, limits.numberTokenUnits, 'PREFLIGHT_NUMBER_TOKEN'); i++;
      }
      if (raw[i] === '-') advance();
      if (raw[i] === '0') advance();
      else {
        if (!digit(raw, i) || raw[i] === '0') stop('PREFLIGHT_SYNTAX');
        while (digit(raw, i)) advance();
      }
      if (raw[i] === '.') {
        advance();
        if (!digit(raw, i)) stop('PREFLIGHT_SYNTAX');
        while (digit(raw, i)) advance();
      }
      if (raw[i] === 'e' || raw[i] === 'E') {
        advance();
        if (raw[i] === '+' || raw[i] === '-') advance();
        if (!digit(raw, i)) stop('PREFLIGHT_SYNTAX');
        let digits = 0, magnitude = 0;
        while (digit(raw, i)) {
          budget(digits + 1, limits.exponentDigits, 'PREFLIGHT_EXPONENT_DIGITS');
          const next = magnitude * 10 + raw.charCodeAt(i) - 48;
          budget(next, limits.exponentMagnitude, 'PREFLIGHT_EXPONENT_MAGNITUDE');
          advance(); digits++; magnitude = next;
        }
      }
      // No Number conversion, precision checks or numeric semantic decisions.
      token('number', start, depth);
    }
    function value(depth: number) {
      whitespace();
      const c = raw[i];
      if (c !== '{' && c !== '[' && c !== '"' && c !== '-' && !digit(raw, i)
        && c !== 't' && c !== 'f' && c !== 'n') stop('PREFLIGHT_SYNTAX');
      budget(depth, limits.depth, 'PREFLIGHT_DEPTH');
      budget(counters.nodes + 1, limits.nodes, 'PREFLIGHT_NODES');
      counters.nodes++; counters.maxDepth = Math.max(counters.maxDepth, depth);
      if (c === '{' || c === '[') {
        punctuation(c, depth);
        stack.push({ kind: c === '{' ? 'object' : 'array', depth, count: 0,
          state: c === '{' ? 'key-or-end' : 'value-or-end' });
      } else if (c === '"') string(false, depth);
      else if (c === '-' || digit(raw, i)) number(depth);
      else {
        const literal = c === 't' ? 'true' : c === 'f' ? 'false' : 'null';
        const start = i;
        for (const character of literal) {
          if (raw[i] !== character) stop('PREFLIGHT_SYNTAX'); i++;
        }
        token(literal, start, depth);
      }
    }
    value(0);
    while (stack.length) {
      whitespace();
      const frame = stack[stack.length - 1];
      const c = raw[i];
      if (frame.kind === 'object') {
        if (frame.state === 'key-or-end' && c === '}') {
          punctuation('}', frame.depth); stack.pop();
        } else if (frame.state === 'key-or-end' || frame.state === 'key') {
          if (c !== '"') stop('PREFLIGHT_SYNTAX');
          budget(counters.properties + 1, limits.properties, 'PREFLIGHT_PROPERTIES');
          budget(frame.count + 1, limits.objectProperties, 'PREFLIGHT_OBJECT_PROPERTIES');
          string(true, frame.depth + 1);
          frame.count++; counters.keys++; counters.properties++;
          counters.maxObjectProperties = Math.max(counters.maxObjectProperties, frame.count);
          frame.state = 'colon';
        } else if (frame.state === 'colon') {
          if (c !== ':') stop('PREFLIGHT_SYNTAX');
          punctuation(':', frame.depth); frame.state = 'value';
        } else if (frame.state === 'value') {
          frame.state = 'comma-or-end'; value(frame.depth + 1);
        } else if (c === ',') {
          punctuation(',', frame.depth); frame.state = 'key';
        } else if (c === '}') {
          punctuation('}', frame.depth); stack.pop();
        } else stop('PREFLIGHT_SYNTAX');
      } else {
        if (frame.state === 'value-or-end' && c === ']') {
          punctuation(']', frame.depth); stack.pop();
        } else if (frame.state === 'value-or-end' || frame.state === 'value') {
          budget(frame.count + 1, limits.arrayItems, 'PREFLIGHT_ARRAY_ITEMS');
          frame.count++; counters.arrayItems++;
          counters.maxArrayItems = Math.max(counters.maxArrayItems, frame.count);
          frame.state = 'comma-or-end'; value(frame.depth + 1);
        } else if (c === ',') {
          punctuation(',', frame.depth); frame.state = 'value';
        } else if (c === ']') {
          punctuation(']', frame.depth); stack.pop();
        } else stop('PREFLIGHT_SYNTAX');
      }
    }
    whitespace();
    if (i !== raw.length) stop('PREFLIGHT_SYNTAX');
    return { ...base(), kind: 'grammar-structural-complete', counterSemantics: 'COMPLETE_DOCUMENT', rawText, utf8Bytes,
      tokens, checks: checks('PASS', 'PASS') };
  } catch (error) {
    return error instanceof Stop ? reject(error.code, error.offset) : reject('PREFLIGHT_INTERNAL', null);
  }
}
