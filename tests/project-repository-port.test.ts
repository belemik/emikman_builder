import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProjectRepositoryPort, RepositoryContext, ServerIssuedId,
  ProjectPersistenceRecord } from '../src/projects/repository.port';
import type { CreateProjectRequest, UpdateProjectRequest, CreateProjectRevisionRequest,
  RestoreProjectRequest, SoftDeleteProjectRequest, ProjectMutationResult, ProjectReadResult,
  ProjectRevisionResult, ConflictResult, NotFoundResult, ForbiddenResult, ValidationErrorResult,
  RepositoryRequestMap, CommitReceipt, RepositoryFailure } from '../src/projects/repository.dto';
const boundary = { scope: 'PROJECT_METADATA_ONLY', executionPermission: 'NOT_GRANTED',
  semanticAdmission: 'NOT_EVALUATED', trustedAdmission: 'NOT_IMPLEMENTED' } as const;

// Compile-only constraints, not a fake repository implementation or server principal factory.
function compileContract(port: ProjectRepositoryPort, context: RepositoryContext, create: CreateProjectRequest,
  update: UpdateProjectRequest, revision: CreateProjectRevisionRequest, restore: RestoreProjectRequest, remove: SoftDeleteProjectRequest) {
  const operations: readonly Promise<ProjectMutationResult>[] = [port.create(context, create), port.updateMetadata(context, update),
    port.createRevision(context, revision), port.restore(context, restore), port.softDelete(context, remove)];
  // @ts-expect-error Server principal cannot be forged by an ordinary DTO object.
  const forged: RepositoryContext = { principal: { accountId: 'client-claim' }, requestId: 'request' };
  // @ts-expect-error A client string is not a server-issued identity.
  const issued: ServerIssuedId<'project'> = 'prj_00000001-0000-4000-8000-000000000000';
  // @ts-expect-error Account ownership is not a permitted create DTO field.
  const ownerClaim: CreateProjectRequest = { ...create, accountId: 'client-claim' };
  // @ts-expect-error Missing expected revision cannot become an update command.
  const unguarded: UpdateProjectRequest = { ...update, expectedRevision: undefined };
  return [operations, forged, issued, ownerClaim, unguarded];
}
void compileContract; // The body is deliberately never invoked.
type Assert<T extends true> = T;
type HasRequiredGuard<T> = T extends { readonly expectedRevision: object; readonly idempotencyKey: string } ? true : false;
type GuardChecks = Assert<HasRequiredGuard<UpdateProjectRequest> & HasRequiredGuard<CreateProjectRevisionRequest>
  & HasRequiredGuard<RestoreProjectRequest> & HasRequiredGuard<SoftDeleteProjectRequest>>;
type InputOwnerCheck = Assert<'accountId' extends keyof CreateProjectRequest ? false : true>;
type PersistenceOwnerCheck = Assert<'accountId' extends keyof ProjectPersistenceRecord ? true : false>;
type IdKindsSeparate = Assert<ServerIssuedId<'document'> extends ServerIssuedId<'project'> ? false : true>;
// Force references without runtime claims or type assertions.
const typeEvidence: [GuardChecks, InputOwnerCheck, PersistenceOwnerCheck, IdKindsSeparate] = [true, true, true, true];

test('P02 repository port separates server context, DTO and persistence at typecheck', () => {
  assert.deepEqual(typeEvidence, [true, true, true, true]);
});
test('P02 conflicts and access/validation failures are distinct, never fake commit receipts', () => {
  const values: readonly RepositoryFailure[] = [
    { ...boundary, kind: 'conflict', reason: 'EXPECTED_REVISION_MISMATCH' } satisfies ConflictResult,
    { ...boundary, kind: 'conflict', reason: 'IDEMPOTENCY_KEY_REUSED' } satisfies ConflictResult,
    { ...boundary, kind: 'not-found' } satisfies NotFoundResult,
    { ...boundary, kind: 'forbidden' } satisfies ForbiddenResult,
    { ...boundary, kind: 'validation-error', diagnostics: [{ code: 'REQUEST_REQUIRED', path: '/expectedRevision', reason: 'Required field is absent.' }] } satisfies ValidationErrorResult,
    { ...boundary, kind: 'unavailable' },
  ];
  for (const result of values) { assert.notEqual(result.kind, 'committed'); assert.equal(Object.hasOwn(result, 'receipt'), false); assert.equal(result.executionPermission, 'NOT_GRANTED'); }
  const readFailure: ProjectReadResult = values[2], revisionFailure: ProjectRevisionResult = values[3];
  assert.equal(readFailure.kind, 'not-found'); assert.equal(revisionFailure.kind, 'forbidden');
});
test('P02 receipt contract can describe new revisions and idempotent replay without performing writes', () => {
  const projectId = 'prj_00000001-0000-4000-8000-000000000000';
  const parentRevisionId = 'prv_00000001-0000-4000-8000-000000000000';
  const restoredFromRevisionId = 'prv_00000002-0000-4000-8000-000000000000';
  const receipt: CommitReceipt = { operation: 'restore-project', projectId, parentRevisionId, restoredFromRevisionId,
    revision: { kind: 'project', projectId, id: 'prv_00000003-0000-4000-8000-000000000000',
      integrity: { algorithm: 'sha256', encoding: 'hex-lower', byteDomain: 'zarya.project-manifest.jcs/v1', value: 'a'.repeat(64) } },
    idempotencyKey: 'retry-fixture', replayed: false };
  const replay = { ...receipt, replayed: true } satisfies CommitReceipt;
  assert.equal(replay.revision.id, receipt.revision.id); assert.equal(replay.idempotencyKey, receipt.idempotencyKey);
  assert.notEqual(receipt.revision.id, parentRevisionId); assert.notEqual(receipt.revision.id, restoredFromRevisionId);
  // This is DTO representability evidence, NOT a test of real atomicity, retry or restore.
});
test('P02 all nine port operations have DTO contracts without transport or ownership fields', () => {
  const names: readonly (keyof RepositoryRequestMap)[] = ['create-project', 'read-project', 'list-projects', 'update-metadata', 'list-revisions', 'read-revision', 'create-revision', 'restore-project', 'soft-delete-project'];
  assert.equal(names.length, 9); assert.equal(new Set(names).size, 9);
  const source = readFileSync(new URL('../src/projects/repository.port.ts', import.meta.url), 'utf8');
  for (const method of ['create', 'read', 'list', 'updateMetadata', 'history', 'revision', 'createRevision', 'restore', 'softDelete'])
    assert.match(source, new RegExp('\\b' + method + '\\(context: RepositoryContext'));
});
test('P02 source modules have no runtime infrastructure, decoder or protected-code imports', () => {
  for (const file of ['repository.port.ts', 'repository.dto.ts', 'request.validation.ts']) {
    const source = readFileSync(new URL('../src/projects/' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\b(?:fetch|eval|require|setTimeout|setInterval)\s*\(|JSON\.parse|\b(?:localStorage|indexedDB|XMLHttpRequest|process|window)\b/);
    assert.doesNotMatch(source, /from ['"](?:node:|https?:|\.\.\/)/);
    assert.doesNotMatch(source, /\bimport\s*\(|\bnew\s+Date\b|Math\.random|crypto\./);
  }
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  for (const path of walk(fileURLToPath(new URL('../src', import.meta.url)))) {
    if (/[\/]projects[\/](?:repository\.port|repository\.dto|request\.validation)\.ts$/.test(path)) continue;
    if (/\.tsx?$/.test(path)) assert.doesNotMatch(readFileSync(path, 'utf8'), /(?:from|import\s*\()[^\n]*projects\/(?:repository\.port|repository\.dto|request\.validation)/);
  }
});
