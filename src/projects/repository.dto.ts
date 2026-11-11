import type { DeclaredIntegrity, DefinitionRef, NoExecutionAdmission } from './envelope.types';

/** P02 proposal contracts only. Neither these types nor shape inspection admit network input. */
export const REPOSITORY_DTO_VERSION = '1.0.0';
export interface RequestHeader {
  readonly dtoVersion: typeof REPOSITORY_DTO_VERSION;
  readonly modelId: 'zarya.project-envelope';
  readonly modelVersion: '1.0.0';
  readonly registry: { readonly id: 'zarya.project-definitions'; readonly version: '1.1.0-draft.1' };
}
export interface ProjectMetadataDTO {
  readonly name: string;
  readonly description: string;
  /** Same concept as P01 defaultProductRef; never an inferred Work goal. */
  readonly defaultProductRef: DefinitionRef | null;
}
/** Client's observation, not proof of server issuance, integrity or project access. */
export interface ProjectRevisionReferenceDTO {
  readonly kind: 'project';
  readonly id: string;
  readonly projectId: string;
  readonly integrity: DeclaredIntegrity;
}
export interface WriteGuardDTO {
  readonly expectedRevision: ProjectRevisionReferenceDTO;
  /** Opaque retry identity, not an authentication credential or content digest. */
  readonly idempotencyKey: string;
}
export interface CreateProjectRequest extends RequestHeader {
  readonly metadata: ProjectMetadataDTO;
  readonly idempotencyKey: string;
}
export interface ReadProjectRequest extends RequestHeader { readonly projectId: string }
/** Page size/cursor encoding and server enforcement remain open; no invented numeric quota. */
export interface ListProjectsRequest extends RequestHeader { readonly cursor: string | null }
export interface UpdateProjectRequest extends ReadProjectRequest, WriteGuardDTO {
  /** Explicit full replacement of these three fields, not an arbitrary patch or aggregate. */
  readonly metadata: ProjectMetadataDTO;
}
export interface ListProjectRevisionsRequest extends ReadProjectRequest { readonly cursor: string | null }
export interface ReadProjectRevisionRequest extends ReadProjectRequest {
  readonly revision: ProjectRevisionReferenceDTO;
}
/** An explicit metadata-only snapshot command. No client revision ID, hash or payload allocation. */
export interface CreateProjectRevisionRequest extends UpdateProjectRequest {}
export interface RestoreProjectRequest extends ReadProjectRequest, WriteGuardDTO {
  readonly sourceRevision: ProjectRevisionReferenceDTO;
}
export interface SoftDeleteProjectRequest extends ReadProjectRequest, WriteGuardDTO {}
export type RepositoryOperation = 'create-project' | 'read-project' | 'list-projects'
  | 'update-metadata' | 'list-revisions' | 'read-revision' | 'create-revision'
  | 'restore-project' | 'soft-delete-project';
export interface RepositoryRequestMap {
  readonly 'create-project': CreateProjectRequest;
  readonly 'read-project': ReadProjectRequest;
  readonly 'list-projects': ListProjectsRequest;
  readonly 'update-metadata': UpdateProjectRequest;
  readonly 'list-revisions': ListProjectRevisionsRequest;
  readonly 'read-revision': ReadProjectRevisionRequest;
  readonly 'create-revision': CreateProjectRevisionRequest;
  readonly 'restore-project': RestoreProjectRequest;
  readonly 'soft-delete-project': SoftDeleteProjectRequest;
}
export type WriteOperation = 'create-project' | 'update-metadata' | 'create-revision'
  | 'restore-project' | 'soft-delete-project';
export type RequestDiagnosticCode = 'REQUEST_OPERATION' | 'REQUEST_DATA_SHAPE'
  | 'REQUEST_REQUIRED' | 'REQUEST_UNKNOWN_FIELD' | 'REQUEST_FORBIDDEN_FIELD'
  | 'REQUEST_TYPE' | 'REQUEST_VALUE' | 'REQUEST_VERSION' | 'REQUEST_ID'
  | 'REQUEST_REVISION' | 'REQUEST_DIGEST' | 'REQUEST_DEFINITION';
export interface RequestDiagnostic {
  readonly code: RequestDiagnosticCode;
  readonly path: string;
  /** Static reason, never raw values, credentials or storage paths. */
  readonly reason: string;
}
/** Finite, acyclic JSON DATA trees supplied by trusted internal fixtures only.
 * No accessors, Proxy, symbols, class instances, shared object identities or arbitrary unknown
 * JS input. This type does NOT establish that trust. D05 decoder/quotas are not implemented.
 */
export type RequestJson = null | boolean | number | string | readonly RequestJson[] | RequestRecord;
export interface RequestRecord { readonly [key: string]: RequestJson }
export interface RequestShapeInspection extends NoExecutionAdmission {
  readonly kind: 'dto-shape-recognized' | 'dto-shape-rejected';
  readonly scope: 'TRUSTED_FIXTURE_SHAPE_ONLY';
  readonly productionInput: 'BLOCKED_BY_D05';
  readonly persistencePermission: 'NOT_GRANTED';
  readonly diagnostics: readonly RequestDiagnostic[];
  // Deliberately no value, parsed DTO, trusted brand, receipt, normalized or admitted payload.
}
export interface ProjectMetadataSnapshot {
  readonly projectId: string;
  readonly revision: ProjectRevisionReferenceDTO;
  readonly metadata: ProjectMetadataDTO;
  readonly lifecycle: 'active' | 'soft-deleted';
}
export interface ProjectRevisionView {
  readonly revision: ProjectRevisionReferenceDTO;
  readonly parentRevisionId: string | null;
  readonly restoredFromRevisionId: string | null;
  readonly sequence: number;
  readonly createdAt: string;
  readonly metadata: ProjectMetadataDTO;
}
export interface CommitReceipt {
  readonly operation: WriteOperation;
  readonly projectId: string;
  readonly revision: ProjectRevisionReferenceDTO;
  readonly parentRevisionId: string | null;
  readonly restoredFromRevisionId: string | null;
  readonly idempotencyKey: string;
  readonly replayed: boolean;
}
interface ResultBoundary extends NoExecutionAdmission { readonly scope: 'PROJECT_METADATA_ONLY' }
export interface NotFoundResult extends ResultBoundary { readonly kind: 'not-found' }
export interface ForbiddenResult extends ResultBoundary { readonly kind: 'forbidden' }
export interface ValidationErrorResult extends ResultBoundary {
  readonly kind: 'validation-error'; readonly diagnostics: readonly RequestDiagnostic[];
}
export interface ConflictResult extends ResultBoundary {
  readonly kind: 'conflict';
  readonly reason: 'EXPECTED_REVISION_MISMATCH' | 'IDEMPOTENCY_KEY_REUSED';
  // No other account's head, payload, principal or receipt is disclosed.
}
export interface UnavailableResult extends ResultBoundary { readonly kind: 'unavailable' }
export type RepositoryFailure = NotFoundResult | ForbiddenResult | ValidationErrorResult
  | ConflictResult | UnavailableResult;
export type ProjectReadResult = RepositoryFailure | (ResultBoundary & {
  readonly kind: 'project'; readonly project: ProjectMetadataSnapshot;
});
export type ProjectRevisionResult = RepositoryFailure | (ResultBoundary & {
  readonly kind: 'revision'; readonly revision: ProjectRevisionView;
});
export type ProjectMutationResult = RepositoryFailure | (ResultBoundary & {
  readonly kind: 'committed'; readonly receipt: CommitReceipt;
});
export type ProjectListResult = RepositoryFailure | (ResultBoundary & {
  readonly kind: 'project-page'; readonly projects: readonly ProjectMetadataSnapshot[];
  readonly nextCursor: string | null;
});
export type ProjectHistoryResult = RepositoryFailure | (ResultBoundary & {
  readonly kind: 'revision-page'; readonly revisions: readonly ProjectRevisionView[];
  readonly nextCursor: string | null;
});
