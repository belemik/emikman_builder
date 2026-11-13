import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {testEnvironment,createRequest,candidate} from './fixtures/p04-support';
import {createDisposableVolume} from '../server/projects/disposable-volume';
import {snapshotDisposableStore,restoreDisposableSnapshot} from '../server/projects/store-backup';
function decrypt(bytes:Buffer,key:Buffer|null):Buffer {
 if(!key||key.length!==32||bytes.length<28)throw Error('TEST_BACKUP_ENVELOPE');
 const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAuthTag(bytes.subarray(12,28));return Buffer.concat([d.update(bytes.subarray(28)),d.final()]);
}
test('H5 native consistent encrypted roundtrip to NEW disposable volume preserves revisions/receipt replay',async()=>{
 const e=testEnvironment(),token=e.sessions.issue('fixture-account-A'),snap=createDisposableVolume(),target=createDisposableVolume();
 try {
 const body=createRequest('backup-replay'),first=await e.repository.execute(token,candidate('create-project',body));assert.equal(first.kind,'committed');
 await snapshotDisposableStore(e.store,snap);
 const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const data=Buffer.concat([cipher.update(readFileSync(snap.databasePath)),cipher.final()]),envelope=Buffer.concat([iv,cipher.getAuthTag(),data]);
 assert.throws(()=>decrypt(envelope,null));assert.throws(()=>decrypt(envelope,randomBytes(32)));assert.throws(()=>decrypt(envelope.subarray(0,20),key));
 const damaged=Buffer.from(envelope);damaged[damaged.length-1]^=1;assert.throws(()=>decrypt(damaged,key));
 const decoded=createDisposableVolume();writeFileSync(decoded.databasePath,decrypt(envelope,key),{flag:'wx',mode:0o600});
 await restoreDisposableSnapshot(decoded,target,e.store.limits);
 const recovered=testEnvironment({directory:target.directory});try {
 recovered.repository.verify();const r=await recovered.repository.execute(recovered.sessions.issue('fixture-account-A'),candidate('create-project',body));assert.equal(r.kind,'committed');if(r.kind==='committed')assert.equal(r.receipt.replayed,true);
 assert.deepEqual({...recovered.store.database.prepare('SELECT (SELECT count(*) FROM revisions) r,(SELECT count(*) FROM receipts) c,(SELECT count(*) FROM audit) a').get()},{r:1,c:1,a:1});
 }finally{recovered.store.close();}
 }finally{e.store.close();}
});
for(const mode of ['truncated','corrupt','schema'])test('H5 restore refuses '+mode+' snapshot, no target overwrite',async()=>{
 const e=testEnvironment(),snap=createDisposableVolume(),target=createDisposableVolume();try {
 await snapshotDisposableStore(e.store,snap);
 if(mode==='schema'){const db=new DatabaseSync(snap.databasePath);db.exec('PRAGMA user_version=99');db.close();}
 else{const bytes=readFileSync(snap.databasePath);writeFileSync(snap.databasePath,mode==='truncated'?bytes.subarray(0,64):Buffer.alloc(bytes.length,0xff));}
 await assert.rejects(()=>restoreDisposableSnapshot(snap,target,e.store.limits));
 assert.throws(()=>readFileSync(target.databasePath),{code:'ENOENT'});
 }finally{e.store.close();}
});
