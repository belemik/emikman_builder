import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chmodSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { environment,limits,createRequest,receipt } from './fixtures/p03-support';
import { DisposableMetadataStore } from '../server/projects/sqlite-metadata-store';
import { adoptDisposableVolume } from '../server/projects/disposable-volume';
function child(path:string,mode:string) {
 const c=fork(fileURLToPath(new URL('./fixtures/hardening-storage-worker.ts',import.meta.url)),[path,mode],{execArgv:['--import','tsx'],stdio:['ignore','ignore','pipe','ipc']});
 const exit=new Promise((resolve,reject)=>{c.once('error',reject);c.once('exit',(code,signal)=>resolve({code,signal}));});
 const message=new Promise<unknown>((resolve,reject)=>{c.once('error',reject);c.once('message',resolve);c.once('exit',()=>reject(Error('NO_CHILD_MESSAGE')));});
 return {c,message,exit};
}
test('H1 WAL/FULL, two connections, reader snapshot, runtime and receipt/audit integrity',async()=>{
 const e=environment();try {
 assert.equal(e.store.database.prepare('PRAGMA journal_mode').get()?.journal_mode,'wal');assert.equal(e.store.database.prepare('PRAGMA synchronous').get()?.synchronous,2);
 const other=new DatabaseSync(e.volume.databasePath);try {
  const one=receipt(await e.repo.create(e.context,createRequest('h1-one')));other.exec('BEGIN');assert.equal(other.prepare('SELECT count(*) n FROM revisions').get()?.n,1);
  receipt(await e.repo.create(e.context,createRequest('h1-two')));assert.equal(other.prepare('SELECT count(*) n FROM revisions').get()?.n,1);other.exec('COMMIT');assert.equal(other.prepare('SELECT count(*) n FROM revisions').get()?.n,2);
  assert.equal(e.store.head('fixture-account-A',one.projectId)?.digest,one.revision.integrity.value);e.repo.verifyRepository();
  assert.ok(process.versions.sqlite);assert.equal(e.store.database.prepare('SELECT sqlite_version() v').get()?.v,process.versions.sqlite);
 }finally{other.close();}
 }finally{e.store.close();}
});
test('H1 independent process BEGIN IMMEDIATE busy refusal, then successful retry',{timeout:15000},async()=>{
 const e=environment();try {
 e.store.database.exec('CREATE TABLE probe(value TEXT); BEGIN IMMEDIATE;');
 const blocked=child(e.volume.databasePath,'busy');try{assert.deepEqual(await blocked.message,{kind:'refused',code:5});await blocked.exit;}finally{e.store.database.exec('ROLLBACK');}
 const retry=child(e.volume.databasePath,'busy');assert.deepEqual(await retry.message,{kind:'committed'});await retry.exit;
 assert.equal(e.store.database.prepare('SELECT count(*) n FROM probe').get()?.n,1);
 }finally{e.store.close();}
});
test('H1 independent process killed with open transaction reopens without partial row',{timeout:15000},async()=>{
 const e=environment();e.store.database.exec('CREATE TABLE probe(value TEXT)');e.store.close();
 const crashed=child(e.volume.databasePath,'crash');assert.deepEqual(await crashed.message,{kind:'transaction-open'});crashed.c.kill('SIGKILL');assert.deepEqual(await crashed.exit,{code:null,signal:'SIGKILL'});
 const reopened=new DisposableMetadataStore(adoptDisposableVolume(e.volume.directory),limits);try{assert.equal(reopened.database.prepare('SELECT count(*) n FROM probe').get()?.n,0);reopened.verifyAll();}finally{reopened.close();}
});
test('H1 unknown schema rejected with no automatic migration',()=>{
 const e=environment();e.store.database.exec('PRAGMA user_version=77');e.store.close();
 assert.throws(()=>new DisposableMetadataStore(adoptDisposableVolume(e.volume.directory),limits),/SCHEMA_VERSION/);
 const db=new DatabaseSync(e.volume.databasePath);try{assert.equal(db.prepare('PRAGMA user_version').get()?.user_version,77);}finally{db.close();}
});
test('H1 read-only connection refuses write; bad volume permissions fail marker gate',()=>{
 const e=environment();try {
 const db=new DatabaseSync(e.volume.databasePath,{readOnly:true});try{assert.throws(()=>db.exec("INSERT INTO store_profile VALUES('bad')"));}finally{db.close();}
 chmodSync(e.volume.directory,0o500);try{assert.throws(()=>adoptDisposableVolume(e.volume.directory),/DISPOSABLE_VOLUME_REQUIRED/);assert.throws(()=>writeFileSync(join(e.volume.directory,'permission-probe'),'synthetic',{flag:'wx'}),{code:'EACCES'});}finally{chmodSync(e.volume.directory,0o700);}
 }finally{e.store.close();}
});
