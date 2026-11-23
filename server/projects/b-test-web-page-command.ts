import { hasEntityIdShape } from '../../src/projects/compatibility';
import type { RequestJson } from '../../src/projects/repository.dto';
import {
  CREATE_WEB_PAGE_PROJECT, LIST_WEB_PAGE_DOCUMENTS, READ_WEB_PAGE, SAVE_WEB_PAGE, WEB_PAGE_COMMAND_VERSION,
  WEB_PAGE_WORKSPACE_COMMAND_VERSION, WEB_PAGE_MANIFEST_PROFILE,
} from '../../src/projects/web-page-repository.dto';
import { validateWebPage } from '../../src/web-page/validate';

function record(value: unknown, fields: readonly string[]): value is Record<string, RequestJson> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
}

/** Inspects only the decoder's owned data tree. The decoded payload is never reserialized. */
export function isWebPageCommand(operation: string, data: RequestJson): boolean {
  if (operation === CREATE_WEB_PAGE_PROJECT) {
    return record(data, ['dtoVersion', 'payload', 'idempotencyKey']) &&
      data.dtoVersion === WEB_PAGE_WORKSPACE_COMMAND_VERSION && validateWebPage(data.payload).valid;
  }
  if (operation === LIST_WEB_PAGE_DOCUMENTS) {
    return record(data, ['dtoVersion']) && data.dtoVersion === WEB_PAGE_WORKSPACE_COMMAND_VERSION;
  }
  const writing = operation === SAVE_WEB_PAGE;
  if (!writing && operation !== READ_WEB_PAGE) return false;
  const fields = writing ? ['expectedRevision', 'idempotencyKey', 'payload'] : ['revision'];
  if (!record(data, ['dtoVersion', 'projectId', 'documentId', ...fields])
    || data.dtoVersion !== WEB_PAGE_COMMAND_VERSION
    || typeof data.projectId !== 'string' || !hasEntityIdShape(data.projectId, 'project')) return false;
  if (!(writing && data.documentId === null)
    && (typeof data.documentId !== 'string' || !hasEntityIdShape(data.documentId, 'document'))) return false;

  const ref = writing ? data.expectedRevision : data.revision;
  if (!record(ref, ['kind', 'id', 'projectId', 'integrity']) || ref.kind !== 'project'
    || ref.projectId !== data.projectId || typeof ref.id !== 'string' || !hasEntityIdShape(ref.id, 'project-revision')) return false;
  const digest = ref.integrity;
  if (!record(digest, ['algorithm', 'encoding', 'byteDomain', 'value'])
    || digest.algorithm !== 'sha256' || digest.encoding !== 'hex-lower'
    || (digest.byteDomain !== WEB_PAGE_MANIFEST_PROFILE && digest.byteDomain !== 'zarya.project-manifest.jcs/v1')
    || typeof digest.value !== 'string' || digest.value.length !== 64 || !/^[0-9a-f]{64}$/.test(digest.value)) return false;
  return !writing || validateWebPage(data.payload).valid;
}
