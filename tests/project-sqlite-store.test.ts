import assert from 'node:assert/strict';
import {test} from 'node:test';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createDisposableVolume,adoptDisposableVolume} from '../server/projects/disposable-volume';
import {DisposableMetadataStore,type TestStoreLimits,type StoredRevision} from '../server/projects/sqlite-metadata-store';
import {computeManifestIntegrity} from '../server/projects/manifest-integrity';
import {createServerIdIssuer} from '../server/projects/server-identities';
import type {CanonicalProjectManifestV1} from '../src/projects/canonicalization.types';
const limits:TestStoreLimits={maxMetadataUtf8Bytes:32768,maxProjectsPerAccount:32,maxRevisionsPerProject:128,maxReceiptsPerAccount:512,maxRequestNodes:256,maxRequestUtf8Bytes:65536,busyTimeoutMs:3000};
function row(account='fixture-account-A',name='Test'):StoredRevision {
 const ids=createServerIdIssuer();const manifest:CanonicalProjectManifestV1={modelId:'zarya.project-envelope',modelVersion:'1.0.0',canonicalizationProfile:'zarya.project-manifest.jcs/v1',projectId:ids.next('project'),
 revision:{id:ids.next('project-revision'),parentId:null,restoreOf:null,sequence:1,createdAt:'2026-11-13T00:00:00.000Z',actorRef:account},content:{metadata:{name,description:'Only test data',defaultProjectType:null},permittedSourceRefs:[],designDefaultsRef:null,works:[],documentHeads:[]}};
 const hash=computeManifestIntegrity(manifest);if(hash.kind!=='manifest-integrity')throw Error('fixture');return {manifest,digest:hash.integrity.value,lifecycle:'active',operation:'create-project'};
}
test('S2 SQLite create/read/list/history; true close/reopen persistence',()=>{
 const v=createDisposableVolume();const r=row();let store=new DisposableMetadataStore(v,limits);
 store.insertInitial('fixture-account-A',r);assert.deepEqual(store.head('fixture-account-A',r.manifest.projectId),r);store.close();
 store=new DisposableMetadataStore(adoptDisposableVolume(v.directory),limits);
 assert.deepEqual(store.list('fixture-account-A'),[r]);assert.deepEqual(store.history('fixture-account-A',r.manifest.projectId),[r]);store.close();
});
test('S2 independent accounts and every low-level query are scoped',()=>{
 const store=new DisposableMetadataStore(createDisposableVolume(),limits),a=row(),b=row('fixture-account-B');
 store.insertInitial('fixture-account-A',a);store.insertInitial('fixture-account-B',b);
 assert.equal(store.list('fixture-account-A').length,1);assert.equal(store.head('fixture-account-B',a.manifest.projectId),undefined);
 assert.equal(store.revision('fixture-account-B',a.manifest.projectId,a.manifest.revision.id),undefined);assert.deepEqual(store.history('fixture-account-B',a.manifest.projectId),[]);store.close();
});
test('S2 uniqueness and immutable records enforced by SQLite, rollback is atomic',()=>{
 const s=new DisposableMetadataStore(createDisposableVolume(),limits),r=row();assert.throws(()=>s.insertRevision('fixture-account-A',r),/TRANSACTION_REQUIRED/);s.insertInitial('fixture-account-A',r);
 assert.throws(()=>s.insertInitial('fixture-account-A',r));assert.equal(s.list('fixture-account-A').length,1);
 assert.throws(()=>s.database.prepare('UPDATE revisions SET name=? WHERE id=?').run('altered',r.manifest.revision.id),/IMMUTABLE/);
 assert.throws(()=>s.database.prepare('DELETE FROM revisions WHERE id=?').run(r.manifest.revision.id),/IMMUTABLE/);assert.deepEqual(s.head('fixture-account-A',r.manifest.projectId),r);s.close();
});
test('S2 corrupted canonical bytes refused on read and reopen',()=>{
 const v=createDisposableVolume(),s=new DisposableMetadataStore(v,limits),r=row();s.insertInitial('fixture-account-A',r);
 s.database.exec('DROP TRIGGER revisions_no_update');s.database.prepare('UPDATE revisions SET canonical=? WHERE id=?').run('{}',r.manifest.revision.id);
 assert.throws(()=>s.head('fixture-account-A',r.manifest.projectId));s.close();assert.throws(()=>new DisposableMetadataStore(v,limits));
});
test('S2 unknown schema version refused without migration or overwrite',()=>{
 const v=createDisposableVolume(),s=new DisposableMetadataStore(v,limits);s.database.exec('PRAGMA user_version=99');s.close();
 assert.throws(()=>new DisposableMetadataStore(v,limits),/SCHEMA_VERSION/);const raw=new DatabaseSync(v.databasePath);assert.equal(raw.prepare('PRAGMA user_version').get()?.user_version,99);raw.close();
});
test('S2 explicit fixture allocation cap rejects before writes',()=>{
 const s=new DisposableMetadataStore(createDisposableVolume(),{...limits,maxMetadataUtf8Bytes:32}),r=row('fixture-account-A','x'.repeat(64));
 assert.throws(()=>s.insertInitial('fixture-account-A',r),/ALLOCATION_LIMIT/);assert.equal(s.list('fixture-account-A').length,0);s.close();
});
test('S2 paths require own temporary marker/capability; no production DATA_DIR fallback',()=>{
 assert.throws(()=>adoptDisposableVolume(process.cwd()));
 assert.throws(()=>new DisposableMetadataStore({directory:tmpdir(),databasePath:join(tmpdir(),'users.json')},limits),/CAPABILITY/);
});
