import { hasEntityIdShape } from '../../src/projects/compatibility';
import type { ProjectRevisionReferenceDTO } from '../../src/projects/repository.dto';
import {
  CREATE_WEB_PAGE_PROJECT, LIST_WEB_PAGE_DOCUMENTS, READ_WEB_PAGE, SAVE_WEB_PAGE, WEB_PAGE_COMMAND_VERSION,
  WEB_PAGE_DOCUMENT_LIMIT, WEB_PAGE_MANIFEST_PROFILE, WEB_PAGE_WORKSPACE_COMMAND_VERSION, type WebPageDocumentSummary,
} from '../../src/projects/web-page-repository.dto';
import { WEB_PAGE_WORKSPACE_HTTP_PATH, WEB_PAGE_WORKSPACE_HTTP_SCOPE, webDecoder, type CWebOperation } from '../../server/projects/c-test-web-page-policy';
import { PROJECT_INGEST_TEST_PROFILE } from '../../server/projects/ingest-profile';
import { WEB_PAGE_MAX_BYTES, validateWebPage } from '../../src/web-page/validate';

export type Locator = { readonly revision: ProjectRevisionReferenceDTO; readonly documentId: string };
export type PinnedContext = { readonly contract: '0.1'; readonly validator: string; readonly renderer: string; readonly assetCatalog: string };
export type Confirmed = Locator & { readonly revisionId: string; readonly sha256: string; readonly context: PinnedContext };
export type Command = Readonly<{ op: CWebOperation; bytes: string }>;
export type BrowserSession = Readonly<{ handle: string; accountTag: string }>;

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const hex = (value: unknown): value is string => typeof value === 'string' && value.length === 64 && /^[0-9a-f]+$/.test(value);

function reference(value: unknown): ProjectRevisionReferenceDTO | null {
  const ref = record(value), hash = record(ref?.integrity);
  if (!ref || !hash || ref.kind !== 'project' || typeof ref.id !== 'string' || !hasEntityIdShape(ref.id, 'project-revision')
    || typeof ref.projectId !== 'string' || !hasEntityIdShape(ref.projectId, 'project')
    || hash.algorithm !== 'sha256' || hash.encoding !== 'hex-lower' || !hex(hash.value)
    || (hash.byteDomain !== 'zarya.project-manifest.jcs/v1' && hash.byteDomain !== WEB_PAGE_MANIFEST_PROFILE)) return null;
  return { kind: ref.kind, id: ref.id, projectId: ref.projectId,
    integrity: { algorithm: hash.algorithm, encoding: hash.encoding, value: hash.value, byteDomain: hash.byteDomain } };
}

export async function claimSession(code: string): Promise<BrowserSession> {
  const response = await fetch(WEB_PAGE_WORKSPACE_HTTP_PATH + '/session/claim', {
    method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: code,
    credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw Error('C_CLAIM');
  const result = record(await response.json());
  if (result?.scope !== WEB_PAGE_WORKSPACE_HTTP_SCOPE || typeof result.handle !== 'string'
    || !/^zb_[0-9a-f]{32}$/.test(result.handle) || !hex(result.accountTag)) throw Error('C_CLAIM_RESPONSE');
  return { handle: result.handle, accountTag: result.accountTag };
}

export function sameContext(a: PinnedContext, b: PinnedContext): boolean {
  return a.contract === b.contract && a.validator === b.validator && a.renderer === b.renderer && a.assetCatalog === b.assetCatalog;
}

export async function dispatch(token: string, command: Command, status = false): Promise<Record<string, unknown>> {
  const mode = status ? 'status' : 'commands';
  const response = await fetch(WEB_PAGE_WORKSPACE_HTTP_PATH + '/' + mode + '/' + command.op, {
    method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(6000),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token,
      'x-test-decoder-profile': webDecoder(command.op) ?? PROJECT_INGEST_TEST_PROFILE.id },
    body: command.bytes,
  });
  const envelope = record(await response.json());
  if (envelope?.scope !== WEB_PAGE_WORKSPACE_HTTP_SCOPE) throw Error('C_SCOPE');
  const result = record(envelope.result);
  if (result && (response.ok || response.status === 409 || response.status === 422)) return result;
  if (response.status === 400 && envelope.error === 'C_COMMAND') return { kind: 'invalid' };
  if (response.status === 401 && envelope.error === 'C_SESSION') {
    return { kind: 'session-expired', notAdmitted: !status && envelope.outcome === 'NOT_ADMITTED' };
  }
  if (!status && response.status === 503 && envelope.outcome === 'NOT_ADMITTED'
    && (envelope.error === 'C_CAPACITY' || envelope.error === 'C_QUEUE')) return { kind: 'not-admitted' };
  if ((response.status === 401 || response.status === 403) && (command.op === READ_WEB_PAGE || command.op === LIST_WEB_PAGE_DOCUMENTS)) return { kind: 'denied' };
  throw Error('C_RESULT_UNCONFIRMED');
}

export function createProject(payload: string): Command {
  return { op: CREATE_WEB_PAGE_PROJECT, bytes: JSON.stringify({
    dtoVersion: WEB_PAGE_WORKSPACE_COMMAND_VERSION, idempotencyKey: crypto.randomUUID(), payload,
  }) };
}

export async function listDocuments(token: string) {
  const result = await dispatch(token, {
    op: LIST_WEB_PAGE_DOCUMENTS, bytes: JSON.stringify({ dtoVersion: WEB_PAGE_WORKSPACE_COMMAND_VERSION }),
  });
  if (result.kind === 'session-expired') throw Error('C_WEB_SESSION');
  if (result.kind !== 'web-page-list' || !Array.isArray(result.documents)
    || result.documents.length > WEB_PAGE_DOCUMENT_LIMIT || typeof result.truncated !== 'boolean') throw Error('C_WEB_LIST');
  const documents: WebPageDocumentSummary[] = result.documents.map(value => {
    const entry = record(value);
    const revision = reference(entry?.revision);
    if (!entry || !revision || revision.integrity.byteDomain !== WEB_PAGE_MANIFEST_PROFILE
      || typeof entry.title !== 'string' || entry.title.length > 200
      || typeof entry.documentId !== 'string' || !hasEntityIdShape(entry.documentId, 'document')
      || typeof entry.revisionId !== 'string' || !hasEntityIdShape(entry.revisionId, 'document-revision')
      || !hex(entry.sha256)) throw Error('C_WEB_LIST_ITEM');
    return { title: entry.title, revision, documentId: entry.documentId, revisionId: entry.revisionId, sha256: entry.sha256 };
  });
  return { documents, truncated: result.truncated };
}

export function savePage(revision: ProjectRevisionReferenceDTO, documentId: string | null, payload: string): Command {
  return { op: SAVE_WEB_PAGE, bytes: JSON.stringify({
    dtoVersion: WEB_PAGE_COMMAND_VERSION, projectId: revision.projectId, expectedRevision: revision,
    documentId, payload, idempotencyKey: crypto.randomUUID(),
  }) };
}

export function readPage(locator: Locator): Command {
  return { op: READ_WEB_PAGE, bytes: JSON.stringify({
    dtoVersion: WEB_PAGE_COMMAND_VERSION, projectId: locator.revision.projectId,
    revision: locator.revision, documentId: locator.documentId,
  }) };
}

export function confirmedPage(revision: ProjectRevisionReferenceDTO, value: unknown): Confirmed {
  const doc = record(value);
  if (revision.integrity.byteDomain !== WEB_PAGE_MANIFEST_PROFILE || !doc
    || typeof doc.documentId !== 'string' || !hasEntityIdShape(doc.documentId, 'document')
    || typeof doc.revisionId !== 'string' || !hasEntityIdShape(doc.revisionId, 'document-revision')
    || !hex(doc.sha256) || doc.contract !== '0.1' || !hex(doc.validator) || !hex(doc.renderer) || !hex(doc.assetCatalog)) {
    throw Error('C_WEB_RECEIPT');
  }
  return { revision, documentId: doc.documentId, revisionId: doc.revisionId, sha256: doc.sha256,
    context: { contract: doc.contract, validator: doc.validator, renderer: doc.renderer, assetCatalog: doc.assetCatalog } };
}

export async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function confirmSave(result: Record<string, unknown>, command: Command) {
  const request = record(JSON.parse(command.bytes));
  const receipt = record(result.receipt);
  const revision = reference(receipt?.revision);
  const create = command.op === CREATE_WEB_PAGE_PROJECT;
  if (result.kind !== 'committed' || receipt?.operation !== (create ? CREATE_WEB_PAGE_PROJECT : SAVE_WEB_PAGE)
    || !revision || !request || receipt.projectId !== revision.projectId
    || receipt.idempotencyKey !== request.idempotencyKey || typeof request.payload !== 'string'
    || (create ? receipt.parentRevisionId !== null
      : revision.projectId !== request.projectId || receipt.parentRevisionId !== record(request.expectedRevision)?.id)) {
    throw Error('C_WEB_RECEIPT');
  }
  const confirmed = confirmedPage(revision, receipt.document);
  if ((!create && confirmed.documentId !== request.documentId)
    || confirmed.sha256 !== await digest(new TextEncoder().encode(request.payload))) throw Error('C_WEB_DIGEST');
  return confirmed;
}

export function parseLocator(text: string): Locator | null {
  if (text.length > 1024) return null;
  try {
    const value = record(JSON.parse(text));
    const revision = reference(value?.revision);
    if (!value || !revision || revision.integrity.byteDomain !== WEB_PAGE_MANIFEST_PROFILE
      || typeof value.documentId !== 'string' || !hasEntityIdShape(value.documentId, 'document')) return null;
    return { revision, documentId: value.documentId };
  } catch { return null; }
}

export async function openPage(result: Record<string, unknown>, locator: Locator) {
  const revision = reference(result.projectRevision);
  const document = record(result.document);
  if (result.kind !== 'web-page' || !revision || JSON.stringify(revision) !== JSON.stringify(locator.revision)
    || document?.documentId !== locator.documentId || typeof document.payload !== 'string'
    || document.payload.length > Math.ceil(WEB_PAGE_MAX_BYTES / 3) * 4) throw Error('C_WEB_READ');
  const confirmed = confirmedPage(revision, document);
  const bytes = Uint8Array.from(atob(document.payload), ch => ch.charCodeAt(0));
  if (bytes.length > WEB_PAGE_MAX_BYTES || confirmed.sha256 !== await digest(bytes)) throw Error('C_WEB_DIGEST');
  const validated = validateWebPage(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
  if (!validated.valid) throw Error('C_WEB_VALIDATION');
  return { confirmed, page: validated.value };
}
