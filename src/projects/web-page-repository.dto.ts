import type { ProjectRevisionReferenceDTO, WriteGuardDTO } from './repository.dto';

export const WEB_PAGE_COMMAND_VERSION = 'zarya.p04.web-page.command.test/v1';
export const WEB_PAGE_MANIFEST_PROFILE = 'zarya.p04.project-manifest.web-page.test.jcs/v2';
export const WEB_PAGE_WORKSPACE_COMMAND_VERSION = 'zarya.p04.web-page.workspace.command.test/v1';
export const CREATE_WEB_PAGE_PROJECT = 'create-web-page-project-v1';
export const LIST_WEB_PAGE_DOCUMENTS = 'list-web-page-documents-v1';
export const WEB_PAGE_DOCUMENT_LIMIT = 32;
export const SAVE_WEB_PAGE = 'save-web-page-v1';
export const READ_WEB_PAGE = 'read-web-page-v1';

export interface WebPageSaveRequestV1 extends WriteGuardDTO {
  readonly dtoVersion: typeof WEB_PAGE_COMMAND_VERSION;
  readonly projectId: string;
  /** Null creates a document and its work. Existing identifiers are always server issued. */
  readonly documentId: string | null;
  /** Exact JSON text. Its UTF-8 bytes are validated and preserved without reserialization. */
  readonly payload: string;
}

export interface WebPageReadRequestV1 {
  readonly dtoVersion: typeof WEB_PAGE_COMMAND_VERSION;
  readonly projectId: string;
  readonly documentId: string;
  readonly revision: ProjectRevisionReferenceDTO;
}

export interface WebPageProjectCreateRequestV1 {
  readonly dtoVersion: typeof WEB_PAGE_WORKSPACE_COMMAND_VERSION;
  readonly idempotencyKey: string;
  readonly payload: string;
}

export interface WebPageDocumentListRequestV1 {
  readonly dtoVersion: typeof WEB_PAGE_WORKSPACE_COMMAND_VERSION;
}

export type WebPageDocumentSummary = {
  readonly title: string;
  readonly revision: ProjectRevisionReferenceDTO;
  readonly documentId: string;
  readonly revisionId: string;
  readonly sha256: string;
};

export type WebPageWorkspaceOperation = typeof CREATE_WEB_PAGE_PROJECT | typeof LIST_WEB_PAGE_DOCUMENTS;
export type WebPageOperation = typeof SAVE_WEB_PAGE | typeof READ_WEB_PAGE | WebPageWorkspaceOperation;

export function isWebPageWorkspaceOperation(op: unknown): op is WebPageWorkspaceOperation {
  return op === CREATE_WEB_PAGE_PROJECT || op === LIST_WEB_PAGE_DOCUMENTS;
}

export function isWebPageOperation(op: unknown): op is WebPageOperation {
  return op === SAVE_WEB_PAGE || op === READ_WEB_PAGE || isWebPageWorkspaceOperation(op);
}

export function webPageCommandVersion(op: WebPageOperation) {
  return isWebPageWorkspaceOperation(op) ? WEB_PAGE_WORKSPACE_COMMAND_VERSION : WEB_PAGE_COMMAND_VERSION;
}

export type WebPageDocumentHead = {
  readonly workId: string;
  readonly documentId: string;
  readonly revisionId: string;
  readonly sha256: string;
  readonly contract: '0.1';
  readonly validator: string;
  readonly renderer: string;
  readonly assetCatalog: string;
};
