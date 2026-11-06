import type { JsonPreflightIssueCode, JsonStructuralCounters } from './json-preflight.types';

/** I01–I03 finding codes. This package does not add a new defect class. */
export type JsonPolicyIssueCode = JsonPreflightIssueCode
  | 'PREFLIGHT_DUPLICATE_KEY'
  | 'PREFLIGHT_UNPAIRED_SURROGATE'
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

export type JsonPolicyIssue = {
  readonly code: JsonPolicyIssueCode;
  readonly path: ''; // No key names or raw fragments in public diagnostics.
  readonly message: string;
  /** Blocking token, or the I01 span when grammar stopped first. */
  readonly span: JsonTextSpan | null;
  /** Earlier key token, including quotes. Offsets only; only for a duplicate key. */
  readonly priorSpan: JsonTextSpan | null;
};

type LocalCheck = 'PASS' | 'FAIL' | 'UNKNOWN';

/** Finished verdicts of the implemented checks. UNKNOWN was not run or did not finish. */
export type JsonPolicyChecks = {
  readonly grammar: LocalCheck;
  readonly structuralLimits: LocalCheck;
  readonly duplicateKeys: LocalCheck;
  readonly unicodePolicy: LocalCheck;
  readonly numericPolicy: LocalCheck;
};

/**
 * NOT_APPROVED — every implemented check passed, and approval is withheld.
 * REJECTED — at least one implemented check finished FAIL.
 * INDETERMINATE — a required check is UNKNOWN, or the modules do not agree.
 * PASS is not a member: the provisional profile is not an approved policy.
 */
export type JsonPolicyReportStatus = 'NOT_APPROVED' | 'REJECTED' | 'INDETERMINATE';

type ReportBase = {
  readonly scope: 'F1B-I04';
  readonly profileId: 'balanced-i01-test-v1';
  readonly profileStatus: 'PROVISIONAL_TEST_ONLY';
  /** COMPLETE means every implemented I01–I03 check finished PASS. Not policy approval. */
  readonly policyInspection: 'COMPLETE' | 'INCOMPLETE';
  /** Thresholds, hard limits, policy version and raw digest are not approved. */
  readonly policyReadiness: 'UNRESOLVED';
  readonly policyReport: JsonPolicyReportStatus;
  readonly semanticAdmission: 'NOT_EVALUATED';
  readonly trustedAdmission: 'NOT_IMPLEMENTED';
  readonly rawText: string | null;
  readonly utf8Bytes: number | null;
  /** I01 counters. Exact only when counterSemantics is COMPLETE_DOCUMENT. */
  readonly counters: JsonStructuralCounters;
  readonly counterSemantics: 'COMPLETE_DOCUMENT' | 'PARTIAL_SCAN_ATTEMPTS';
  readonly checks: JsonPolicyChecks;
};

type PassedChecks = {
  readonly grammar: 'PASS';
  readonly structuralLimits: 'PASS';
  readonly duplicateKeys: 'PASS';
  readonly unicodePolicy: 'PASS';
  readonly numericPolicy: 'PASS';
};

/** No parsed value, token list, decoded key, policy digest or trusted admission. */
export type JsonPolicyPreflight =
  | (ReportBase & {
      readonly kind: 'checks-complete';
      readonly policyInspection: 'COMPLETE';
      readonly policyReport: 'NOT_APPROVED';
      readonly counterSemantics: 'COMPLETE_DOCUMENT';
      readonly rawText: string;
      readonly utf8Bytes: number;
      readonly checks: PassedChecks;
    })
  | (ReportBase & {
      readonly kind: 'rejected';
      readonly policyInspection: 'INCOMPLETE';
      readonly policyReport: 'REJECTED' | 'INDETERMINATE';
      readonly issue: JsonPolicyIssue;
    });
