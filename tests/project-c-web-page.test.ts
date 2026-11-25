import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { request as httpRequest } from 'node:http';
import { startCTestHttp, type CTestOptions } from '../server/projects/c-test-http';
import { CTestSessions } from '../server/projects/c-test-sessions';
import { PROJECT_INGEST_TEST_PROFILE } from '../server/projects/ingest-profile';
import { WEB_PAGE_HTTP_PATH, WEB_PAGE_WORKSPACE_HTTP_PATH, WEB_PAGE_WORKSPACE_OUTPUT_BYTES } from '../server/projects/c-test-web-page-policy';
import {
  CREATE_WEB_PAGE_PROJECT, LIST_WEB_PAGE_DOCUMENTS, READ_WEB_PAGE, SAVE_WEB_PAGE,
  WEB_PAGE_COMMAND_VERSION, WEB_PAGE_WORKSPACE_COMMAND_VERSION,
} from '../src/projects/web-page-repository.dto';
import { createRequest } from './fixtures/p03-support';

const event = readFileSync(new URL('./fixtures/web-page/event.valid.json', import.meta.url), 'utf8');
async function useHarness(t: import('node:test').TestContext, options?: CTestOptions, workspace = false) {
  const sessions = new CTestSessions();
  const owner = sessions.issue('a'.repeat(32));
  const other = sessions.issue('b'.repeat(32));
  const h = await startCTestHttp({ ...options, webPageProfile: workspace ? { workspace: true } : {}, sessions });
  t.after(async () => {
    await h.close();
    for (const volume of [h.main, h.volume]) rmSync(volume.directory, { recursive: true });
  });
  const request = (operation: string, body: unknown, params: {
    token?: string; path?: string; mode?: 'commands' | 'status'; headers?: Record<string, string>;
  } = {}) => fetch(h.url + (params.path ?? (workspace ? WEB_PAGE_WORKSPACE_HTTP_PATH : WEB_PAGE_HTTP_PATH) + '/' + (params.mode ?? 'commands') + '/' + operation), {
    method: 'POST', headers: { Origin: h.url, Authorization: 'Bearer ' + (params.token ?? owner),
      'Content-Type': 'application/json', 'x-test-decoder-profile': operation === 'create-project'
        ? PROJECT_INGEST_TEST_PROFILE.id : operation === CREATE_WEB_PAGE_PROJECT || operation === LIST_WEB_PAGE_DOCUMENTS
          ? WEB_PAGE_WORKSPACE_COMMAND_VERSION : WEB_PAGE_COMMAND_VERSION, ...params.headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { h, sessions, request, owner, other };
}

function counts(h: Awaited<ReturnType<typeof startCTestHttp>>) {
  return ['projects', 'revisions', 'web_documents', 'web_revisions', 'web_snapshot_heads', 'receipts', 'audit']
    .map(table => h.repository.database.prepare('SELECT count(*) n FROM ' + table).get()?.n);
}

async function create(request: Awaited<ReturnType<typeof useHarness>>['request']) {
  const response = await request('create-project', createRequest());
  assert.equal(response.status, 200);
  return (await response.json()).result.receipt;
}

function command(project: Awaited<ReturnType<typeof create>>, payload = event, documentId: string | null = null) {
  return { dtoVersion: WEB_PAGE_COMMAND_VERSION, projectId: project.projectId, expectedRevision: project.revision,
    documentId, payload, idempotencyKey: 'web-test' };
}

test('C WebPage rejects untrusted Origin, proxy headers, old wire, invalid command, and missing synthetic session', async t => {
  const { h, request } = await useHarness(t);
  const body = createRequest();
  const wrongHost = await new Promise<number | undefined>((resolve, reject) => {
    const req = httpRequest(h.url + WEB_PAGE_HTTP_PATH + '/commands/create-project', {
      method: 'POST', headers: { Host: 'invalid.local', Origin: h.url },
    }, response => { response.resume(); resolve(response.statusCode); });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
  assert.equal(wrongHost, 403);
  const attempts = [
    await request('create-project', body, { headers: { Origin: 'https://external.invalid' } }),
    await request('create-project', body, { headers: { 'x-forwarded-host': 'untrusted.invalid' } }),
    await request('create-project', body, { token: 'ct_' + '0'.repeat(32) }),
    await request('create-project', body, { path: '/c-test/v1/commands/create-project' }),
    await request('update-metadata', body),
    await request('create-project', JSON.stringify(body).replace('"name":', '"name":"duplicate","name":')),
    await request('create-project', { ...body, accountId: 'a'.repeat(32) }),
  ];
  assert.deepEqual(attempts.map(r => r.status), [403, 403, 401, 400, 400, 400, 400]);
  await Promise.all(attempts.map(r => r.text()));
  assert.deepEqual(counts(h), [0, 0, 0, 0, 0, 0, 0]);
});

test('C WebPage validates exact versions, scopes read/save/status, checks digest and refuses unsafe outcomes', async t => {
  const { h, request, other, sessions, owner } = await useHarness(t);
  const p = await create(request);
  const input = command(p);
  for (const resp of [
    await request(SAVE_WEB_PAGE, input, { headers: { 'x-test-decoder-profile': PROJECT_INGEST_TEST_PROFILE.id } }),
    await request(SAVE_WEB_PAGE, { ...input, payload: event.replace('"version":', '"unknown":') }),
    await request(SAVE_WEB_PAGE, input, { token: other }),
  ]) assert.ok([400, 403, 422].includes(resp.status));
  assert.deepEqual(counts(h), [1, 1, 0, 0, 0, 1, 1]);
  const saved = await request(SAVE_WEB_PAGE, input);
  assert.equal(saved.status, 200);
  const receipt = (await saved.json()).result.receipt;
  for (const mode of ['commands', 'status'] as const) {
    const different = await request(SAVE_WEB_PAGE, { ...input, payload: event + ' ' }, { mode });
    assert.equal(different.status, 409);
    const result = (await different.json()).result;
    assert.equal(result.reason, 'IDEMPOTENCY_KEY_REUSED');
    assert.equal(Object.hasOwn(result, 'receipt'), false);
  }
  assert.deepEqual(counts(h), [1, 2, 1, 1, 1, 2, 2]);
  const read = { dtoVersion: WEB_PAGE_COMMAND_VERSION, projectId: p.projectId, revision: receipt.revision,
    documentId: receipt.document.documentId };
  const wrongOwner = await request(READ_WEB_PAGE, read, { token: other });
  assert.equal(wrongOwner.status, 403);
  assert.doesNotMatch(await wrongOwner.text(), /prj_|drv_|payload/);
  assert.equal((await request(SAVE_WEB_PAGE, input, { token: other, mode: 'status' })).status, 403);
  assert.equal((await request(READ_WEB_PAGE, read, { mode: 'status' })).status, 400);
  const opened = await request(READ_WEB_PAGE, read);
  assert.equal(opened.status, 200);
  const doc = (await opened.json()).result.document;
  const bytes = Buffer.from(doc.payload, 'base64');
  assert.deepEqual(bytes, Buffer.from(event));
  assert.equal(doc.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(doc.revisionId, receipt.document.revisionId);
  sessions.revoke(owner);
  assert.equal((await request(SAVE_WEB_PAGE, input, { mode: 'status' })).status, 401);
  assert.deepEqual(counts(h), [1, 2, 1, 1, 1, 2, 2]);
});

test('C WebPage revocation after commit withholds the saved revision and reauthorizes receipt delivery', async t => {
  let revoke = false;
  const { request, sessions, h } = await useHarness(t, { fault: () => revoke ? 'revoke-after-commit' : 'none' });
  const p = await create(request);
  const input = command(p);
  revoke = true;
  const hidden = await request(SAVE_WEB_PAGE, input);
  assert.equal(hidden.status, 401);
  assert.doesNotMatch(await hidden.text(), /drv_|receipt/);
  assert.deepEqual(counts(h), [1, 2, 1, 1, 1, 2, 2]);
  const freshOwner = sessions.issue('a'.repeat(32));
  const status = await request(SAVE_WEB_PAGE, input, { mode: 'status', token: freshOwner });
  assert.equal(status.status, 200);
  assert.equal((await status.json()).result.receipt.replayed, true);
});

test('C WebPage interruption before commit leaves no partial document and fences the profile', async t => {
  const { h, request } = await useHarness(t, { fault: () => 'before-web-commit' });
  const p = await create(request);
  const input = command(p);
  const before = counts(h);
  const fault = await request(SAVE_WEB_PAGE, input);
  assert.equal(fault.status, 503);
  assert.equal((await fault.json()).outcome, 'UNKNOWN_OUTCOME');
  assert.deepEqual(counts(h), before);
  assert.equal(h.ledger.meta().mode, 'FENCED');
  assert.equal((await request(SAVE_WEB_PAGE, input, { mode: 'status' })).status, 503);
  assert.deepEqual(counts(h), before);
});


const newProject = { dtoVersion: WEB_PAGE_WORKSPACE_COMMAND_VERSION, idempotencyKey: 'atomic-web', payload: event };
const documentList = { dtoVersion: WEB_PAGE_WORKSPACE_COMMAND_VERSION };

test('C Workspace v2 atomically creates the WebPage, recovers a lost receipt and lists only owned confirmed heads', async t => {
  const { h, request, other } = await useHarness(t, { dropCommittedOnce: true }, true);
  const initial = [0, 0, 0, 0, 0, 0, 0];
  assert.equal((await request(CREATE_WEB_PAGE_PROJECT, newProject, { headers: { Origin: 'https://untrusted.invalid' } })).status, 403);
  assert.equal((await request(CREATE_WEB_PAGE_PROJECT, { ...newProject, ownerId: 'a'.repeat(32) })).status, 400);
  assert.equal((await request(CREATE_WEB_PAGE_PROJECT, { ...newProject, payload: event.replace('"version":', '"unknown":') })).status, 400);
  assert.equal((await request('create-project', createRequest())).status, 400);
  assert.equal((await request(LIST_WEB_PAGE_DOCUMENTS, { ...documentList, limit: 10 })).status, 400);
  assert.equal((await request(LIST_WEB_PAGE_DOCUMENTS, documentList, { mode: 'status' })).status, 400);
  assert.equal((await request(LIST_WEB_PAGE_DOCUMENTS, documentList, { token: 'ct_' + '0'.repeat(32) })).status, 401);
  assert.deepEqual(counts(h), initial);

  await assert.rejects(request(CREATE_WEB_PAGE_PROJECT, newProject));
  assert.deepEqual(counts(h), [1, 1, 1, 1, 1, 1, 1]);
  assert.equal((await request(CREATE_WEB_PAGE_PROJECT, newProject, { mode: 'status', token: other })).status, 503);
  const recovered = await request(CREATE_WEB_PAGE_PROJECT, newProject, { mode: 'status' });
  assert.equal(recovered.status, 200);
  const receipt = (await recovered.json()).result.receipt;
  assert.equal(receipt.replayed, true);
  assert.equal(receipt.parentRevisionId, null);
  const replay = await request(CREATE_WEB_PAGE_PROJECT, newProject);
  assert.equal(replay.status, 200);
  assert.deepEqual((await replay.json()).result.receipt, receipt);
  const conflict = await request(CREATE_WEB_PAGE_PROJECT, { ...newProject, payload: event + ' ' });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).result.reason, 'IDEMPOTENCY_KEY_REUSED');
  assert.deepEqual(counts(h), [1, 1, 1, 1, 1, 1, 1]);

  const listed = await request(LIST_WEB_PAGE_DOCUMENTS, documentList);
  assert.equal(listed.status, 200);
  const body = await listed.text();
  assert.ok(Buffer.byteLength(body) <= WEB_PAGE_WORKSPACE_OUTPUT_BYTES);
  const summary = JSON.parse(body).result.documents[0];
  assert.deepEqual(Object.keys(summary).sort(), ['documentId', 'revision', 'revisionId', 'sha256', 'title']);
  assert.equal(summary.title, JSON.parse(event).hero.heading);
  assert.equal(summary.revisionId, receipt.document.revisionId);
  assert.equal(summary.sha256, receipt.document.sha256);
  const empty = await request(LIST_WEB_PAGE_DOCUMENTS, documentList, { token: other });
  assert.equal(empty.status, 200);
  assert.deepEqual((await empty.json()).result.documents, []);
  const read = { dtoVersion: WEB_PAGE_COMMAND_VERSION, projectId: receipt.projectId, revision: summary.revision,
    documentId: summary.documentId };
  assert.equal((await request(READ_WEB_PAGE, read, { token: other })).status, 403);
  assert.equal((await request(READ_WEB_PAGE, read)).status, 200);
});

test('C Workspace v2 rechecks list ownership and session before delivery', async t => {
  let revoke: (() => void) | undefined;
  const { h, request, sessions, owner } = await useHarness(t, { beforeDelivery: async () => revoke?.() }, true);
  const created = await request(CREATE_WEB_PAGE_PROJECT, newProject);
  assert.equal(created.status, 200);
  const receipt = (await created.json()).result.receipt;
  revoke = () => sessions.revoke(owner);
  const result = await request(LIST_WEB_PAGE_DOCUMENTS, documentList);
  assert.equal(result.status, 401);
  assert.doesNotMatch(await result.text(), new RegExp(receipt.projectId));
  assert.deepEqual(counts(h), [1, 1, 1, 1, 1, 1, 1]);
});
