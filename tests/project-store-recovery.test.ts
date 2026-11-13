import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {environment,header,createRequest,receipt,limits} from './fixtures/p03-support';
import {createDisposableVolume} from '../server/projects/disposable-volume';
import {snapshotDisposableStore,restoreDisposableSnapshot} from '../server/projects/store-backup';
import {DisposableMetadataStore} from '../server/projects/sqlite-metadata-store';

for(const stage of ['before-transaction','after-revision','after-head','after-audit','after-receipt','before-commit','after-commit']) {
 test('S4 SIGKILL '+stage+' reopens only old/new consistent state',{timeout:20000},async()=>{
  const e=environment(),first=receipt(await e.repo.create(e.context,createRequest()));e.store.close();
  const child=fork(fileURLToPath(new URL('./fixtures/p03-worker.ts',import.meta.url)),[e.volume.directory,'crash','crash',stage],{execArgv:['--import','tsx'],stdio:['ignore','ignore','pipe','ipc']});
  const exited=new Promise<{code:number|null;signal:string|null}>((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
  await new Promise<void>((resolve,reject)=>{child.once('error',reject);child.on('message',m=>{if(m&&typeof m==='object'&&'kind'in m&&m.kind==='ready')resolve();});});
  child.send('go');const exit=await exited;assert.equal(exit.signal,'SIGKILL');assert.equal(readFileSync(join(e.volume.directory,'.fault-observed'),'utf8'),stage);
  const reopened=environment(e.volume.directory),expected=stage==='after-commit'?2:1;
  assert.equal(reopened.store.history('fixture-account-A',first.projectId).length,expected);
  for(const table of ['revisions','audit','receipts'])assert.equal(reopened.store.database.prepare('SELECT count(*) AS n FROM '+table).get()?.n,expected);
  reopened.repo.verifyRepository();
  const retried=receipt(await reopened.repo.updateMetadata(reopened.context,{...header,projectId:first.projectId,expectedRevision:first.revision,idempotencyKey:'key-crash',metadata:createRequest('x','Update crash').metadata}));
  assert.equal(retried.replayed,stage==='after-commit');assert.equal(reopened.store.history('fixture-account-A',first.projectId).length,2);reopened.store.close();
 });
}
test('S4 native consistent snapshot/restore on fresh volume: all owners, heads, revisions, receipts',async()=>{
 const e=environment(),a=receipt(await e.repo.create(e.context,createRequest())),b=receipt(await e.repo.create(e.other,createRequest('b','Account B')));
 const second=receipt(await e.repo.updateMetadata(e.context,{...header,projectId:a.projectId,expectedRevision:a.revision,idempotencyKey:'u',metadata:createRequest('x','Second A').metadata}));
 const snapshot=createDisposableVolume();await snapshotDisposableStore(e.store,snapshot);
 // New source mutation must not appear in the already completed snapshot.
 receipt(await e.repo.updateMetadata(e.context,{...header,projectId:a.projectId,expectedRevision:second.revision,idempotencyKey:'later',metadata:createRequest('x','After snapshot').metadata}));
 const target=createDisposableVolume();await restoreDisposableSnapshot(snapshot,target,limits);const restored=environment(target.directory);
 const read=await restored.repo.read(restored.context,{...header,projectId:a.projectId});if(read.kind!=='project')throw Error('fixture');assert.equal(read.project.metadata.name,'Second A');assert.equal(read.project.revision.integrity.value,second.revision.integrity.value);
 assert.equal((await restored.repo.read(restored.other,{...header,projectId:a.projectId})).kind,'not-found');assert.equal((await restored.repo.read(restored.context,{...header,projectId:b.projectId})).kind,'not-found');
 assert.equal(receipt(await restored.repo.create(restored.context,createRequest())).replayed,true);restored.repo.verifyRepository();
 await assert.rejects(()=>restoreDisposableSnapshot(snapshot,target,limits),/FRESH/);e.store.close();restored.store.close();
});
test('S4 corrupted backup refuses restore; original source remains readable',async()=>{
 const e=environment(),first=receipt(await e.repo.create(e.context,createRequest()));const snapshot=createDisposableVolume();await snapshotDisposableStore(e.store,snapshot);
 writeFileSync(snapshot.databasePath,Buffer.from('corrupt test database only'));await assert.rejects(()=>restoreDisposableSnapshot(snapshot,createDisposableVolume(),limits));
 assert.equal((await e.repo.read(e.context,{...header,projectId:first.projectId})).kind,'project');e.repo.verifyRepository();e.store.close();
});
test('S4 actual SQLite busy/lock gives unavailable, no partial receipt; retry after release',async()=>{
 const e=environment(),first=receipt(await e.repo.create(e.context,createRequest()));e.store.database.exec('PRAGMA busy_timeout=1');
 const lock=new DatabaseSync(e.volume.databasePath);lock.exec('BEGIN IMMEDIATE');const req={...header,projectId:first.projectId,expectedRevision:first.revision,idempotencyKey:'busy',metadata:createRequest('x','Busy retry').metadata};
 try{assert.equal((await e.repo.updateMetadata(e.context,req)).kind,'unavailable');assert.equal(e.repo.lastTestFailure,'SQLITE_BUSY');}finally{lock.exec('ROLLBACK');lock.close();}
 assert.equal(e.store.history('fixture-account-A',first.projectId).length,1);assert.equal(receipt(await e.repo.updateMetadata(e.context,req)).replayed,false);e.repo.verifyRepository();e.store.close();
});
test('S4 actual SQLITE_FULL via max_page_count rolls back head/revision/audit/receipt',async()=>{
 const e=environment(),first=receipt(await e.repo.create(e.context,createRequest()));e.store.database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
 const n=e.store.database.prepare('PRAGMA page_count').get()?.page_count;if(typeof n!=='number'||!Number.isSafeInteger(n))throw Error('fixture');
 e.store.database.exec('PRAGMA max_page_count='+n);
 const req={...header,projectId:first.projectId,expectedRevision:first.revision,idempotencyKey:'full',metadata:{...createRequest().metadata,description:'x'.repeat(20000)}};
 assert.equal((await e.repo.updateMetadata(e.context,req)).kind,'unavailable');assert.equal(e.repo.lastTestFailure,'SQLITE_FULL');
 for(const table of ['revisions','audit','receipts'])assert.equal(e.store.database.prepare('SELECT count(*) AS n FROM '+table).get()?.n,1);
 assert.equal(e.store.head('fixture-account-A',first.projectId)?.digest,first.revision.integrity.value);
 e.store.database.exec('PRAGMA max_page_count=10000');receipt(await e.repo.updateMetadata(e.context,req));e.repo.verifyRepository();e.store.close();
});
test('S4 audit/receipt tampering is detected; no silent repair',async()=>{
 const e=environment();receipt(await e.repo.create(e.context,createRequest()));e.store.database.exec('DROP TRIGGER receipts_no_update');e.store.database.prepare('UPDATE receipts SET fingerprint=?').run('0'.repeat(64));
 assert.throws(()=>e.repo.verifyRepository(),/RECEIPT/);e.store.close();assert.throws(()=>new DisposableMetadataStore(e.volume,limits));
});
