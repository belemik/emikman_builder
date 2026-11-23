import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import { createServerIdIssuer } from '../server/projects/server-identities';
import { createTestCommandCandidate, createWebPageRepositoryCandidate, inspectTestCandidate } from '../server/projects/test-command-candidate';
import { WEB_PAGE_CONTEXT } from '../server/projects/b-test-web-page';
import type { BFault, BResult } from '../server/projects/b-test-repository';
import {
  READ_WEB_PAGE, SAVE_WEB_PAGE, WEB_PAGE_COMMAND_VERSION, WEB_PAGE_MANIFEST_PROFILE,
  type WebPageReadRequestV1, type WebPageSaveRequestV1,
} from '../src/projects/web-page-repository.dto';
import type { ProjectRevisionReferenceDTO } from '../src/projects/repository.dto';
import { candidate, committed, createRequest, environment, header } from './fixtures/b-test-support';

const fixture = readFileSync(new URL('./fixtures/web-page/event.valid.json', import.meta.url), 'utf8');
const original = JSON.parse(fixture);
const edited = { ...original, hero: { ...original.hero, heading: 'Заря · e\u0301 · 🌅' } };
const payload = '\r\n' + JSON.stringify(edited, null, 2).replaceAll('\n', '\r\n') + '\r\n';
const encode = (input: object) => Buffer.from(JSON.stringify(input), 'utf8');
const workerPath = fileURLToPath(new URL('./fixtures/b-test-web-page-worker.ts', import.meta.url));

function command(op: string, input: object) {
  const result = createWebPageRepositoryCandidate(op, encode(input));
  assert.equal(result.kind, 'candidate');
  return result.candidate;
}

function createProject(env: ReturnType<typeof environment>, key = 'initial-project') {
  return committed(env.repo.execute(env.principal, candidate('create-project', createRequest(key)))).receipt;
}

function save(expectedRevision: ProjectRevisionReferenceDTO, documentId: string | null,
  idempotencyKey: string, text = payload): WebPageSaveRequestV1 {
  return { dtoVersion: WEB_PAGE_COMMAND_VERSION, projectId: expectedRevision.projectId, expectedRevision,
    documentId, idempotencyKey, payload: text };
}

function read(revision: ProjectRevisionReferenceDTO, documentId: string): WebPageReadRequestV1 {
  return { dtoVersion: WEB_PAGE_COMMAND_VERSION, projectId: revision.projectId, documentId, revision };
}

function saved(result: BResult) {
  const receipt = committed(result).receipt;
  assert.equal(receipt.operation, SAVE_WEB_PAGE);
  return receipt;
}

function start(t: TestContext, fault?: (stage: BFault) => void) {
  const env = environment({ webPageProfile: true, fault });
  const paths = { main: env.main.directory, ledger: env.volume.directory };
  let closed = false;
  const close = () => { if (!closed) { closed = true; env.close(); } };
  t.after(() => {
    close();
    rmSync(paths.main, { recursive: true });
    rmSync(paths.ledger, { recursive: true });
  });
  return { ...env, paths, close };
}

function worker(paths: { main: string; ledger: string }, op: string, body: object,
  stage?: BFault) {
  const child = fork(workerPath, [paths.main, paths.ledger, op, encode(body).toString('base64'), stage ?? ''],
    { execArgv: ['--import', 'tsx'], serialization: 'advanced', stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let result: BResult | undefined;
  let stderr = '';
  let error: Error | undefined;
  child.stderr!.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  child.on('error', value => { error = value; });
  let resolveReady!: () => void;
  const ready = new Promise<void>(resolve => { resolveReady = resolve; });
  child.on('message', message => {
    if (message === 'ready') resolveReady();
    else result = message as BResult;
  });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 8000);
  const closed = new Promise<{ result?: BResult; code: number | null; signal: string | null; diagnostics: string }>(resolve => {
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      resolveReady();
      resolve({ result, code, signal, diagnostics: [error?.message, stderr].filter(Boolean).join('\n') });
    });
  });
  return { ready, closed, send: (action = 'execute') => { if (child.connected) child.send(action, () => {}); } };
}

function successful(output: Awaited<ReturnType<typeof worker>['closed']>) {
  assert.equal(output.code, 0, output.diagnostics);
  assert.ok(output.result, output.diagnostics);
  return output.result;
}

function rows(env: ReturnType<typeof environment>) {
  return ['projects', 'revisions', 'web_documents', 'web_revisions', 'web_snapshot_heads',
    'receipts', 'operation_status', 'audit'].map(table =>
    env.repo.database.prepare('SELECT count(*) AS count FROM ' + table).get()?.count);
}

test('WebPage create → edit Hero → exit → reopen exact confirmed bytes, hash, pins and revision', async t => {
  const env = start(t);
  const project = createProject(env);
  const initial = saved(env.repo.execute(env.principal, command(SAVE_WEB_PAGE, save(project.revision, null, 'initial-page', fixture))));
  assert.equal(initial.document.contract, '0.1');
  env.close();

  const writing = worker(env.paths, SAVE_WEB_PAGE, save(initial.revision, initial.document.documentId, 'edited-page'));
  await writing.ready;
  writing.send();
  const editedReceipt = saved(successful(await writing.closed));
  assert.equal(editedReceipt.revision.integrity.byteDomain, WEB_PAGE_MANIFEST_PROFILE);
  assert.notEqual(editedReceipt.document.revisionId, initial.document.revisionId);
  assert.equal(editedReceipt.document.sha256, createHash('sha256').update(payload, 'utf8').digest('hex'));

  const reading = worker(env.paths, READ_WEB_PAGE, read(editedReceipt.revision, editedReceipt.document.documentId));
  await reading.ready;
  reading.send();
  const reopened = successful(await reading.closed);
  assert.equal(reopened.kind, 'web-page');
  assert.deepEqual(reopened.projectRevision, editedReceipt.revision);
  assert.deepEqual(Buffer.from(reopened.document.payload), Buffer.from(payload));
  assert.deepEqual(JSON.parse(Buffer.from(reopened.document.payload).toString('utf8')), edited);
  const { payload: _, ...descriptor } = reopened.document;
  assert.deepEqual(descriptor, editedReceipt.document);
  const { contract, validator, renderer, assetCatalog } = descriptor;
  assert.deepEqual({ contract, validator, renderer, assetCatalog }, WEB_PAGE_CONTEXT);

  const check = environment({ ...env.paths, webPageProfile: true });
  try {
    const previous = check.repo.execute(check.principal, command(READ_WEB_PAGE, read(initial.revision, initial.document.documentId)));
    assert.equal(previous.kind, 'web-page');
    assert.deepEqual(Buffer.from(previous.document.payload), Buffer.from(fixture));
    assert.throws(() => check.repo.database.exec("UPDATE web_revisions SET payload=X'01'"), /IMMUTABLE_DOCUMENT_REVISION/);
  } finally { check.close(); }
});

test('WebPage rejects invalid payloads, v1 admission, foreign and revoked owners, and cross-project document IDs', t => {
  const env = start(t);
  const project = createProject(env);
  const base = save(project.revision, null, 'valid-save');
  const invalid = save(project.revision, null, 'bad', fixture.replace('"version":', '"unexpected":'));
  const before = rows(env);
  assert.equal(createWebPageRepositoryCandidate(SAVE_WEB_PAGE, encode(invalid)).kind, 'rejected');
  const duplicate = { ...base, payload: fixture.replace('"version":', '"version":"0.1","version":') };
  assert.equal(createWebPageRepositoryCandidate(SAVE_WEB_PAGE, encode(duplicate)).kind, 'rejected');
  assert.equal(createWebPageRepositoryCandidate(SAVE_WEB_PAGE, encode({ ...base, accountId: 'x' })).kind, 'rejected');
  assert.equal(createTestCommandCandidate(SAVE_WEB_PAGE, encode(base)).kind, 'rejected');
  const valid = command(SAVE_WEB_PAGE, base);
  assert.equal(inspectTestCandidate(valid), null);
  assert.equal(env.repo.execute(env.other, valid).kind, 'denied');
  assert.deepEqual(rows(env), before);
  const receipt = saved(env.repo.execute(env.principal, valid));
  const reopening = command(READ_WEB_PAGE, read(receipt.revision, receipt.document.documentId));
  assert.equal(env.repo.execute(env.other, reopening).kind, 'denied');
  assert.equal(env.repo.reconcile(env.other, valid).kind, 'denied');
  const second = createProject(env, 'second-project');
  assert.equal(env.repo.execute(env.principal, command(SAVE_WEB_PAGE,
    save(second.revision, receipt.document.documentId, 'cross-project'))).kind, 'denied');
  assert.equal(env.repo.execute(env.principal, command(READ_WEB_PAGE,
    read(second.revision, receipt.document.documentId))).kind, 'denied');
  env.revoke();
  assert.equal(env.repo.execute(env.principal, reopening).kind, 'denied');
  assert.equal(env.repo.reconcile(env.principal, valid).kind, 'denied');
});

test('WebPage same key replays original receipt after head moves, and changed bytes conflict', t => {
  const env = start(t);
  const project = createProject(env);
  const first = save(project.revision, null, 'same-key');
  const cmd = command(SAVE_WEB_PAGE, first);
  const a = saved(env.repo.execute(env.principal, cmd));
  saved(env.repo.execute(env.principal, command(SAVE_WEB_PAGE, save(a.revision, a.document.documentId, 'next-key'))));
  const before = rows(env);
  for (const replay of [env.repo.execute(env.principal, cmd), env.repo.reconcile(env.principal, cmd)]) {
    assert.deepEqual(saved(replay), { ...a, replayed: true });
  }
  const reused = env.repo.execute(env.principal, command(SAVE_WEB_PAGE, { ...first, payload: first.payload + ' ' }));
  assert.equal(reused.kind, 'conflict');
  assert.equal(reused.reason, 'IDEMPOTENCY_KEY_REUSED');
  assert.deepEqual(rows(env), before);
});

test('WebPage concurrent workers on different documents share one CAS; explicit fresh save works', async t => {
  const env = start(t);
  const project = createProject(env);
  const a = saved(env.repo.execute(env.principal, command(SAVE_WEB_PAGE, save(project.revision, null, 'doc-a'))));
  const b = saved(env.repo.execute(env.principal, command(SAVE_WEB_PAGE, save(a.revision, null, 'doc-b'))));
  const commands = [save(b.revision, a.document.documentId, 'race-a'), save(b.revision, b.document.documentId, 'race-b')];
  const children = commands.map(input => worker(env.paths, SAVE_WEB_PAGE, input));
  await Promise.all(children.map(child => child.ready));
  children.forEach(child => child.send());
  const results = (await Promise.all(children.map(child => child.closed))).map(successful);
  const winnerIndex = results.findIndex(result => result.kind === 'committed');
  assert.notEqual(winnerIndex, -1);
  const winner = saved(results[winnerIndex]);
  const loser = results[1 - winnerIndex];
  assert.equal(loser.kind, 'conflict');
  assert.equal(loser.reason, 'EXPECTED_REVISION_MISMATCH');
  assert.equal(env.repo.reconcile(env.principal, command(SAVE_WEB_PAGE, commands[1 - winnerIndex])).kind, 'conflict');
  const updated = commands[1 - winnerIndex];
  const retry = saved(env.repo.execute(env.principal, command(SAVE_WEB_PAGE,
    save(winner.revision, updated.documentId, 'explicit-retry'))));
  for (const doc of [a.document, b.document]) {
    assert.equal(env.repo.execute(env.principal, command(READ_WEB_PAGE, read(retry.revision, doc.documentId))).kind, 'web-page');
  }
});

for (const stage of ['after-web-page-payload', 'after-receipt', 'after-main-commit'] as const) {
  test(`WebPage process interruption at ${stage} reconciles only durable commits`, async t => {
    const env = start(t);
    const project = createProject(env);
    const before = rows(env);
    const body = save(project.revision, null, 'lost-result');
    env.close();
    const interrupted = worker(env.paths, SAVE_WEB_PAGE, body, stage);
    await interrupted.ready;
    interrupted.send();
    const stopped = await interrupted.closed;
    assert.equal(stopped.signal, 'SIGKILL', stopped.diagnostics);
    assert.equal(readFileSync(join(env.paths.main, 'web-fault-observed'), 'utf8'), stage);
    const reconciliation = worker(env.paths, SAVE_WEB_PAGE, body);
    await reconciliation.ready;
    reconciliation.send('reconcile');
    const result = successful(await reconciliation.closed);
    const verify = environment({ ...env.paths, webPageProfile: true });
    try {
      if (stage === 'after-main-commit') {
        const receipt = saved(result);
        assert.equal(receipt.replayed, true);
        assert.equal(verify.repo.execute(verify.principal, command(READ_WEB_PAGE,
          read(receipt.revision, receipt.document.documentId))).kind, 'web-page');
        assert.deepEqual(rows(verify), [1, 2, 1, 1, 1, 2, 2, 2]);
      } else {
        assert.equal(result.kind, 'unknown-outcome');
        assert.deepEqual(rows(verify), before);
        assert.equal(verify.ledger.meta().mode, 'FENCED');
        assert.equal(verify.repo.execute(verify.principal, command(SAVE_WEB_PAGE, body)).kind, 'unknown-outcome');
      }
    } finally { verify.close(); }
  });
}

test('WebPage profile preserves old metadata and restores historical document heads through the versioned adapter', t => {
  const env = start(t);
  const project = createProject(env);
  assert.equal(project.revision.integrity.byteDomain, 'zarya.project-manifest.jcs/v1');
  const a = saved(env.repo.execute(env.principal, command(SAVE_WEB_PAGE, save(project.revision, null, 'page-a'))));
  const b = saved(env.repo.execute(env.principal, command(SAVE_WEB_PAGE, save(a.revision, a.document.documentId, 'page-b', fixture))));
  const update = { ...header, projectId: project.projectId, expectedRevision: b.revision,
    idempotencyKey: 'meta', metadata: { name: 'Updated fixture', description: '', defaultProductRef: null } };
  assert.equal(createTestCommandCandidate('update-metadata', encode(update)).kind, 'rejected');
  const meta = committed(env.repo.execute(env.principal, command('update-metadata', update))).receipt;
  const restored = committed(env.repo.execute(env.principal, command('restore-project',
    { ...header, projectId: project.projectId, expectedRevision: meta.revision, sourceRevision: a.revision,
      idempotencyKey: 'restore-page-a' }))).receipt;
  const reloaded = env.repo.execute(env.principal, command(READ_WEB_PAGE, read(restored.revision, a.document.documentId)));
  assert.equal(reloaded.kind, 'web-page');
  assert.equal(reloaded.document.revisionId, a.document.revisionId);
  const historicalManifest = env.repo.database.prepare('SELECT canonical FROM revisions WHERE id=?').get(restored.revision.id);
  assert.equal(typeof historicalManifest?.canonical, 'string');
  assert.deepEqual(JSON.parse(String(historicalManifest?.canonical)).content.documentHeads, [a.document]);
  const bogus = createServerIdIssuer().next('document');
  assert.equal(env.repo.execute(env.principal, command(READ_WEB_PAGE, read(restored.revision, bogus))).kind, 'denied');
  env.repo.verifyMain();
});
