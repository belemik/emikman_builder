import { JSON_TEXT_MAX_BYTES } from './inspect-json-text';

/** F1b §5 Balanced candidates: PROVISIONAL / TEST ONLY, not production policy.
 * Inclusive limits. Depth = container ancestors (root 0), nodes include values
 * but not keys; properties count occurrences, without deduplication. Decoded
 * lengths use UTF-16 code units. Number limits bound lexical work, not N3.
 * No CPU deadline, heap cap, Unicode admission or fixture compatibility claim.
 */
export const JSON_PREFLIGHT_TEST_LIMITS = Object.freeze({
  profileId: 'balanced-i01-test-v1' as const,
  profileStatus: 'PROVISIONAL_TEST_ONLY' as const,
  inputUtf8Bytes: JSON_TEXT_MAX_BYTES,
  depth: 64,
  nodes: 100_000,
  properties: 50_000,
  objectProperties: 10_000,
  arrayItems: 50_000,
  stringUnits: 262_144,
  keyUnits: 1_024,
  totalDecodedUnits: 1_000_000,
  numberTokenUnits: 128,
  exponentDigits: 4,
  exponentMagnitude: 1_000,
});
