import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectProjectRequest } from '../src/projects/request.validation';
import type { RequestJson, RequestRecord, RepositoryOperation, RequestDiagnosticCode,
  CreateProjectRequest, UpdateProjectRequest } from '../src/projects/repository.dto';
const projectId = 'prj_00000001-0000-4000-8000-000000000000';
const revisionId = 'prv_00000001-0000-4000-8000-000000000000';
const header = { dtoVersion: '1.0.0', modelId: 'zarya.project-envelope', modelVersion: '1.0.0',
  registry: { id: 'zarya.project-definitions', version: '1.1.0-draft.1' } } as const;
const metadata = () => ({ name: 'Metadata fixture', description: 'Keep \r\n e\u0301 unchanged', defaultProductRef: null });
const revision = (n = '1') => ({ kind: 'project', id: n === '1' ? revisionId : 'prv_00000002-0000-4000-8000-000000000000', projectId,
  integrity: { algorithm: 'sha256', encoding: 'hex-lower', byteDomain: 'zarya.project-manifest.jcs/v1', value: 'a'.repeat(64) } } as const);
function fixture(operation: RepositoryOperation): RequestRecord {
  const base = { ...header, registry: { ...header.registry } };
  switch (operation) {
    case 'create-project': return { ...base, metadata: metadata(), idempotencyKey: 'retry-1' } satisfies CreateProjectRequest;
    case 'read-project': return { ...base, projectId };
    case 'list-projects': return { ...base, cursor: null };
    case 'list-revisions': return { ...base, projectId, cursor: null };
    case 'read-revision': return { ...base, projectId, revision: revision() };
    case 'update-metadata': case 'create-revision': return { ...base, projectId, metadata: metadata(), expectedRevision: revision(), idempotencyKey: 'retry-1' } satisfies UpdateProjectRequest;
    case 'restore-project': return { ...base, projectId, expectedRevision: revision(), sourceRevision: revision('2'), idempotencyKey: 'retry-1' };
    case 'soft-delete-project': return { ...base, projectId, expectedRevision: revision(), idempotencyKey: 'retry-1' };
  }
}
const operations: readonly RepositoryOperation[] = ['create-project', 'read-project', 'list-projects', 'update-metadata', 'list-revisions', 'read-revision', 'create-revision', 'restore-project', 'soft-delete-project'];
function rejected(operation: string, value: RequestJson, code: RequestDiagnosticCode, path?: string) {
  const result = inspectProjectRequest(operation, value);
  assert.equal(result.kind, 'dto-shape-rejected');
  assert.ok(result.diagnostics.some(d => d.code === code && (path === undefined || d.path === path)), JSON.stringify(result));
  assert.equal(result.productionInput, 'BLOCKED_BY_D05'); assert.equal(result.persistencePermission, 'NOT_GRANTED');
  return result;
}
for (const operation of operations) test(`P02 ${operation}: well-formed trusted fixture has shape only, no admission`, () => {
  const result = inspectProjectRequest(operation, fixture(operation));
  assert.equal(result.kind, 'dto-shape-recognized'); assert.deepEqual(result.diagnostics, []);
  assert.equal(result.scope, 'TRUSTED_FIXTURE_SHAPE_ONLY'); assert.equal(result.productionInput, 'BLOCKED_BY_D05');
  assert.equal(result.executionPermission, 'NOT_GRANTED'); assert.equal(result.semanticAdmission, 'NOT_EVALUATED');
  assert.equal(result.trustedAdmission, 'NOT_IMPLEMENTED'); assert.equal(result.persistencePermission, 'NOT_GRANTED');
  for (const key of ['value', 'parsed', 'request', 'trustedValue', 'receipt', 'normalized']) assert.equal(Object.hasOwn(result, key), false);
});
for (const operation of ['update-metadata', 'create-revision', 'restore-project', 'soft-delete-project'] as const) {
  for (const field of ['expectedRevision', 'idempotencyKey']) test(`P02 ${operation}: ${field} is mandatory`, () => {
    const value = { ...fixture(operation) }; delete value[field]; rejected(operation, value, 'REQUEST_REQUIRED', '/' + field);
  });
}
test('P02 every required DTO field is checked without defaults', () => {
  for (const operation of operations) {
    const input = fixture(operation);
    for (const field of Object.keys(input)) {
      const value = { ...input }; delete value[field]; rejected(operation, value, 'REQUEST_REQUIRED', '/' + field);
    }
  }
});
for (const key of ['__proto__', 'constructor', 'prototype', 'ownerId', 'accountId', 'role', 'roles', 'principal', 'permissions', 'authorization', 'owner', 'account']) {
  test(`P02 client key ${key} is rejected at root and nested metadata`, () => {
    const base = fixture('create-project');
    rejected('create-project', { ...base, [key]: 'forged' }, 'REQUEST_FORBIDDEN_FIELD', '/' + key);
    rejected('create-project', { ...base, metadata: { ...metadata(), [key]: 'forged' } }, 'REQUEST_FORBIDDEN_FIELD', '/metadata/' + key);
  });
}
test('P02 unknown root/nested/digest fields are rejected and JSON Pointer paths escaped', () => {
  const base = fixture('update-metadata');
  rejected('update-metadata', { ...base, 'x/y~z': 'extra' }, 'REQUEST_UNKNOWN_FIELD', '/x~1y~0z');
  rejected('update-metadata', { ...base, metadata: { ...metadata(), extra: 'extra' } }, 'REQUEST_UNKNOWN_FIELD', '/metadata/extra');
  rejected('update-metadata', { ...base, expectedRevision: { ...revision(), integrity: { ...revision().integrity, extra: 1 } } }, 'REQUEST_UNKNOWN_FIELD', '/expectedRevision/integrity/extra');
  rejected('create-project', { ...fixture('create-project'), projectId }, 'REQUEST_UNKNOWN_FIELD', '/projectId');
  rejected('create-project', { ...fixture('create-project'), revision: revision() }, 'REQUEST_UNKNOWN_FIELD', '/revision');
});
test('P02 model, registry and DTO versions require exact identities, never latest', () => {
  const base = fixture('create-project');
  for (const [key, value] of [['dtoVersion', 'latest'], ['modelVersion', '9.0.0'], ['modelId', 'unknown']])
    rejected('create-project', { ...base, [key]: value }, 'REQUEST_VERSION', '/' + key);
  for (const [key, value] of [['id', 'unknown'], ['version', '1.0.0']])
    rejected('create-project', { ...base, registry: { ...header.registry, [key]: value } }, 'REQUEST_VERSION', '/registry/' + key);
});
test('P02 invalid project/revision ID shapes and foreign revision scopes cannot fall back', () => {
  const base = fixture('update-metadata');
  for (const value of ['mock-1', '__proto__', 'constructor', projectId.toUpperCase(), projectId + '\n'])
    rejected('update-metadata', { ...base, projectId: value }, 'REQUEST_ID', '/projectId');
  for (const value of [projectId, 'latest', revisionId + '\n'])
    rejected('update-metadata', { ...base, expectedRevision: { ...revision(), id: value } }, 'REQUEST_ID', '/expectedRevision/id');
  rejected('update-metadata', { ...base, expectedRevision: { ...revision(), kind: 'document' } }, 'REQUEST_REVISION');
  rejected('update-metadata', { ...base, expectedRevision: { ...revision(), projectId: 'prj_00000002-0000-4000-8000-000000000000' } }, 'REQUEST_REVISION', '/expectedRevision/projectId');
});
test('P02 digest declarations require exact algorithm, encoding, domain, lowercase 64 hex', () => {
  const base = fixture('update-metadata'), ref = revision();
  for (const patch of [{ algorithm: 'md5' }, { encoding: 'base64' }, { byteDomain: 'raw-bytes' }, { value: 'A'.repeat(64) }, { value: 'a'.repeat(63) }, { value: 'a'.repeat(64) + '\n' }, { value: 'z'.repeat(64) }])
    rejected('update-metadata', { ...base, expectedRevision: { ...ref, integrity: { ...ref.integrity, ...patch } } }, 'REQUEST_DIGEST');
  rejected('update-metadata', { ...base, expectedRevision: { ...ref, integrity: null } }, 'REQUEST_TYPE');
  // A syntactically plausible declaration is not a verified hash.
  assert.equal(inspectProjectRequest('update-metadata', base).productionInput, 'BLOCKED_BY_D05');
});
test('P02 restore/read history references are scoped; same revision cannot claim two digests', () => {
  rejected('read-revision', { ...fixture('read-revision'), revision: { ...revision(), projectId: 'prj_00000002-0000-4000-8000-000000000000' } }, 'REQUEST_REVISION');
  rejected('restore-project', { ...fixture('restore-project'), sourceRevision: { ...revision(), integrity: { ...revision().integrity, value: 'b'.repeat(64) } } }, 'REQUEST_REVISION', '/sourceRevision/integrity');
  const value = { ...fixture('restore-project') }; delete value.sourceRevision;
  rejected('restore-project', value, 'REQUEST_REQUIRED', '/sourceRevision');
});
test('P02 exact product defaults are recognized; arbitrary goals/platform fields are not introduced', () => {
  const base = fixture('create-project');
  assert.equal(inspectProjectRequest('create-project', { ...base, metadata: { ...metadata(), defaultProductRef: { id: 'product:mobile-app', definitionVersion: '1.0.0' } } }).kind, 'dto-shape-recognized');
  for (const ref of [{ id: 'product:invented', definitionVersion: '1.0.0' }, { id: 'product:web-application', definitionVersion: 'latest' }, { id: 'format:wdeaf-screen-v3', definitionVersion: '1.0.0' }])
    rejected('create-project', { ...base, metadata: { ...metadata(), defaultProductRef: ref } }, 'REQUEST_DEFINITION');
  rejected('create-project', { ...base, metadata: { ...metadata(), platform: 'web' } }, 'REQUEST_UNKNOWN_FIELD');
});
test('P02 idempotency keys are explicit opaque metadata, never generated or trimmed', () => {
  const base = fixture('create-project');
  for (const key of ['', '   ', 42, null, true, {}]) rejected('create-project', { ...base, idempotencyKey: key }, typeof key === 'string' ? 'REQUEST_VALUE' : 'REQUEST_TYPE');
  const value = { ...base, idempotencyKey: ' retry-1 ' }; assert.equal(inspectProjectRequest('create-project', value).kind, 'dto-shape-recognized'); assert.equal(value.idempotencyKey, ' retry-1 ');
});
test('P02 cursors are explicit nullable opaque strings; no unapproved page quota is selected', () => {
  const base = fixture('list-projects');
  assert.equal(inspectProjectRequest('list-projects', { ...base, cursor: 'opaque-cursor' }).kind, 'dto-shape-recognized');
  rejected('list-projects', { ...base, cursor: 100 }, 'REQUEST_TYPE'); rejected('list-projects', { ...base, limit: 100 }, 'REQUEST_UNKNOWN_FIELD');
});
test('P02 invalid field combinations/types do not become admitted metadata', () => {
  const base = fixture('create-project');
  for (const value of [null, true, 2, 'raw', []]) rejected('create-project', value, 'REQUEST_TYPE');
  rejected('create-project', { ...base, metadata: [] }, 'REQUEST_TYPE');
  rejected('create-project', { ...base, metadata: { ...metadata(), name: '' } }, 'REQUEST_VALUE');
  rejected('create-project', { ...base, metadata: { ...metadata(), description: 1 } }, 'REQUEST_TYPE');
  rejected('create-project', { ...base, metadata: { ...metadata(), defaultProductRef: [] } }, 'REQUEST_TYPE');
  rejected('create-project', { ...base, expectedRevision: revision() }, 'REQUEST_UNKNOWN_FIELD');
});
test('P02 unknown operation and prototype-like operation names are rejected safely', () => {
  for (const op of ['__proto__', 'constructor', 'toString', 'apply', 'generate', 'unknown']) rejected(op, fixture('create-project'), 'REQUEST_OPERATION', '/operation');
});
test('P02 fixture data-shape mistakes do not imply a hostile-object decoder', () => {
  const cycle: Record<string, RequestJson> = {}; cycle.self = cycle;
  rejected('create-project', cycle, 'REQUEST_DATA_SHAPE');
  for (const n of [NaN, Infinity, -Infinity]) rejected('create-project', n, 'REQUEST_DATA_SHAPE');
  let accessed = 0;
  const accessor = { get metadata() { accessed++; return metadata(); } };
  rejected('create-project', accessor, 'REQUEST_DATA_SHAPE'); assert.equal(accessed, 0);
  const hidden = { ...fixture('create-project') }; Object.defineProperty(hidden, 'ownerId', { value: 'forged', enumerable: false });
  rejected('create-project', hidden, 'REQUEST_DATA_SHAPE');
  const alteredPrototype = Object.create({ ownerId: 'inherited' });
  rejected('create-project', alteredPrototype, 'REQUEST_DATA_SHAPE');
  // Proxy is intentionally NOT exercised: P02 cannot establish a safe arbitrary-object boundary.
});
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
test('P02 inspection is deterministic and does not mutate/normalize source or share diagnostics', () => {
  const value = freeze({ ...fixture('update-metadata'), metadata: { ...metadata(), name: '  e\u0301\r\n  ', extra: 'DO_NOT_DISCLOSE_PAYLOAD' } });
  const before = structuredClone(value), first = inspectProjectRequest('update-metadata', value);
  for (let i = 0; i < 5; i++) assert.deepEqual(inspectProjectRequest('update-metadata', value), first);
  assert.deepEqual(value, before); assert.ok(!JSON.stringify(first).includes('DO_NOT_DISCLOSE_PAYLOAD'));
  Reflect.set(first.diagnostics[0], 'reason', 'caller-owned modification');
  assert.notEqual(inspectProjectRequest('update-metadata', value).diagnostics[0].reason, 'caller-owned modification');
});
