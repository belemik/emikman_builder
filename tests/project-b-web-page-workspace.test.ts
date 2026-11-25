import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import test, { type TestContext } from 'node:test';
import { environment } from './fixtures/b-test-support';
import type { BFault, BResult } from '../server/projects/b-test-repository';
import { createWebPageRepositoryCandidate } from '../server/projects/test-command-candidate';
import {
  CREATE_WEB_PAGE_PROJECT, LIST_WEB_PAGE_DOCUMENTS, SAVE_WEB_PAGE, WEB_PAGE_COMMAND_VERSION,
  WEB_PAGE_DOCUMENT_LIMIT, WEB_PAGE_WORKSPACE_COMMAND_VERSION,
} from '../src/projects/web-page-repository.dto';

const event = readFileSync(new URL('./fixtures/web-page/event.valid.json', import.meta.url), 'utf8');
const create = (key: string) => command(CREATE_WEB_PAGE_PROJECT, {
  dtoVersion: WEB_PAGE_WORKSPACE_COMMAND_VERSION, idempotencyKey: key, payload: event,
});
const list = () => command(LIST_WEB_PAGE_DOCUMENTS, { dtoVersion: WEB_PAGE_WORKSPACE_COMMAND_VERSION });

function command(op: string, body: object) {
  const c = createWebPageRepositoryCandidate(op, Buffer.from(JSON.stringify(body)));
  assert.equal(c.kind, 'candidate');
  return c.candidate;
}

function receipt(result: BResult) {
  assert.equal(result.kind, 'committed');
  assert.ok(result.receipt.operation === CREATE_WEB_PAGE_PROJECT || result.receipt.operation === SAVE_WEB_PAGE);
  return result.receipt;
}

function fixture(t: TestContext, fault?: (stage: BFault) => void, mode: true | 'workspace-v1' = 'workspace-v1') {
  const e = environment({ webPageProfile: mode, fault });
  const paths = { main: e.main.directory, ledger: e.volume.directory };
  let closed = false;
  const close = () => { if (!closed) { closed = true; e.close(); } };
  t.after(() => {
    close();
    rmSync(paths.main, { recursive: true });
    rmSync(paths.ledger, { recursive: true });
  });
  return { ...e, paths, close };
}

function counts(repo: ReturnType<typeof environment>['repo']) {
  return ['projects','revisions','web_documents','web_revisions','web_snapshot_heads','receipts','operation_status','audit']
    .map(table => repo.database.prepare('SELECT count(*) n FROM ' + table).get()?.n);
}

for (const stage of ['after-web-project', 'after-web-page-payload', 'after-revision', 'after-head',
  'after-receipt', 'after-status', 'after-audit', 'before-commit'] as const) {
  test('Atomic WebPage create fully rolls back at ' + stage, t => {
    let hit = false;
    const e = fixture(t, point => { if (point === stage) { hit = true; throw Error('TEST_INTERRUPT'); } });
    const c = create('atomic-rollback');
    assert.equal(e.repo.execute(e.principal, c).kind, 'unknown-outcome');
    assert.equal(hit, true);
    assert.deepEqual(counts(e.repo), Array(8).fill(0));
    e.close();
    const reopened = environment({ ...e.paths, webPageProfile: 'workspace-v1' });
    try {
      assert.equal(reopened.ledger.meta().mode, 'FENCED');
      assert.equal(reopened.repo.reconcile(reopened.principal, c).kind, 'unknown-outcome');
      assert.deepEqual(counts(reopened.repo), Array(8).fill(0));
    } finally { reopened.close(); }
  });
}

test('Atomic WebPage create after SQL commit recovers the single account-scoped genesis receipt after reopening', t => {
  const e = fixture(t, stage => { if (stage === 'after-main-commit') throw Error('TEST_LOST'); });
  const c = create('lost-create');
  assert.equal(e.repo.execute(e.principal, c).kind, 'unknown-outcome');
  assert.deepEqual(counts(e.repo), Array(8).fill(1));
  e.close();
  const reopened = environment({ ...e.paths, webPageProfile: 'workspace-v1' });
  try {
    assert.equal(reopened.repo.reconcile(reopened.other, c).kind, 'unknown-outcome');
    const saved = receipt(reopened.repo.reconcile(reopened.principal, c));
    assert.deepEqual(receipt(reopened.repo.execute(reopened.principal, c)), saved);
    assert.equal(saved.replayed, true);
    assert.equal(saved.parentRevisionId, null);
    assert.equal(reopened.repo.database.prepare('SELECT sequence FROM revisions WHERE id=?').get(saved.revision.id)?.sequence, 1);
    const document = reopened.repo.database.prepare('SELECT parent_id FROM web_revisions WHERE id=?').get(saved.document.revisionId);
    assert.equal(document?.parent_id, null);
    assert.deepEqual(counts(reopened.repo), Array(8).fill(1));
  } finally { reopened.close(); }
});

test('Workspace discovery is capped and remains owner-scoped across multiple confirmed heads', t => {
  const e = fixture(t);
  let r = receipt(e.repo.execute(e.principal, create('first')));
  for (let index = 0; index < WEB_PAGE_DOCUMENT_LIMIT; index++) {
    r = receipt(e.repo.execute(e.principal, command(SAVE_WEB_PAGE, {
      dtoVersion: WEB_PAGE_COMMAND_VERSION, projectId: r.projectId, documentId: null,
      payload: event, idempotencyKey: 'document-' + index, expectedRevision: r.revision,
    })));
  }
  const b = receipt(e.repo.execute(e.other, create('foreign')));
  const visible = e.repo.execute(e.principal, list());
  assert.equal(visible.kind, 'web-page-list');
  assert.equal(visible.truncated, true);
  assert.equal(visible.documents.length, WEB_PAGE_DOCUMENT_LIMIT);
  assert.ok(visible.documents.every(doc => doc.revision.id === r.revision.id && doc.documentId !== b.document.documentId));
  const denied = e.repo.execute(e.other, list());
  assert.equal(denied.kind, 'web-page-list');
  assert.deepEqual(denied.documents.map(doc => doc.documentId), [b.document.documentId]);
});

test('The existing v2 profile refuses synthetic workspace commands and retains its schema', t => {
  const e = fixture(t, undefined, true);
  assert.equal(e.repo.execute(e.principal, create('unavailable')).kind, 'invalid');
  assert.equal(e.repo.execute(e.principal, list()).kind, 'invalid');
  assert.equal(e.repo.database.prepare('PRAGMA user_version').get()?.user_version, 2);
  assert.deepEqual(counts(e.repo), Array(8).fill(0));
});
