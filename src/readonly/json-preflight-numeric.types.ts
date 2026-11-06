import type { JsonPreflightIssueCode, JsonStructuralCounters } from './json-preflight.types';

/** I01 codes plus local N3 findings. Not an I04 policy verdict. */
export type JsonNumericIssueCode = JsonPreflightIssueCode
  | 'PREFLIGHT_NUMBER_NON_FINITE'
  | 'PREFLIGHT_NUMBER_UNDERFLOW'
  | 'PREFLIGHT_NUMBER_NEGATIVE_ZERO'
  | 'PREFLIGHT_NUMBER_UNSAFE_INTEGER'
  | 'PREFLIGHT_NUMBER_PRECISION';

/** Half-open UTF-16 offsets into the unchanged rawText. */
export type JsonTextSpan = {
  readonly start: number;
  readonly end: number;
};

export type JsonNumericIssue = {
  readonly code: JsonNumericIssueCode;
  readonly path: ''; // No raw lexemes in public diagnostics.
  readonly message: string;
  /** The blocking number token, or the I01 span when grammar stopped first. */
  readonly span: JsonTextSpan | null;
};

type LocalCheck = 'PASS' | 'FAIL' | 'UNKNOWN';

export type JsonNumericChecks = {
  readonly grammar: LocalCheck;
  readonly structuralLimits: LocalCheck;
  /** This package does not inspect keys. */
  readonly duplicateKeys: 'NOT_IMPLEMENTED';
  /** This package does not inspect Unicode. */
  readonly unicodePolicy: 'NOT_IMPLEMENTED';
  /** Local to N3. UNKNOWN when I01 stopped before every number was classified. */
  readonly numericPolicy: LocalCheck;
  readonly policyReport: 'NOT_IMPLEMENTED';
  readonly trustedAdmission: 'NOT_IMPLEMENTED';
};

type ReportBase = {
  readonly scope: 'F1B-I03';
  readonly profileId: 'balanced-i01-test-v1';
  readonly profileStatus: 'PROVISIONAL_TEST_ONLY';
  readonly policyInspection: 'INCOMPLETE';
  readonly semanticAdmission: 'NOT_EVALUATED';
  readonly rawText: string | null;
  readonly utf8Bytes: number | null;
  /** Grammar counters from I01. They do not mean N3, Unicode or admission passed. */
  readonly counters: JsonStructuralCounters;
  readonly checks: JsonNumericChecks;
};

/** No converted Number, decimal object, token list, digest or parsed value. */
export type JsonNumericPreflight =
  | (ReportBase & {
      readonly kind: 'numeric-complete';
      readonly counterSemantics: 'COMPLETE_DOCUMENT';
      readonly rawText: string;
      readonly utf8Bytes: number;
    })
  | (ReportBase & {
      readonly kind: 'rejected';
      readonly counterSemantics: 'COMPLETE_DOCUMENT' | 'PARTIAL_SCAN_ATTEMPTS';
      readonly issue: JsonNumericIssue;
    });
