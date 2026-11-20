import type { ScreenSchema } from '../design-system/schema';
import type { RepositoryContext } from './repository.port';

export const DOCUMENT_SNAPSHOT_VERSION = '0.1' as const;

export interface CreateInitialDocument {
  readonly version: typeof DOCUMENT_SNAPSHOT_VERSION;
  readonly name: string;
  readonly type: 'web-application';
}

export interface InitialDocumentSnapshot {
  readonly version: typeof DOCUMENT_SNAPSHOT_VERSION;
  readonly project: Readonly<{
    id: string;
    name: string;
    type: 'web-application';
    status: 'active';
    createdAt: string;
  }>;
  readonly work: Readonly<{ id: string; projectId: string }>;
  readonly document: Readonly<{
    id: string;
    projectId: string;
    workId: string;
    format: 'format:wdeaf-screen-v3';
    headRevisionId: string;
  }>;
  readonly revision: Readonly<{
    id: string;
    documentId: string;
    parentId: null;
    sequence: 1;
    createdAt: string;
    screenDigest: string;
    screen: ScreenSchema;
  }>;
}

type Failure<K extends string> = { readonly kind: K };
export type CreateInitialResult = { readonly kind: 'created'; readonly snapshot: InitialDocumentSnapshot }
  | Failure<'invalid' | 'denied' | 'project-exists' | 'unavailable'>;
export type ReadInitialResult = { readonly kind: 'found'; readonly snapshot: InitialDocumentSnapshot }
  | Failure<'invalid' | 'denied' | 'not-found' | 'unavailable'>;

/** Local P2.2a types. Context is admitted by a runtime fixture authority. */
export interface InitialDocumentRepository {
  create(context: RepositoryContext, request: CreateInitialDocument): CreateInitialResult;
  read(context: RepositoryContext, projectId: string): ReadInitialResult;
}
