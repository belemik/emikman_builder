import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { TextDecoder } from 'node:util';
import { text, type BRow } from './b-test-ledger';
import type { WebPageDocumentHead } from '../../src/projects/web-page-repository.dto';
import type { createServerIdIssuer } from './server-identities';
import { SAVE_WEB_PAGE } from '../../src/projects/web-page-repository.dto';
import { WEB_PAGE_VERSION } from '../../src/web-page/contract';
import { validateWebPage } from '../../src/web-page/validate';

export const WEB_PAGE_STORE_PROFILE = 'zarya.p04.b.store.web-page.test/v2';
export const sha256 = (input: Uint8Array) => createHash('sha256').update(input).digest('hex');
export const WEB_PAGE_CONTEXT = Object.freeze({
  contract: WEB_PAGE_VERSION,
  validator: '1cce01b54039c0b45b6dfb88851e414f08845a3c6df430b9c3f2ade9bb2fde9a',
  renderer: '85b0463856011feb0e74a4a419e707352a4fddb9d3d17f3956cdee35894d155e',
  assetCatalog: '7331bd98845507da5c83436a8204c48794b26e68de9c12f82a4fec0f58ddd809',
});

export function verifyWebPageContext(): void {
  const files = [
    ['../../src/web-page/contract.ts', '4c165c951a743333aece89df9b99323f0430135561ee21fc5997d63bd80046a2'],
    ['../../src/web-page/validate.ts', WEB_PAGE_CONTEXT.validator],
    ['../../src/readonly/json-preflight-keys.ts', 'd95d1f11ecb4d458350e1ef49ac8d626b9abdfa4456ccc810bed09a85206891b'],
    ['../../src/readonly/json-preflight-grammar.ts', '2751320f3d4e24af5a83c302cc3c290f6fd98c4d5200d2c6df09637de55857e3'],
    ['../../src/readonly/json-preflight-limits.ts', '6ae833020db60c989fe67f5c319158509fa4bafc7a900099161755c764f2930a'],
    ['../../public/icons/globe-01.svg', WEB_PAGE_CONTEXT.assetCatalog],
  ];
  for (const [path, digest] of files) {
    if (sha256(readFileSync(new URL(path, import.meta.url))) !== digest) throw Error('B_WEB_PAGE_CONTEXT');
  }
}

export function isWebPageStore(version: unknown, profile: unknown): boolean {
  return version === 2 && profile === WEB_PAGE_STORE_PROFILE;
}

export function webPageSchema(v1: string): string {
  const operationCheck = "operation IN('create-project','update-metadata','create-revision','restore-project','soft-delete-project')";
  if (!v1.includes(operationCheck)) throw Error('B_WEB_SCHEMA_BASE');
  return v1.replaceAll('zarya.p04.b.store.test/v1', WEB_PAGE_STORE_PROFILE)
    .replace(operationCheck, operationCheck.slice(0, -1) + ",'" + SAVE_WEB_PAGE + "')")
    + readFileSync(new URL('./b-test-web-page-schema.sql', import.meta.url), 'utf8');
}

export class BTestWebPageRecords {
  constructor(private readonly db: DatabaseSync) {}


  private descriptor(row: BRow): WebPageDocumentHead {
    const fields = {
      contract: text(row, 'contract'), validator: text(row, 'validator'),
      renderer: text(row, 'renderer'), assetCatalog: text(row, 'asset_catalog'),
    };
    if (fields.contract !== WEB_PAGE_CONTEXT.contract || fields.validator !== WEB_PAGE_CONTEXT.validator
      || fields.renderer !== WEB_PAGE_CONTEXT.renderer || fields.assetCatalog !== WEB_PAGE_CONTEXT.assetCatalog) {
      throw Error('B_WEB_PAGE_PIN');
    }
    return {
      workId: text(row, 'work_id'), documentId: text(row, 'document_id'), revisionId: text(row, 'id'),
      sha256: text(row, 'sha256'), ...WEB_PAGE_CONTEXT,
    };
  }

  private verifyPayload(row: BRow): Uint8Array {
    const payload = row.payload;
    if (!(payload instanceof Uint8Array) || sha256(payload) !== row.sha256
      || !validateWebPage(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(payload)).valid) {
      throw Error('B_WEB_PAGE_PAYLOAD');
    }
    return payload;
  }

  heads(account: string, project: string, snapshot: string): WebPageDocumentHead[] {
    return this.db.prepare(`SELECT r.document_id,r.id,r.sha256,r.contract,r.validator,r.renderer,r.asset_catalog,d.work_id
      FROM web_snapshot_heads h
      JOIN web_revisions r ON r.id=h.document_revision_id
      JOIN web_documents d ON d.id=h.document_id
      WHERE h.account=? AND h.project_id=? AND h.project_revision_id=? ORDER BY h.document_id`)
      .all(account, project, snapshot).map(row => this.descriptor(row));
  }

  read(account: string, project: string, snapshot: string, documentId: string) {
    const row = this.db.prepare(`SELECT r.*,d.work_id FROM web_snapshot_heads h
      JOIN web_revisions r ON r.id=h.document_revision_id
      JOIN web_documents d ON d.id=h.document_id
      WHERE h.account=? AND h.project_id=? AND h.project_revision_id=? AND h.document_id=?`)
      .get(account, project, snapshot, documentId);
    return row ? { ...this.descriptor(row), payload: this.verifyPayload(row) } : null;
  }

  receiptHead(account: string, project: string, snapshot: string): WebPageDocumentHead {
    const row = this.db.prepare(`SELECT r.*,d.work_id FROM web_revisions r
      JOIN web_documents d ON d.id=r.document_id
      JOIN web_snapshot_heads h ON h.project_revision_id=r.project_revision_id AND h.document_revision_id=r.id
      WHERE r.account=? AND r.project_id=? AND r.project_revision_id=?`).get(account, project, snapshot);
    if (!row) throw Error('B_WEB_PAGE_RECEIPT');
    this.verifyPayload(row);
    return this.descriptor(row);
  }

  append(account: string, project: string, snapshot: string, documentId: string | null, payload: Uint8Array,
    heads: readonly WebPageDocumentHead[], ids: ReturnType<typeof createServerIdIssuer>): WebPageDocumentHead {
    const previous = heads.find(head => head.documentId === documentId);
    if (documentId !== null && !previous) throw Error('B_WEB_PAGE_DOCUMENT_SCOPE');
    const head = {
      workId: previous?.workId ?? ids.next('work'), documentId: previous?.documentId ?? ids.next('document'),
      revisionId: ids.next('document-revision'), sha256: sha256(payload), ...WEB_PAGE_CONTEXT,
    };
    if (!previous) this.db.prepare('INSERT INTO web_documents VALUES(?,?,?,?)')
      .run(account, project, head.documentId, head.workId);
    this.db.prepare('INSERT INTO web_revisions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(
      account, project, head.documentId, head.revisionId, previous?.revisionId ?? null, snapshot,
      payload, head.sha256, head.contract, head.validator, head.renderer, head.assetCatalog);
    return head;
  }

  saveHeads(account: string, project: string, snapshot: string, heads: readonly WebPageDocumentHead[]): void {
    const insert = this.db.prepare('INSERT INTO web_snapshot_heads VALUES(?,?,?,?,?)');
    for (const head of heads) insert.run(account, project, snapshot, head.documentId, head.revisionId);
  }

  verify(): void {
    for (const row of this.db.prepare(`SELECT d.work_id,r.*,s.operation,s.parent_id AS previous_snapshot,
        h.document_revision_id AS included
      FROM web_revisions r
      JOIN web_documents d ON d.id=r.document_id
      JOIN revisions s ON s.id=r.project_revision_id
      LEFT JOIN web_snapshot_heads h ON h.project_revision_id=s.id AND h.document_id=r.document_id`).all()) {
      this.descriptor(row);
      this.verifyPayload(row);
      if (row.operation !== SAVE_WEB_PAGE || row.id !== row.included || row.previous_snapshot === null) {
        throw Error('B_WEB_PAGE_LINEAGE');
      }
      const prior = this.db.prepare(`SELECT document_revision_id FROM web_snapshot_heads
        WHERE project_revision_id=? AND document_id=?`).get(text(row, 'previous_snapshot'), text(row, 'document_id'));
      if (row.parent_id !== (prior?.document_revision_id ?? null)) throw Error('B_WEB_PAGE_LINEAGE');
    }
    if (this.db.prepare(`SELECT 1 FROM web_documents d
      WHERE NOT EXISTS(SELECT 1 FROM web_revisions r WHERE r.document_id=d.id)`).get()) {
      throw Error('B_WEB_PAGE_ORPHAN');
    }
  }
}
