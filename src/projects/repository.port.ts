import type { EntityKind, DeclaredIntegrity } from './envelope.types';
import type { CreateProjectRequest, ReadProjectRequest, ListProjectsRequest, UpdateProjectRequest,
  ListProjectRevisionsRequest, ReadProjectRevisionRequest, CreateProjectRevisionRequest,
  RestoreProjectRequest, SoftDeleteProjectRequest, ProjectReadResult, ProjectListResult,
  ProjectHistoryResult, ProjectRevisionResult, ProjectMutationResult, ProjectMetadataDTO } from './repository.dto';

// Nominal distinctions prevent accidental DTO assignment. No public factory or runtime authority.
// Type assertions/TypeScript alone cannot authenticate an account or prove server ID issuance.
declare const issuedId: unique symbol;
declare const verifiedPrincipal: unique symbol;
export type ServerIssuedId<K extends EntityKind> = string & { readonly [issuedId]: K };
/** Created only by a future server adapter AFTER existing session verification, never from DTO. */
export interface ServerVerifiedPrincipal {
  readonly accountId: string; // Existing account namespace is not migrated to project UUIDs.
  readonly [verifiedPrincipal]: true;
}
export interface RepositoryContext {
  readonly principal: ServerVerifiedPrincipal;
  readonly requestId: string;
}
/** Internal proposed records, distinct from input DTO and public read results. No storage adapter. */
export interface ProjectPersistenceRecord {
  readonly id: ServerIssuedId<'project'>;
  readonly accountId: string;
  readonly currentRevisionId: ServerIssuedId<'project-revision'>;
  readonly lifecycle: 'active' | 'soft-deleted';
}
export interface ProjectRevisionPersistenceRecord {
  readonly id: ServerIssuedId<'project-revision'>;
  readonly projectId: ServerIssuedId<'project'>;
  readonly parentId: ServerIssuedId<'project-revision'> | null;
  readonly restoredFromId: ServerIssuedId<'project-revision'> | null;
  readonly sequence: number;
  readonly createdAt: string;
  readonly integrity: DeclaredIntegrity;
  readonly metadata: ProjectMetadataDTO;
}
/** P02 PORT ONLY, no implementation, auth guard, durable receipt or atomicity claim.
 * Future P03/P04 adapters must:
 * - derive context from existing server auth; scope EVERY read/write/history/retry by principal;
 * - reject unadmitted network input (D05); shape inspection is not admission;
 * - allocate all new IDs/revisions server-side; never overwrite immutable history;
 * - atomically compare expectedRevision with current same-project head and commit revision,
 *   audit, head and receipt, or return conflict without writes (no last-write-wins);
 * - check authorization first on retries, then compare a versioned request fingerprint;
 *   create keys are scoped by account/operation (there is no project ID in a create DTO);
 *   other write keys are scoped by account/project/operation. Same key and same request
 *   returns the original receipt even when head advanced; different request with the same
 *   scoped key returns IDEMPOTENCY_KEY_REUSED;
 * - restore by NEW revision, parent=current head, restoredFrom=authorized historical revision;
 * - soft-delete by a new revision/tombstone, never purge history.
 * Fingerprint format, storage, quotas, retention and enforcement require open decisions/P03 tests.
 */
export interface ProjectRepositoryPort {
  create(context: RepositoryContext, request: CreateProjectRequest): Promise<ProjectMutationResult>;
  read(context: RepositoryContext, request: ReadProjectRequest): Promise<ProjectReadResult>;
  list(context: RepositoryContext, request: ListProjectsRequest): Promise<ProjectListResult>;
  updateMetadata(context: RepositoryContext, request: UpdateProjectRequest): Promise<ProjectMutationResult>;
  history(context: RepositoryContext, request: ListProjectRevisionsRequest): Promise<ProjectHistoryResult>;
  revision(context: RepositoryContext, request: ReadProjectRevisionRequest): Promise<ProjectRevisionResult>;
  createRevision(context: RepositoryContext, request: CreateProjectRevisionRequest): Promise<ProjectMutationResult>;
  restore(context: RepositoryContext, request: RestoreProjectRequest): Promise<ProjectMutationResult>;
  softDelete(context: RepositoryContext, request: SoftDeleteProjectRequest): Promise<ProjectMutationResult>;
}
