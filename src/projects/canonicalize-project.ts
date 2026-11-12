import { MODEL_ID, MODEL_VERSION, PROJECT_DEFINITIONS } from './definitions';
import { hasEntityIdShape } from './compatibility';
import type { CanonicalizationDiagnostic, CanonicalizationDiagnosticCode,
  CanonicalizationFailure, CanonicalizationScope, JcsCanonicalizationResult,
  ProjectCanonicalizationResult, TrustedOwnedJcsData } from './canonicalization.types';

const profile = 'zarya.project-manifest.jcs/v1';
const restrictions = Object.freeze({ executionPermission: 'NOT_GRANTED',
  semanticAdmission: 'NOT_EVALUATED', trustedAdmission: 'NOT_IMPLEMENTED',
  persistencePermission: 'NOT_GRANTED' } as const);
function diagnostic(code: CanonicalizationDiagnosticCode, path: string, reason: string): CanonicalizationDiagnostic {
  return Object.freeze({ code, path, reason });
}
function failure<S extends CanonicalizationScope>(scope: S, error: CanonicalizationDiagnostic): CanonicalizationFailure<S> {
  return Object.freeze({ ...restrictions, kind: 'canonicalization-error', scope,
    diagnostics: Object.freeze([error]) });
}
function unicodeValid(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff) {
      const low = text.charCodeAt(++i);
      if (!(low >= 0xdc00 && low <= 0xdfff)) return false;
      cp = 0x10000 + (cp - 0xd800) * 0x400 + low - 0xdc00;
    } else if (cp >= 0xdc00 && cp <= 0xdfff) return false;
    if ((cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xffff) >= 0xfffe) return false;
  }
  return true;
}
type RecordSnapshot = { readonly fields: ReadonlyMap<string, unknown> }
  | { readonly error: CanonicalizationDiagnostic };
/** Defensive checks on ordinary internal fixtures; reflection is NOT a Proxy sandbox. */
function record(value: unknown, path: string): RecordSnapshot {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    return { error: diagnostic('S1B_DATA_SHAPE', path, 'Expected a plain data record.') };
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const fields = new Map<string, unknown>();
  for (const key of Reflect.ownKeys(descriptors).sort((a, b) => typeof a === 'string' && typeof b === 'string' ? (a < b ? -1 : a > b ? 1 : 0) : 0)) {
    if (typeof key !== 'string') return { error: diagnostic('S1B_DATA_SHAPE', path, 'Symbol properties are unsupported.') };
    const desc = descriptors[key];
    if (!('value' in desc) || !desc.enumerable) return { error: diagnostic('S1B_DATA_SHAPE', path, 'Only enumerable own data properties are supported.') };
    if (!unicodeValid(key)) return { error: diagnostic('S1B_UNICODE', path, 'Invalid Unicode in a property name.') };
    fields.set(key, desc.value);
  }
  return { fields };
}
type ArraySnapshot = { readonly items: readonly unknown[] } | { readonly error: CanonicalizationDiagnostic };
function array(value: readonly unknown[], path: string): ArraySnapshot {
  if (Object.getPrototypeOf(value) !== Array.prototype) return { error: diagnostic('S1B_DATA_SHAPE', path, 'Only plain arrays are supported.') };
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== value.length + 1) return { error: diagnostic('S1B_DATA_SHAPE', path, 'Sparse arrays or extra array properties are unsupported.') };
  const items: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    const desc = descriptors[String(i)];
    if (!desc || !('value' in desc) || !desc.enumerable) return { error: diagnostic('S1B_DATA_SHAPE', path, 'Only dense data arrays are supported.') };
    items.push(desc.value);
  }
  return { items };
}
type Task = { readonly kind: 'value'; readonly value: unknown; readonly path: string }
  | { readonly kind: 'text'; readonly text: string } | { readonly kind: 'exit'; readonly value: object };
type Encoded = { readonly text: string } | { readonly error: CanonicalizationDiagnostic };
/** Iterative traversal. No production quotas or hostile-input resource guarantees. */
function encode(value: TrustedOwnedJcsData, projectNumbers: boolean): Encoded {
  const stack: Task[] = [{ kind: 'value', value, path: '$' }];
  const active = new Set<object>();
  const chunks: string[] = [];
  while (stack.length) {
    const task = stack.pop();
    if (!task) break;
    if (task.kind === 'text') { chunks.push(task.text); continue; }
    if (task.kind === 'exit') { active.delete(task.value); continue; }
    const { value: current, path } = task;
    if (current === null) { chunks.push('null'); continue; }
    if (typeof current === 'boolean') { chunks.push(current ? 'true' : 'false'); continue; }
    if (typeof current === 'string') {
      if (!unicodeValid(current)) return { error: diagnostic('S1B_UNICODE', path, 'Invalid Unicode string.') };
      chunks.push(JSON.stringify(current)); continue;
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current) || (projectNumbers && (!Number.isSafeInteger(current) || Object.is(current, -0)))) {
        return { error: diagnostic('S1B_NUMBER', path, 'Number is outside the selected numeric domain.') };
      }
      chunks.push(JSON.stringify(current)); continue;
    }
    if (typeof current !== 'object') return { error: diagnostic('S1B_DATA_SHAPE', path, 'Unsupported data value.') };
    if (active.has(current)) return { error: diagnostic('S1B_CYCLE', path, 'Cyclic data is unsupported.') };
    active.add(current);
    stack.push({ kind: 'exit', value: current });
    if (Array.isArray(current)) {
      const snapshot = array(current, path);
      if ('error' in snapshot) return snapshot;
      chunks.push('['); stack.push({ kind: 'text', text: ']' });
      for (let i = snapshot.items.length - 1; i >= 0; i--) {
        stack.push({ kind: 'value', value: snapshot.items[i], path: `${path}/${i}` });
        if (i > 0) stack.push({ kind: 'text', text: ',' });
      }
    } else {
      const snapshot = record(current, path);
      if ('error' in snapshot) return snapshot;
      const keys = [...snapshot.fields.keys()].sort(); // unsigned UTF-16; never locale/UTF-8.
      chunks.push('{'); stack.push({ kind: 'text', text: '}' });
      for (let i = keys.length - 1; i >= 0; i--) {
        const key = keys[i];
        stack.push({ kind: 'value', value: snapshot.fields.get(key), path: `${path}/value` });
        stack.push({ kind: 'text', text: `${JSON.stringify(key)}:` });
        if (i > 0) stack.push({ kind: 'text', text: ',' });
      }
    }
  }
  return { text: chunks.join('') };
}
/** Trusted bounded owned data only. Does not inspect raw JSON, authorize or hash. */
export function canonicalizeJcsData(trustedOwnedData: TrustedOwnedJcsData): JcsCanonicalizationResult {
  const result = encode(trustedOwnedData, false);
  return 'error' in result ? failure('JCS_DATA_ONLY', result.error)
    : Object.freeze({ ...restrictions, kind: 'canonicalized', scope: 'JCS_DATA_ONLY', canonicalText: result.text });
}
function closed(value: unknown, keys: readonly string[], path: string): RecordSnapshot {
  const result = record(value, path);
  if ('error' in result) return result;
  for (const key of keys) if (!result.fields.has(key)) return { error: diagnostic('S1B_MISSING_FIELD', `${path}/${key}`, 'Required field is missing.') };
  if (result.fields.size !== keys.length || [...result.fields.keys()].some(key => !keys.includes(key))) {
    return { error: diagnostic('S1B_UNKNOWN_FIELD', path, 'Unknown fields are unsupported; none are stripped.') };
  }
  return result;
}
function nonblank(value: unknown): value is string { return typeof value === 'string' && /\S/u.test(value); }
function timestamp(value: unknown): boolean {
  if (typeof value !== 'string' || value.length !== 24 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60;
}
function inspectManifest(value: TrustedOwnedJcsData): CanonicalizationDiagnostic | null {
  const root = closed(value, ['modelId', 'modelVersion', 'canonicalizationProfile', 'projectId', 'revision', 'content'], '$');
  if ('error' in root) return root.error;
  const r = root.fields;
  if (r.get('modelId') !== MODEL_ID || r.get('modelVersion') !== MODEL_VERSION || r.get('canonicalizationProfile') !== profile) {
    return diagnostic('S1B_VERSION', '$', 'Exact model and canonicalization profile versions are required.');
  }
  const projectId = r.get('projectId');
  if (typeof projectId !== 'string' || !hasEntityIdShape(projectId, 'project')) return diagnostic('S1B_ID', '$/projectId', 'Invalid project ID shape.');
  const revision = closed(r.get('revision'), ['id', 'parentId', 'sequence', 'createdAt', 'actorRef', 'restoreOf'], '$/revision');
  if ('error' in revision) return revision.error;
  const rev = revision.fields;
  for (const field of ['id', 'parentId', 'restoreOf']) {
    const id = rev.get(field);
    if (id === null && field !== 'id') continue;
    if (typeof id !== 'string' || !hasEntityIdShape(id, 'project-revision')) return diagnostic('S1B_ID', `$/revision/${field}`, 'Invalid revision ID shape.');
  }
  const sequence = rev.get('sequence');
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || Object.is(sequence, -0) || sequence < 1) return diagnostic('S1B_NUMBER', '$/revision/sequence', 'Sequence must be a positive safe integer.');
  if ((rev.get('parentId') === null && (sequence !== 1 || rev.get('restoreOf') !== null))
    || (rev.get('parentId') !== null && sequence < 2)
    || rev.get('id') === rev.get('parentId') || rev.get('id') === rev.get('restoreOf')) {
    return diagnostic('S1B_LINEAGE', '$/revision', 'Inconsistent declared revision lineage.');
  }
  if (!timestamp(rev.get('createdAt'))) return diagnostic('S1B_TIMESTAMP', '$/revision/createdAt', 'Expected an existing UTC millisecond calendar timestamp.');
  if (!nonblank(rev.get('actorRef'))) return diagnostic('S1B_DATA_SHAPE', '$/revision/actorRef', 'Explicit nonblank actor reference is required; identity is not verified.');
  const content = closed(r.get('content'), ['metadata', 'permittedSourceRefs', 'designDefaultsRef', 'works', 'documentHeads'], '$/content');
  if ('error' in content) return content.error;
  for (const field of ['permittedSourceRefs', 'works', 'documentHeads']) {
    const region = content.fields.get(field);
    if (!Array.isArray(region)) return diagnostic('S1B_DATA_SHAPE', `$/content/${field}`, 'Explicit empty array is required.');
    const snapshot = array(region, `$/content/${field}`);
    if ('error' in snapshot) return snapshot.error;
    if (snapshot.items.length !== 0) return diagnostic('S1B_UNSUPPORTED_REGION', `$/content/${field}`, 'Nonempty region is outside metadata-only S1b.');
  }
  if (content.fields.get('designDefaultsRef') !== null) return diagnostic('S1B_UNSUPPORTED_REGION', '$/content/designDefaultsRef', 'Design defaults are outside metadata-only S1b.');
  const metadata = closed(content.fields.get('metadata'), ['name', 'description', 'defaultProjectType'], '$/content/metadata');
  if ('error' in metadata) return metadata.error;
  if (!nonblank(metadata.fields.get('name')) || typeof metadata.fields.get('description') !== 'string') return diagnostic('S1B_DATA_SHAPE', '$/content/metadata', 'Name must be nonblank and description must be a string.');
  const product = metadata.fields.get('defaultProjectType');
  if (product !== null) {
    const ref = closed(product, ['id', 'definitionVersion'], '$/content/metadata/defaultProjectType');
    if ('error' in ref) return ref.error;
    if (!PROJECT_DEFINITIONS.products.some(item => item.id === ref.fields.get('id') && item.definitionVersion === ref.fields.get('definitionVersion'))) {
      return diagnostic('S1B_DEFINITION', '$/content/metadata/defaultProjectType', 'Exact pinned product definition is required.');
    }
  }
  return null;
}
/** Full explicit internal manifest only, NOT P02 DTO projection or production admission. */
export function canonicalizeProjectManifest(trustedOwnedManifestCandidate: TrustedOwnedJcsData): ProjectCanonicalizationResult {
  const error = inspectManifest(trustedOwnedManifestCandidate);
  if (error) return failure('PROJECT_MANIFEST_METADATA_ONLY', error);
  const result = encode(trustedOwnedManifestCandidate, true);
  return 'error' in result ? failure('PROJECT_MANIFEST_METADATA_ONLY', result.error)
    : Object.freeze({ ...restrictions, kind: 'canonicalized', scope: 'PROJECT_MANIFEST_METADATA_ONLY',
      canonicalizationProfile: profile, canonicalText: result.text });
}
