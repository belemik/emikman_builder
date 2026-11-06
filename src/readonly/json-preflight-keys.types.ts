import type { JsonPreflightIssueCode, JsonStructuralCounters } from './json-preflight.types';

/** I01 codes, plus this package's two local findings. Not an I04 policy verdict. */
export type JsonKeysUnicodeIssueCode = JsonPreflightIssueCode
  | 'PREFLIGHT_DUPLICATE_KEY'
  | 'PREFLIGHT_UNPAIRED_SURROGATE';

/** Half-open UTF-16 offsets into the unchanged rawText. */
export type JsonTextSpan = {
  readonly start: number;
  readonly end: number;
};

export type JsonKeysUnicodeIssue = {
  readonly code: JsonKeysUnicodeIssueCode;
  readonly path: ''; // No user-controlled key names in public diagnostics.
  readonly message: string;
  /** Blocking occurrence. A surrogate span is one literal code unit or one full `\uXXXX`. */
  readonly span: JsonTextSpan | null;
  /** Earlier key token, including quotes. Offsets only; set only for a duplicate key. */
  readonly priorSpan: JsonTextSpan | null;
};

type LocalCheck = 'PASS' | 'FAIL' | 'UNKNOWN';

export type JsonKeysUnicodeChecks = {
  readonly grammar: LocalCheck;
  readonly structuralLimits: LocalCheck;
  /** Local to this package. UNKNOWN when the walk stopped before the last key. */
  readonly duplicateKeys: LocalCheck;
  /** Local to this package. UNKNOWN when the walk stopped before the last string. */
  readonly unicodePolicy: LocalCheck;
  readonly numericPolicy: 'NOT_IMPLEMENTED';
  readonly policyReport: 'NOT_IMPLEMENTED';
  readonly trustedAdmission: 'NOT_IMPLEMENTED';
};

type ReportBase = {
  readonly scope: 'F1B-I02';
  readonly profileId: 'balanced-i01-test-v1';
  readonly profileStatus: 'PROVISIONAL_TEST_ONLY';
  readonly policyInspection: 'INCOMPLETE';
  readonly semanticAdmission: 'NOT_EVALUATED';
  readonly rawText: string | null;
  readonly utf8Bytes: number | null;
  /** Grammar counters from I01. Exact only when counterSemantics is COMPLETE_DOCUMENT.
   * They never mean that duplicate, Unicode, numeric or admission checks passed. */
  readonly counters: JsonStructuralCounters;
  readonly checks: JsonKeysUnicodeChecks;
};

/** No decoded keys, token list, digest, parsed value or admission flag. */
export type JsonKeysUnicodePreflight =
  | (ReportBase & {
      readonly kind: 'keys-unicode-complete';
      readonly counterSemantics: 'COMPLETE_DOCUMENT';
      readonly rawText: string;
      readonly utf8Bytes: number;
    })
  | (ReportBase & {
      readonly kind: 'rejected';
      readonly counterSemantics: 'COMPLETE_DOCUMENT' | 'PARTIAL_SCAN_ATTEMPTS';
      readonly issue: JsonKeysUnicodeIssue;
    });
