import type { JsonInspectionIssue, JsonTextInspection } from './ingest.types';

// D0-RO F1a: decimal UTF-8 bytes, matching the existing parser's MAX_BYTES.
export const JSON_TEXT_MAX_BYTES = 2_000_000;

function rejected(
  code: JsonInspectionIssue['code'],
  message: string,
  rawText: string | null,
  utf8Bytes: number | null,
): JsonTextInspection {
  return {
    kind: 'rejected', rawText, utf8Bytes, semanticAdmission: 'NOT_EVALUATED',
    issue: { code, path: '', message },
  };
}

/**
 * Preserves a JavaScript string, not the bytes of a file decoded elsewhere.
 * Does not return parsed data or check duplicates, numeric semantics, depth,
 * contracts, bindings, readiness or permission to apply a document.
 */
export function inspectJsonText(input: unknown): JsonTextInspection {
  // Do not coerce, serialize or inspect non-string objects (including Proxy).
  if (typeof input !== 'string') {
    return rejected('INGEST_INPUT_TYPE', 'Expected a primitive JSON text string.', null, null);
  }
  // UTF-8 bytes cannot be fewer than UTF-16 code units. Avoid allocating an
  // encoded copy when this lower bound already exceeds the permitted size.
  if (input.length > JSON_TEXT_MAX_BYTES) {
    return rejected('INGEST_SIZE', 'JSON text exceeds 2,000,000 UTF-8 bytes.', input, null);
  }

  let utf8Bytes: number;
  try {
    utf8Bytes = new TextEncoder().encode(input).byteLength;
  } catch {
    return rejected('INGEST_INTERNAL', 'JSON text inspection could not complete.', input, null);
  }
  if (utf8Bytes > JSON_TEXT_MAX_BYTES) {
    return rejected('INGEST_SIZE', 'JSON text exceeds 2,000,000 UTF-8 bytes.', input, utf8Bytes);
  }

  try {
    // Syntax check only; no reviver, and the parsed value is discarded.
    JSON.parse(input);
  } catch (error) {
    return error instanceof SyntaxError
      ? rejected('INGEST_SYNTAX', 'Invalid JSON syntax.', input, utf8Bytes)
      : rejected('INGEST_INTERNAL', 'JSON text inspection could not complete.', input, utf8Bytes);
  }
  return { kind: 'syntax-valid', rawText: input, utf8Bytes, semanticAdmission: 'NOT_EVALUATED' };
}
