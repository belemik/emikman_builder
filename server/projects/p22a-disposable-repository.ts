import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, writeFileSync, type Stats } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { emptyDocument } from '../../src/canvas/model';
import { validateScreen } from '../../src/design-system/validator';
import { hasEntityIdShape } from '../../src/projects/compatibility';
import {
  DOCUMENT_SNAPSHOT_VERSION, type CreateInitialDocument, type CreateInitialResult,
  type InitialDocumentRepository, type InitialDocumentSnapshot, type ReadInitialResult,
} from '../../src/projects/document-snapshot.dto';
import type { RepositoryContext } from '../../src/projects/repository.port';
import { assertDisposableVolume, type DisposableVolume } from './disposable-volume';
import { createServerIdIssuer } from './server-identities';
import { TestFixtureAuthority } from './test-authority';

const PROFILE = 'zarya.p22a.initial-document.test/v1';
export const P22A_DATABASE_NAME = 'p22a-initial-document.sqlite';
const INITIALIZED = '.p22a-initialized';
const authorizeFixture = TestFixtureAuthority.prototype.authorize;
const FORMAT = 'format:wdeaf-screen-v3';
const INITIAL_SCREEN = JSON.stringify(emptyDocument());
const snapshotSql = `
  SELECT p.id AS project_id, p.name, p.created_at, w.id AS work_id,
    d.id AS document_id, r.id AS revision_id, r.created_at AS revision_created_at,
    r.screen, r.screen_digest
  FROM projects p
  LEFT JOIN works w ON w.project_id = p.id
  LEFT JOIN documents d ON d.project_id = p.id AND d.work_id = w.id
  LEFT JOIN revisions r ON r.document_id = d.id AND r.id = d.head_revision_id
  WHERE p.owner_account = ? AND p.id = ?
`;
export type InitialWriteStage = 'project' | 'work' | 'document' | 'revision';
type Fault = (stage: InitialWriteStage) => void;

function hash(screen: string): string {
  return createHash('sha256').update(screen, 'utf8').digest('hex');
}

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw Error('P22A_INVALID_GRAPH');
  return value;
}

function isPrivateFile(file: Stats, uid: number): boolean {
  return file.isFile() && file.uid === uid && file.nlink === 1 && (file.mode & 0o777) === 0o600;
}

function checkVolume(volume: DisposableVolume, initialize: boolean): string {
  assertDisposableVolume(volume);
  const uid = process.getuid?.();
  if (uid === undefined || lstatSync(volume.directory).uid !== uid) throw Error('P22A_PRIVATE_VOLUME_REQUIRED');
  const paths = initialize
    ? ['.p03-test-only']
    : ['.p03-test-only', INITIALIZED, P22A_DATABASE_NAME, P22A_DATABASE_NAME + '-journal'];
  if (readdirSync(volume.directory).some(name => !paths.includes(name))) throw Error('P22A_PRIVATE_FILE_REQUIRED');

  const path = join(volume.directory, P22A_DATABASE_NAME);
  if (initialize) return path;
  if (!isPrivateFile(lstatSync(path), uid)) throw Error('P22A_PRIVATE_FILE_REQUIRED');
  try {
    if (!isPrivateFile(lstatSync(path + '-journal'), uid)) throw Error('P22A_PRIVATE_FILE_REQUIRED');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const marker = openSync(join(volume.directory, INITIALIZED), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(marker);
    if (!isPrivateFile(stat, uid) || stat.size !== PROFILE.length || readFileSync(marker, 'utf8') !== PROFILE) {
      throw Error('P22A_INVALID_MARKER');
    }
  } finally {
    closeSync(marker);
  }
  return path;
}

/** Disposable fixture authority and registered temporary volumes only. */
export class DisposableInitialDocumentRepository implements InitialDocumentRepository {
  #db: DatabaseSync;
  #closed = false;
  #failed = false;
  #writing = false;

  private constructor(
    volume: DisposableVolume,
    private readonly authority: TestFixtureAuthority,
    initialize: boolean,
    private readonly fault?: Fault,
  ) {
    if (!(authority instanceof TestFixtureAuthority)) throw Error('P22A_FIXTURE_AUTHORITY_REQUIRED');
    const path = checkVolume(volume, initialize);
    if (initialize) closeSync(openSync(path, 'wx', 0o600));
    this.#db = new DatabaseSync(path, { enableForeignKeyConstraints: true });
    try {
      this.#db.exec('PRAGMA busy_timeout=3000; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF;');
      if (this.#db.prepare('PRAGMA journal_mode').get()?.journal_mode !== 'delete') throw Error('P22A_JOURNAL_PROFILE');
      if (initialize) {
        const sql = readFileSync(new URL('./p22a-disposable-schema.sql', import.meta.url), 'utf8');
        this.#db.exec('BEGIN IMMEDIATE;');
        this.#db.exec(sql);
        this.#db.exec('COMMIT;');
      }
      if (this.#db.prepare('PRAGMA user_version').get()?.user_version !== 1 ||
          this.#db.prepare('SELECT profile FROM store_profile').get()?.profile !== PROFILE ||
          this.#db.prepare('PRAGMA quick_check(1)').get()?.quick_check !== 'ok' ||
          this.#db.prepare('PRAGMA foreign_key_check').get()) throw Error('P22A_INVALID_STORE');
      if (initialize) writeFileSync(join(volume.directory, INITIALIZED), PROFILE, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      this.#db.close();
      throw error;
    }
  }

  static initialize(volume: DisposableVolume, authority: TestFixtureAuthority, fault?: Fault) {
    return new DisposableInitialDocumentRepository(volume, authority, true, fault);
  }

  static reopen(volume: DisposableVolume, authority: TestFixtureAuthority) {
    return new DisposableInitialDocumentRepository(volume, authority, false);
  }

  close(): void {
    if (this.#closed) return;
    if (this.#writing) throw Error('P22A_TRANSACTION_ACTIVE');
    this.#db.close();
    this.#closed = true;
  }

  #snapshot(account: string, id: string): InitialDocumentSnapshot | null {
    const row = this.#db.prepare(snapshotSql).get(account, id);
    if (!row) return null;
    const projectId = text(row, 'project_id');
    const workId = text(row, 'work_id');
    const documentId = text(row, 'document_id');
    const revisionId = text(row, 'revision_id');
    const raw = text(row, 'screen');
    const screenDigest = text(row, 'screen_digest');
    if (raw !== INITIAL_SCREEN || hash(raw) !== screenDigest) throw Error('P22A_SCREEN_INTEGRITY');
    const validation = validateScreen(JSON.parse(raw));
    if (!validation.valid) throw Error('P22A_SCREEN_INVALID');
    return {
      version: DOCUMENT_SNAPSHOT_VERSION,
      project: { id: projectId, name: text(row, 'name'), type: 'web-application', status: 'active', createdAt: text(row, 'created_at') },
      work: { id: workId, projectId },
      document: { id: documentId, projectId, workId, format: FORMAT, headRevisionId: revisionId },
      revision: { id: revisionId, documentId, parentId: null, sequence: 1,
        createdAt: text(row, 'revision_created_at'), screenDigest, screen: validation.value },
    };
  }

  create(context: RepositoryContext, request: CreateInitialDocument): CreateInitialResult {
    const account = authorizeFixture.call(this.authority, context);
    if (account === null) return { kind: 'denied' };
    if (this.#closed || this.#failed || this.#writing) return { kind: 'unavailable' };
    if (!request || typeof request !== 'object') return { kind: 'invalid' };
    const fields = Object.getOwnPropertyDescriptors(request);
    if (Reflect.ownKeys(fields).length !== 3 ||
        !['version', 'type', 'name'].every(key => Object.hasOwn(fields, key) && 'value' in fields[key]) ||
        fields.version.value !== DOCUMENT_SNAPSHOT_VERSION || fields.type.value !== 'web-application' ||
        typeof fields.name.value !== 'string') return { kind: 'invalid' };
    const name: string = fields.name.value.trim();
    if (!name || name.length > 100 || name.includes('\0') || Buffer.from(name).toString('utf8') !== name) {
      return { kind: 'invalid' };
    }

    this.#writing = true;
    let transaction = false;
    try {
      this.#db.exec('BEGIN IMMEDIATE;');
      transaction = true;
      if (this.#db.prepare('SELECT 1 FROM projects WHERE owner_account = ?').get(account)) {
        this.#db.exec('ROLLBACK;');
        return { kind: 'project-exists' };
      }
      const ids = createServerIdIssuer();
      const projectId = ids.next('project');
      const workId = ids.next('work');
      const documentId = ids.next('document');
      const revisionId = ids.next('document-revision');
      const now = new Date().toISOString();
      this.#db.prepare("INSERT INTO projects VALUES (?, ?, ?, 'web-application', 'active', ?)").run(projectId, account, name, now);
      this.fault?.('project');
      this.#db.prepare('INSERT INTO works VALUES (?, ?)').run(workId, projectId);
      this.fault?.('work');
      this.#db.prepare('INSERT INTO documents VALUES (?, ?, ?, ?, ?)').run(documentId, projectId, workId, FORMAT, revisionId);
      this.fault?.('document');
      this.#db.prepare('INSERT INTO revisions VALUES (?, ?, NULL, 1, ?, ?, ?)').run(revisionId, documentId, now, INITIAL_SCREEN, hash(INITIAL_SCREEN));
      this.fault?.('revision');
      const snapshot = this.#snapshot(account, projectId);
      if (!snapshot || authorizeFixture.call(this.authority, context) !== account) throw Error('P22A_CREATE_NOT_CONFIRMED');
      this.#db.exec('COMMIT;');
      return { kind: 'created', snapshot };
    } catch {
      if (transaction) {
        this.#failed = true;
        try { this.#db.exec('ROLLBACK;'); } catch { /* The outcome requires reopening and inspection. */ }
      }
      return { kind: 'unavailable' };
    } finally {
      this.#writing = false;
    }
  }

  read(context: RepositoryContext, projectId: string): ReadInitialResult {
    const account = authorizeFixture.call(this.authority, context);
    if (account === null) return { kind: 'denied' };
    if (typeof projectId !== 'string' || !hasEntityIdShape(projectId, 'project')) return { kind: 'invalid' };
    if (this.#closed || this.#failed || this.#writing) return { kind: 'unavailable' };
    try {
      const snapshot = this.#snapshot(account, projectId);
      return snapshot ? { kind: 'found', snapshot } : { kind: 'not-found' };
    } catch {
      this.#failed = true;
      return { kind: 'unavailable' };
    }
  }
}
