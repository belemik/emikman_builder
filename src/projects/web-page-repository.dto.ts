import type { ProjectRevisionReferenceDTO, WriteGuardDTO } from './repository.dto';

export const WEB_PAGE_COMMAND_VERSION = 'zarya.p04.web-page.command.test/v1';
export const WEB_PAGE_MANIFEST_PROFILE = 'zarya.p04.project-manifest.web-page.test.jcs/v2';
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

export type WebPageOperation = typeof SAVE_WEB_PAGE | typeof READ_WEB_PAGE;

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
