/** Owner-authorized R0 conformance boundaries ONLY. Not production quotas or an API contract.
 * Inclusive; root container depth=1; nodes include values/containers, NOT member names.
 * Properties and array items are aggregate occurrences across the entire document.
 * Key/string lengths are per-token decoded Unicode scalars; raw strings include quotes/escapes.
 * Fail-fast: at most one diagnostic (within the profile maximum of 32). No performance SLA.
 */
export const PROJECT_INGEST_TEST_PROFILE = Object.freeze({
  id: 'zarya.p04.r1.conformance.test/v0', status: 'TEST_ONLY',
  bodyBytes: 262144, containerDepth: 16, nodes: 4096, properties: 2048,
  arrayItems: 512, keyScalars: 128, stringScalars: 65536,
  rawStringTokenBytes: 196608, numericTokenBytes: 128, diagnostics: 32,
  // Conformance choice only. Exact spaces/case are retained; this is not an auth secret.
  idempotencyKeyProfile: 'printable-ascii-nonblank-1-128/no-trim/test-v0',
  idempotencyKeyCharacters: 128,
} as const);
export type ProjectDecodeCode = 'R1_INPUT' | 'R1_SIZE' | 'R1_UTF8' | 'R1_SYNTAX'
  | 'R1_DEPTH' | 'R1_NODES' | 'R1_PROPERTIES' | 'R1_ARRAY_ITEMS'
  | 'R1_KEY_SCALARS' | 'R1_STRING_SCALARS' | 'R1_RAW_STRING_BYTES'
  | 'R1_NUMERIC_BYTES' | 'R1_UNICODE' | 'R1_DUPLICATE_KEY' | 'R1_FORBIDDEN_KEY'
  | 'R1_OPERATION' | 'R1_DTO' | 'R1_IDEMPOTENCY_KEY' | 'R1_INTERNAL';
export interface ProjectDecodeCounters {
  readonly nodes: number; readonly properties: number; readonly arrayItems: number;
  readonly maxContainerDepth: number; readonly maxKeyScalars: number;
  readonly maxStringScalars: number; readonly maxRawStringTokenBytes: number;
}
export interface ProjectDecodeDiagnostic {
  readonly code: ProjectDecodeCode;
  readonly message: 'Test-only command inspection rejected.';
  readonly path: ''; // Never echo user-controlled keys or values.
  readonly offset: number | null;
  readonly offsetDomain: 'DECODED_UTF16_CODE_UNITS';
}
interface Boundary {
  readonly profileId: typeof PROJECT_INGEST_TEST_PROFILE.id;
  readonly profileStatus: 'TEST_ONLY';
  readonly productionInput: 'BLOCKED_BY_D05';
  readonly productionCandidate: 'NOT_IMPLEMENTED';
  readonly verifiedPrincipal: 'NOT_PROVIDED';
  readonly persistencePermission: 'NOT_GRANTED'; readonly executionPermission: 'NOT_GRANTED';
  readonly semanticAdmission: 'NOT_EVALUATED'; readonly trustedAdmission: 'NOT_IMPLEMENTED';
  readonly performance: 'UNKNOWN';
  readonly bodyBytes: number | null;
  readonly counters: ProjectDecodeCounters;
}
export type ProjectCommandInspection = Boundary & (
  | { readonly kind: 'test-dto-inspected'; readonly counterSemantics: 'COMPLETE_DOCUMENT';
      readonly diagnostics: readonly [] }
  | { readonly kind: 'rejected'; readonly counterSemantics: 'PARTIAL_SCAN_ATTEMPTS';
      readonly diagnostics: readonly ProjectDecodeDiagnostic[] }
);
