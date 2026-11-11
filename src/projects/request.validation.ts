import { MODEL_ID, MODEL_VERSION, REGISTRY_ID, REGISTRY_VERSION, PROJECT_DEFINITIONS } from './definitions';
import { hasEntityIdShape } from './compatibility';
import { REPOSITORY_DTO_VERSION } from './repository.dto';
import type { RequestJson, RequestRecord, RequestDiagnostic, RequestDiagnosticCode,
  RequestShapeInspection } from './repository.dto';

const forbidden = new Set(['__proto__', 'constructor', 'prototype', 'ownerId', 'accountId',
  'role', 'roles', 'principal', 'permissions', 'authorization', 'owner', 'account']);
const operations = new Set(['create-project', 'read-project', 'list-projects', 'update-metadata',
  'list-revisions', 'read-revision', 'create-revision', 'restore-project', 'soft-delete-project']);
function record(value: RequestJson): value is RequestRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const ptr = (path: string, key: string) => path + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1');
/** Only trusted, finite data-only fixture trees. NOT a production decoder or hostile-object API.
 * Accessors/Proxy are outside this boundary; no assumption that unknown JS objects are safe.
 * No quotas are invented here. Input safety/size/Unicode/decoding and reusable admission await D05.
 */
export function inspectProjectRequest(operation: string, input: RequestJson): RequestShapeInspection {
  const diagnostics: RequestDiagnostic[] = [];
  const add = (code: RequestDiagnosticCode, path: string, reason: string) => diagnostics.push({ code, path, reason });
  const finish = (): RequestShapeInspection => ({ kind: diagnostics.length ? 'dto-shape-rejected' : 'dto-shape-recognized',
    scope: 'TRUSTED_FIXTURE_SHAPE_ONLY', productionInput: 'BLOCKED_BY_D05', persistencePermission: 'NOT_GRANTED',
    executionPermission: 'NOT_GRANTED', semanticAdmission: 'NOT_EVALUATED', trustedAdmission: 'NOT_IMPLEMENTED', diagnostics });
  if (!operations.has(operation)) { add('REQUEST_OPERATION', '/operation', 'Unknown metadata repository operation.'); return finish(); }
  // Iterative walk of trusted finite fixtures. Detect accidental non-tree fixture data;
  // this is not a general guard against getters/Proxy or a production resource bound.
  const stack: { value: RequestJson; path: string }[] = [{ value: input, path: '' }];
  const seen = new Set<object>(); let badData = false;
  while (stack.length) {
    const item = stack.pop()!; const value = item.value;
    if (value === null || typeof value === 'string' || typeof value === 'boolean') continue;
    if (typeof value === 'number' && Number.isFinite(value)) continue;
    if (typeof value !== 'object') { add('REQUEST_DATA_SHAPE', item.path, 'Expected trusted JSON data.'); badData = true; continue; }
    if (seen.has(value)) { add('REQUEST_DATA_SHAPE', item.path, 'Fixture must be a finite JSON data tree without shared object identities.'); badData = true; continue; }
    seen.add(value);
    const prototype = Object.getPrototypeOf(value);
    if ((prototype !== Object.prototype && prototype !== null && prototype !== Array.prototype)
      || Object.getOwnPropertySymbols(value).length) {
      add('REQUEST_DATA_SHAPE', item.path, 'Fixture must contain plain JSON data only.'); badData = true; continue;
    }
    const keys = Object.getOwnPropertyNames(value).filter(key => !(Array.isArray(value) && key === 'length')).sort().reverse();
    for (const key of keys) {
      const path = ptr(item.path, key); const d = Object.getOwnPropertyDescriptor(value, key)!;
      if (!Object.hasOwn(d, 'value') || !d.enumerable) {
        add('REQUEST_DATA_SHAPE', path, 'Accessors and hidden fields are outside the data-only fixture boundary.'); badData = true; continue;
      }
      if (forbidden.has(key)) add('REQUEST_FORBIDDEN_FIELD', path, 'Client authority claims and prototype-related property names are forbidden.');
      stack.push({ value: d.value, path });
    }
  }
  if (badData) return finish();
  const object = (value: RequestJson, path: string): RequestRecord | undefined => {
    if (record(value)) return value;
    add('REQUEST_TYPE', path, 'Expected a metadata object.'); return undefined;
  };
  const fields = (value: RequestRecord, names: readonly string[], path: string) => {
    for (const key of names) if (!Object.hasOwn(value, key)) add('REQUEST_REQUIRED', ptr(path, key), 'Required field is absent.');
    for (const key of Object.keys(value).sort()) if (!names.includes(key) && !forbidden.has(key))
      add('REQUEST_UNKNOWN_FIELD', ptr(path, key), 'Unknown field is not accepted or silently removed.');
  };
  const string = (value: RequestJson, path: string, nonempty = false): value is string => {
    if (typeof value !== 'string') { add('REQUEST_TYPE', path, 'Expected a string.'); return false; }
    if (nonempty && !/\S/u.test(value)) { add('REQUEST_VALUE', path, 'A nonempty value is required; no default is substituted.'); return false; }
    return true;
  };
  const identity = (value: RequestJson, path: string, kind: 'project' | 'project-revision') => {
    if (string(value, path) && !hasEntityIdShape(value, kind)) add('REQUEST_ID', path, 'Expected an exact lowercase entity ID shape; no issuance or access is proved.');
  };
  const exact = (value: RequestJson, expected: string, path: string) => {
    if (value !== expected) add('REQUEST_VERSION', path, 'Unknown exact identity/version; no latest fallback.');
  };
  const digest = (value: RequestJson, path: string) => {
    const d = object(value, path); if (!d) return;
    fields(d, ['algorithm', 'encoding', 'byteDomain', 'value'], path);
    if (d.algorithm !== 'sha256' || d.encoding !== 'hex-lower' || d.byteDomain !== 'zarya.project-manifest.jcs/v1'
      || typeof d.value !== 'string' || d.value.length !== 64 || !/^[0-9a-f]{64}$/u.test(d.value))
      add('REQUEST_DIGEST', path, 'Invalid project integrity declaration shape/domain. Hash bytes are not verified.');
  };
  const revision = (value: RequestJson, path: string, projectId: RequestJson) => {
    const ref = object(value, path); if (!ref) return;
    fields(ref, ['kind', 'id', 'projectId', 'integrity'], path);
    if (ref.kind !== 'project') add('REQUEST_REVISION', ptr(path, 'kind'), 'Only project revision references are allowed.');
    identity(ref.id, ptr(path, 'id'), 'project-revision'); identity(ref.projectId, ptr(path, 'projectId'), 'project');
    if (ref.projectId !== projectId) add('REQUEST_REVISION', ptr(path, 'projectId'), 'Revision reference must declare the same project as the request.');
    digest(ref.integrity, ptr(path, 'integrity'));
  };
  const metadata = (value: RequestJson, path: string) => {
    const m = object(value, path); if (!m) return;
    fields(m, ['name', 'description', 'defaultProductRef'], path);
    string(m.name, ptr(path, 'name'), true); string(m.description, ptr(path, 'description'));
    if (m.defaultProductRef !== null) {
      const d = object(m.defaultProductRef, ptr(path, 'defaultProductRef'));
      if (d) {
        fields(d, ['id', 'definitionVersion'], ptr(path, 'defaultProductRef'));
        if (!PROJECT_DEFINITIONS.products.some(p => p.id === d.id && p.definitionVersion === d.definitionVersion))
          add('REQUEST_DEFINITION', ptr(path, 'defaultProductRef'), 'Unknown exact product definition. No goal or Web fallback is inferred.');
      }
    }
  };
  const root = object(input, ''); if (!root) return finish();
  const header = ['dtoVersion', 'modelId', 'modelVersion', 'registry'];
  const project = operation !== 'create-project' && operation !== 'list-projects';
  const write = ['update-metadata', 'create-revision', 'restore-project', 'soft-delete-project'].includes(operation);
  const hasMetadata = ['create-project', 'update-metadata', 'create-revision'].includes(operation);
  const cursor = operation === 'list-projects' || operation === 'list-revisions';
  const names = [...header, ...(project ? ['projectId'] : []), ...(write ? ['expectedRevision', 'idempotencyKey'] : []),
    ...(operation === 'create-project' ? ['idempotencyKey'] : []), ...(hasMetadata ? ['metadata'] : []),
    ...(cursor ? ['cursor'] : []), ...(operation === 'read-revision' ? ['revision'] : []), ...(operation === 'restore-project' ? ['sourceRevision'] : [])];
  fields(root, names, '');
  exact(root.dtoVersion, REPOSITORY_DTO_VERSION, '/dtoVersion'); exact(root.modelId, MODEL_ID, '/modelId'); exact(root.modelVersion, MODEL_VERSION, '/modelVersion');
  const reg = object(root.registry, '/registry');
  if (reg) { fields(reg, ['id', 'version'], '/registry'); exact(reg.id, REGISTRY_ID, '/registry/id'); exact(reg.version, REGISTRY_VERSION, '/registry/version'); }
  if (project) identity(root.projectId, '/projectId', 'project');
  if (write) revision(root.expectedRevision, '/expectedRevision', root.projectId);
  if (write || operation === 'create-project') string(root.idempotencyKey, '/idempotencyKey', true);
  if (hasMetadata) metadata(root.metadata, '/metadata');
  if (cursor && root.cursor !== null) string(root.cursor, '/cursor', true);
  if (operation === 'read-revision') revision(root.revision, '/revision', root.projectId);
  if (operation === 'restore-project') {
    revision(root.sourceRevision, '/sourceRevision', root.projectId);
    if (record(root.sourceRevision) && record(root.expectedRevision)
      && root.sourceRevision.id === root.expectedRevision.id && record(root.sourceRevision.integrity) && record(root.expectedRevision.integrity)
      && root.sourceRevision.integrity.value !== root.expectedRevision.integrity.value)
      add('REQUEST_REVISION', '/sourceRevision/integrity', 'The same revision identity cannot declare two different digests.');
  }
  return finish();
}
