/** I01 facts only. No policy approval, parsed value, digest or trusted admission. */
export type JsonTokenKind = '{' | '}' | '[' | ']' | ':' | ','
  | 'key' | 'string' | 'number' | 'true' | 'false' | 'null';

/** Half-open UTF-16 offsets into the unchanged rawText; strings include quotes. */
export type JsonTokenSpan = {
  readonly kind: JsonTokenKind;
  readonly start: number;
  readonly end: number;
  readonly depth: number;
  readonly decodedUnits?: number;
};

/** On COMPLETE_DOCUMENT these are exact totals/maxima for the whole JSON.
 * On PARTIAL_SCAN_ATTEMPTS they are bounded scanner progress, NOT valid-value
 * counts: nodes/maxDepth include value starts admitted by the resource gates;
 * arrayItems/maxArrayItems include admitted slot attempts before value grammar
 * validation (even a missing value after a comma). Keys/properties and
 * maxObjectProperties count completed key tokens, even without a colon/value.
 * String-unit totals/maxima count only completed string/key tokens; an
 * interrupted token contributes no units. Failed gates do not increment their
 * guarded counter, but earlier scanner progress is retained. No rollback or
 * normalization of raw occurs. Never infer a valid subtree from these counts.
 */
export type JsonStructuralCounters = {
  readonly nodes: number;
  readonly keys: number;
  readonly properties: number;
  readonly arrayItems: number;
  readonly maxDepth: number;
  readonly maxObjectProperties: number;
  readonly maxArrayItems: number;
  readonly rawStringTokenUnits: number;
  readonly maxRawStringTokenUnits: number;
  readonly decodedKeyUnits: number;
  readonly decodedStringUnits: number;
  readonly totalDecodedUnits: number;
  readonly maxKeyUnits: number;
  readonly maxStringUnits: number;
};

export type JsonPreflightIssueCode = 'PREFLIGHT_INPUT_TYPE' | 'PREFLIGHT_INPUT_SIZE'
  | 'PREFLIGHT_SYNTAX' | 'PREFLIGHT_DEPTH' | 'PREFLIGHT_NODES'
  | 'PREFLIGHT_PROPERTIES' | 'PREFLIGHT_OBJECT_PROPERTIES' | 'PREFLIGHT_ARRAY_ITEMS'
  | 'PREFLIGHT_STRING_UNITS' | 'PREFLIGHT_KEY_UNITS' | 'PREFLIGHT_TOTAL_DECODED_UNITS'
  | 'PREFLIGHT_NUMBER_TOKEN' | 'PREFLIGHT_EXPONENT_DIGITS' | 'PREFLIGHT_EXPONENT_MAGNITUDE'
  | 'PREFLIGHT_INTERNAL';

export type JsonPreflightIssue = {
  readonly code: JsonPreflightIssueCode;
  readonly path: ''; // No user-controlled key names in public diagnostics.
  readonly message: string;
  readonly span: { readonly start: number; readonly end: number } | null;
};

type LocalCheck = 'PASS' | 'FAIL' | 'UNKNOWN';
export type JsonPreflightChecks = {
  readonly grammar: LocalCheck;
  readonly structuralLimits: LocalCheck;
  readonly duplicateKeys: 'NOT_IMPLEMENTED';
  readonly unicodePolicy: 'NOT_IMPLEMENTED';
  readonly numericPolicy: 'NOT_IMPLEMENTED';
  readonly policyReport: 'NOT_IMPLEMENTED';
  readonly trustedAdmission: 'NOT_IMPLEMENTED';
};

type PreflightBase = {
  readonly scope: 'F1B-I01';
  readonly profileId: 'balanced-i01-test-v1';
  readonly profileStatus: 'PROVISIONAL_TEST_ONLY';
  readonly policyInspection: 'INCOMPLETE';
  readonly semanticAdmission: 'NOT_EVALUATED';
  readonly rawText: string | null;
  readonly utf8Bytes: number | null;
  /** Interpret using counterSemantics; rejected progress is not valid JSON counts. */
  readonly counters: JsonStructuralCounters;
  readonly checks: JsonPreflightChecks;
};

export type JsonGrammarPreflight =
  | (PreflightBase & {
      readonly kind: 'grammar-structural-complete';
      readonly counterSemantics: 'COMPLETE_DOCUMENT';
      readonly rawText: string;
      readonly utf8Bytes: number;
      readonly tokens: readonly JsonTokenSpan[];
    })
  | (PreflightBase & {
      readonly kind: 'rejected';
      readonly counterSemantics: 'PARTIAL_SCAN_ATTEMPTS';
      readonly issue: JsonPreflightIssue;
    });
