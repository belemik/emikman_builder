import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, lstatSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { adoptDisposableVolume, createDisposableVolume } from '../server/projects/disposable-volume';
import {
  DisposableInitialDocumentRepository, P22A_DATABASE_NAME, type InitialWriteStage,
} from '../server/projects/p22a-disposable-repository';
import { createServerIdIssuer } from '../server/projects/server-identities';
import { TestFixtureAuthority } from '../server/projects/test-authority';
import { DOCUMENT_SNAPSHOT_VERSION, type CreateInitialResult } from '../src/projects/document-snapshot.dto';
import { prepareRender } from '../src/renderer/prepare';

const owner = 'fixture-account-A';
const other = 'fixture-account-B';
const initial = { version: DOCUMENT_SNAPSHOT_VERSION, type: 'web-application', name: '  Первый экран  ' } as const;
const tableNames = ['projects', 'works', 'documents', 'revisions'] as const;

function fixture(t: TestContext, fault?: (stage: InitialWriteStage) => void) {
  const volume = createDisposableVolume();
  const authority = new TestFixtureAuthority([owner, other]);
  const handles: DisposableInitialDocumentRepository[] = [];
  t.after(() => {
    handles.forEach(handle => handle.close());
    rmSync(volume.directory, { recursive: true, force: true });
  });
  const repository = DisposableInitialDocumentRepository.initialize(volume, authority, fault);
  handles.push(repository);
  return {
    authority, repository, volume, databasePath: join(volume.directory, P22A_DATABASE_NAME),
    reopen() {
      const handle = DisposableInitialDocumentRepository.reopen(adoptDisposableVolume(volume.directory), authority);
      handles.push(handle);
      return handle;
    },
  };
}

function counts(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return tableNames.map(table => db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n); }
  finally { db.close(); }
}

test('P2.2a commits the entire linked graph and reads the same confirmed v3 snapshot after reopen', t => {
  const { authority, repository, volume, databasePath, reopen } = fixture(t);
  const actor = authority.context(owner);
  const result = repository.create(actor, initial);
  assert.equal(result.kind, 'created');
  if (result.kind !== 'created') return;
  const { version, project, work, document, revision } = result.snapshot;
  assert.equal(version, '0.1');
  assert.equal(project.name, 'Первый экран');
  assert.equal(project.status, 'active');
  assert.ok(Number.isFinite(Date.parse(project.createdAt)));
  assert.equal(work.projectId, project.id);
  assert.equal(document.projectId, project.id);
  assert.equal(document.workId, work.id);
  assert.equal(document.headRevisionId, revision.id);
  assert.equal(revision.documentId, document.id);
  assert.equal(revision.parentId, null);
  assert.equal(revision.sequence, 1);
  assert.equal(revision.createdAt, project.createdAt);
  assert.equal(revision.screen.schemaVersion, 3);
  assert.deepEqual(revision.screen.elements, []);
  assert.equal(prepareRender(revision.screen).valid, true);
  assert.equal(createHash('sha256').update(JSON.stringify(revision.screen)).digest('hex'), revision.screenDigest);
  assert.equal(lstatSync(databasePath).mode & 0o777, 0o600);

  repository.close();
  assert.deepEqual(repository.read(actor, project.id), { kind: 'unavailable' });
  assert.deepEqual(reopen().read(actor, project.id), { kind: 'found', snapshot: result.snapshot });
  assert.deepEqual(counts(databasePath), [1, 1, 1, 1]);
});

test('P2.2a scopes reads to fixture owner and rejects forged, substituted and revoked contexts', t => {
  const { authority, repository } = fixture(t);
  const a = authority.context(owner);
  const b = authority.context(other);
  const result = repository.create(a, initial);
  const otherResult = repository.create(b, { ...initial, name: 'Другой экран' });
  assert.equal(result.kind, 'created');
  assert.equal(otherResult.kind, 'created');
  if (result.kind !== 'created' || otherResult.kind !== 'created') return;
  assert.deepEqual(repository.read(b, result.snapshot.project.id), { kind: 'not-found' });
  assert.deepEqual(repository.read(a, otherResult.snapshot.project.id), { kind: 'not-found' });
  assert.deepEqual(repository.read(a, createServerIdIssuer().next('project')), { kind: 'not-found' });
  assert.deepEqual(repository.read({ ...a }, result.snapshot.project.id), { kind: 'denied' });
  const foreignAuthority = new TestFixtureAuthority([owner]);
  assert.deepEqual(repository.read(foreignAuthority.context(owner), result.snapshot.project.id), { kind: 'denied' });
  authority.revoke(owner);
  assert.deepEqual(repository.read(a, result.snapshot.project.id), { kind: 'denied' });
  assert.deepEqual(repository.create(a, initial), { kind: 'denied' });
});

test('P2.2a rejects malformed local DTOs and resource IDs without creating rows', t => {
  const { authority, repository, databasePath } = fixture(t);
  const actor = authority.context(owner);
  for (const name of ['', '  ', 'a'.repeat(101), 'prefix\0suffix', '\ud800']) {
    assert.deepEqual(repository.create(actor, { ...initial, name }), { kind: 'invalid' });
  }
  assert.deepEqual(repository.create(actor, true as unknown as typeof initial), { kind: 'invalid' });
  const accessor = { ...initial, get name(): string { throw Error('Getter must not be called'); } };
  assert.deepEqual(repository.create(actor, accessor), { kind: 'invalid' });
  const badVersion = { ...initial, version: '9000' as '0.1' };
  const forged = { ...initial, ownerAccountId: other };
  assert.deepEqual(repository.create(actor, badVersion), { kind: 'invalid' });
  assert.deepEqual(repository.create(actor, forged), { kind: 'invalid' });
  assert.deepEqual(repository.read(actor, 'not-an-id'), { kind: 'invalid' });
  assert.deepEqual(repository.read(actor, createServerIdIssuer().next('document')), { kind: 'invalid' });
  assert.deepEqual(counts(databasePath), [0, 0, 0, 0]);
});

for (const stage of ['project', 'work', 'document', 'revision'] as const) {
  test(`P2.2a rolls back after a fault following insertion of ${stage}`, t => {
    const { authority, repository, reopen, databasePath } = fixture(t, at => { if (at === stage) throw Error('synthetic fault'); });
    const actor = authority.context(owner);
    assert.deepEqual(repository.create(actor, initial), { kind: 'unavailable' });
    assert.deepEqual(repository.create(actor, initial), { kind: 'unavailable' });
    repository.close();
    assert.deepEqual(counts(databasePath), [0, 0, 0, 0]);
    assert.equal(reopen().create(actor, initial).kind, 'created');
    assert.deepEqual(counts(databasePath), [1, 1, 1, 1]);
  });
}

test('P2.2a denies a write if fixture authority is revoked before COMMIT', t => {
  const { authority, repository, databasePath } = fixture(t, at => { if (at === 'revision') authority.revoke(owner); });
  assert.deepEqual(repository.create(authority.context(owner), initial), { kind: 'unavailable' });
  repository.close();
  assert.deepEqual(counts(databasePath), [0, 0, 0, 0]);
});

test('P2.2a independent processes competing for one account slot commit exactly one graph', { timeout: 20000 }, async t => {
  const { repository, authority, volume, databasePath, reopen } = fixture(t);
  repository.close();
  const worker = fileURLToPath(new URL('./fixtures/p22a-disposable-worker.ts', import.meta.url));
  const statuses = await Promise.allSettled([owner, owner].map(async account => {
    const { stdout } = await promisify(execFile)(process.execPath, ['--import', 'tsx', worker, volume.directory, account], {
      timeout: 10000, maxBuffer: 16 * 1024,
    });
    return JSON.parse(stdout) as CreateInitialResult;
  }));
  const results = statuses.map(status => {
    if (status.status === 'rejected') throw status.reason;
    return status.value;
  });
  assert.deepEqual(results.map(result => result.kind).sort(), ['created', 'project-exists']);
  const winner = results.find(result => result.kind === 'created');
  assert.ok(winner);
  assert.deepEqual(reopen().read(authority.context(owner), winner.snapshot.project.id), {
    kind: 'found', snapshot: winner.snapshot,
  });
  assert.deepEqual(counts(databasePath), [1, 1, 1, 1]);
});

test('P2.2a reopen requires a private, initialized, marked store without foreign sidecars', t => {
  const { authority, repository, volume, databasePath, reopen } = fixture(t);
  repository.close();
  assert.throws(() => DisposableInitialDocumentRepository.initialize(volume, authority), /P22A_PRIVATE_FILE_REQUIRED/);
  const sub = createDisposableVolume();
  t.after(() => rmSync(sub.directory, { recursive: true, force: true }));
  assert.throws(() => DisposableInitialDocumentRepository.reopen(sub, authority), /ENOENT/);
  const old = new DatabaseSync(sub.databasePath);
  old.close();
  assert.throws(() => DisposableInitialDocumentRepository.reopen(sub, authority), /P22A_PRIVATE_FILE_REQUIRED/);
  assert.throws(() => adoptDisposableVolume(join(volume.directory, 'nested')), /ENOENT/);
  assert.throws(() => DisposableInitialDocumentRepository.reopen({ ...volume }, authority), /DISPOSABLE_CAPABILITY_REQUIRED/);
  chmodSync(databasePath, 0o644);
  assert.throws(reopen, /P22A_PRIVATE_FILE_REQUIRED/);
  chmodSync(databasePath, 0o600);
  symlinkSync(databasePath, databasePath + '-journal');
  assert.throws(reopen, /P22A_PRIVATE_FILE_REQUIRED/);
});

test('P2.2a corrupt persisted screen returns unavailable without exposing partial data', t => {
  const { authority, repository, volume, databasePath, reopen } = fixture(t);
  const actor = authority.context(owner);
  const result = repository.create(actor, initial);
  assert.equal(result.kind, 'created');
  if (result.kind !== 'created') return;
  repository.close();
  const db = new DatabaseSync(databasePath);
  try { db.prepare('UPDATE revisions SET screen_digest = ?').run('0'.repeat(64)); }
  finally { db.close(); }
  const handle = reopen();
  assert.deepEqual(handle.read(actor, result.snapshot.project.id), { kind: 'unavailable' });
  assert.deepEqual(handle.create(actor, initial), { kind: 'unavailable' });
});
