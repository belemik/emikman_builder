import {test} from 'node:test';import assert from 'node:assert/strict';
import {fork} from 'node:child_process';import {fileURLToPath} from 'node:url';import {readFileSync} from 'node:fs';import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {testEnvironment,createRequest,candidate,header,limits} from './fixtures/p04-support';
import {startTestHttpHarness} from '../server/projects/test-http-harness';
import {PROJECT_INGEST_TEST_PROFILE as profile} from '../server/projects/ingest-profile';
import {snapshotDisposableStore,restoreDisposableSnapshot} from '../server/projects/store-backup';
import {createDisposableVolume} from '../server/projects/disposable-volume';
async function fixture(options:Parameters<typeof startTestHttpHarness>[2]={},directory?:string){const e=testEnvironment({directory}),a=e.sessions.issue('fixture-account-A'),http=await startTestHttpHarness(e.repository,e.sessions,options);return {...e,a,http,close:async()=>{await http.close();e.store.close();}};}
const headers=(url:string,token:string)=>({Authorization:'Bearer '+token,Origin:url,'Content-Type':'application/json','x-test-decoder-profile':profile.id});
const post=(url:string,token:string,op:string,body:object)=>fetch(url+'/test/v0/commands/'+op,{method:'POST',headers:headers(url,token),body:JSON.stringify(body)});
const counts=(e:ReturnType<typeof testEnvironment>)=>({...e.store.database.prepare('SELECT (SELECT count(*) FROM revisions) r,(SELECT count(*) FROM receipts) c,(SELECT count(*) FROM audit) a').get()});
test('R6 three concurrent same-account HTTP sessions: one CAS winner/two conflicts; logout independent',async()=>{
 const e=await fixture();try{
 const first=await post(e.http.url,e.a,'create-project',createRequest());const one=(await first.json()).result.receipt;
 const tokens=[e.a,e.sessions.issue('fixture-account-A'),e.sessions.issue('fixture-account-A')];
 const results=await Promise.all(tokens.map((t,i)=>post(e.http.url,t,'update-metadata',{...header,projectId:one.projectId,expectedRevision:one.revision,idempotencyKey:'parallel-'+i,metadata:createRequest('unused','Name '+i).metadata})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409,409]);assert.deepEqual(counts(e),{r:2,c:2,a:2});
 e.sessions.revoke(tokens[0]);assert.equal((await fetch(e.http.url+'/test/v0/projects',{headers:headers(e.http.url,tokens[0])})).status,401);
 for(const t of tokens.slice(1))assert.equal((await fetch(e.http.url+'/test/v0/projects',{headers:headers(e.http.url,t)})).status,200);
 assert.equal((await fetch(e.http.url+'/test/v0/projects',{headers:headers(e.http.url,e.sessions.issue('fixture-account-A'))})).status,200);e.repository.verify();
 }finally{await e.close();}
});
test('R6 same-key concurrent requests replay once; changed bytes/semantic command conflict',async()=>{
 const e=await fixture();try{
 const responses=await Promise.all(Array.from({length:3},()=>post(e.http.url,e.a,'create-project',createRequest('same','same'))));
 assert.ok(responses.every(r=>r.status===200));const receipts=await Promise.all(responses.map(async r=>(await r.json()).result.receipt));assert.equal(new Set(receipts.map(r=>r.projectId)).size,1);assert.equal(receipts.filter(r=>r.replayed).length,2);
 assert.equal((await post(e.http.url,e.a,'create-project',createRequest('same','changed'))).status,409);assert.deepEqual(counts(e),{r:1,c:1,a:1});
 e.sessions.denyOperation(e.a,'create-project');assert.equal((await post(e.http.url,e.a,'create-project',createRequest('same','same'))).status,403);assert.deepEqual(counts(e),{r:1,c:1,a:1});
 }finally{await e.close();}
});
test('R6 lost HTTP response after commit + server restart keeps receipt; old session invalid',async()=>{
 const e=await fixture({dropFirstCommittedResponse:true});const directory=e.volume.directory;
 try {await assert.rejects(()=>post(e.http.url,e.a,'create-project',createRequest('lost-response')));assert.deepEqual(counts(e),{r:1,c:1,a:1});
 const replay=await post(e.http.url,e.a,'create-project',createRequest('lost-response'));assert.equal(replay.status,200);assert.equal((await replay.json()).result.receipt.replayed,true);
 }finally{await e.close();}
 const restarted=await fixture({},directory);try {
 assert.equal((await post(restarted.http.url,e.a,'create-project',createRequest('lost-response'))).status,401);
 const retried=await post(restarted.http.url,restarted.a,'create-project',createRequest('lost-response'));assert.equal(retried.status,200);assert.equal((await retried.json()).result.receipt.replayed,true);assert.deepEqual(counts(restarted),{r:1,c:1,a:1});restarted.repository.verify();
 }finally{await restarted.close();}
});
for(const stage of ['before-transaction','after-revision','after-head','after-audit','after-receipt','before-commit','after-commit']) {
 test('R6 full HTTP chain SIGKILL '+stage,{timeout:15000},async()=>{
  const e=testEnvironment(),session=e.sessions.issue('fixture-account-A'),first=await e.repository.execute(session,candidate('create-project',createRequest()));assert.equal(first.kind,'committed');if(first.kind!=='committed')throw Error();e.store.close();
  const child=fork(fileURLToPath(new URL('./fixtures/p04-worker.ts',import.meta.url)),[e.volume.directory,stage],{execArgv:['--import','tsx'],stdio:['ignore','ignore','pipe','ipc']});
  const exited=new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
  const ready=await new Promise<{url:string;token:string}>((resolve,reject)=>{child.once('error',reject);child.once('exit',()=>reject(Error('WORKER_BEFORE_READY')));child.on('message',m=>{if(m&&typeof m==='object'&&'kind'in m&&m.kind==='ready'&&'url'in m&&typeof m.url==='string'&&'token'in m&&typeof m.token==='string')resolve({url:m.url,token:m.token});});});
  const body={...header,projectId:first.receipt.projectId,expectedRevision:first.receipt.revision,idempotencyKey:'kill-'+stage,metadata:createRequest('unused','Changed').metadata};
  await assert.rejects(()=>post(ready.url,ready.token,'update-metadata',body));const ended=await exited;assert.equal(ended.signal,'SIGKILL');assert.equal(readFileSync(join(e.volume.directory,'.p04-fault-observed'),'utf8'),stage);
  const reopened=await fixture({},e.volume.directory);try {
   const n=stage==='after-commit'?2:1;assert.deepEqual(counts(reopened),{r:n,c:n,a:n});reopened.repository.verify();
   const retried=await post(reopened.http.url,reopened.a,'update-metadata',body);assert.equal(retried.status,200);assert.equal((await retried.json()).result.receipt.replayed,stage==='after-commit');assert.deepEqual(counts(reopened),{r:2,c:2,a:2});
  }finally{await reopened.close();}
 });
}
test('R6 integrated SQLITE_BUSY and SQLITE_FULL:503/no partial writes/retry',async()=>{
 const e=await fixture();try{
 const result=await post(e.http.url,e.a,'create-project',createRequest()),first=(await result.json()).result.receipt;
 const body={...header,projectId:first.projectId,expectedRevision:first.revision,idempotencyKey:'busy',metadata:createRequest('unused','busy').metadata};
 e.store.database.exec('PRAGMA busy_timeout=1');const lock=new DatabaseSync(e.volume.databasePath);lock.exec('BEGIN IMMEDIATE');
 try{assert.equal((await post(e.http.url,e.a,'update-metadata',body)).status,503);assert.equal(e.repository.lastTestFailure,'SQLITE_BUSY');assert.deepEqual(counts(e),{r:1,c:1,a:1});}finally{lock.exec('ROLLBACK');lock.close();}
 const success=await post(e.http.url,e.a,'update-metadata',body);assert.equal(success.status,200);const second=(await success.json()).result.receipt;
 e.store.database.exec('PRAGMA wal_checkpoint(TRUNCATE)');const n=e.store.database.prepare('PRAGMA page_count').get()?.page_count;if(typeof n!=='number')throw Error();e.store.database.exec('PRAGMA max_page_count='+n);
 const full={...body,idempotencyKey:'full',expectedRevision:second.revision,metadata:{...createRequest().metadata,description:'x'.repeat(20000)}};
 assert.equal((await post(e.http.url,e.a,'update-metadata',full)).status,503);assert.equal(e.repository.lastTestFailure,'SQLITE_FULL');assert.deepEqual(counts(e),{r:2,c:2,a:2});
 e.store.database.exec('PRAGMA max_page_count=10000');assert.equal((await post(e.http.url,e.a,'update-metadata',full)).status,200);e.repository.verify();
 }finally{await e.close();}
});
test('R6 backup/restore new disposable volume: receipts/revisions/owners preserved',async()=>{
 const e=await fixture();try{
 const a=(await (await post(e.http.url,e.a,'create-project',createRequest('backup-A','A private'))).json()).result.receipt;
 const b=e.sessions.issue('fixture-account-B');await post(e.http.url,b,'create-project',createRequest('backup-B','B private'));
 const snapshot=createDisposableVolume();await snapshotDisposableStore(e.store,snapshot);const target=createDisposableVolume();await restoreDisposableSnapshot(snapshot,target,limits);
 const restored=await fixture({},target.directory);try{
  const replay=await post(restored.http.url,restored.a,'create-project',createRequest('backup-A','A private'));assert.equal(replay.status,200);assert.equal((await replay.json()).result.receipt.replayed,true);
  const foreign=await fetch(restored.http.url+'/test/v0/projects/'+a.projectId,{headers:headers(restored.http.url,restored.sessions.issue('fixture-account-B'))});assert.equal(foreign.status,404);assert.ok(!(await foreign.text()).includes('A private'));assert.deepEqual(counts(restored),{r:2,c:2,a:2});restored.repository.verify();
 }finally{await restored.close();}
 }finally{await e.close();}
});
test('R6 cross-account all scoped reads/writes deny without exposing heads/receipts',async()=>{
 const e=await fixture();try{
 const created=await post(e.http.url,e.a,'create-project',createRequest()),r=(await created.json()).result.receipt,b=e.sessions.issue('fixture-account-B');
 for(const op of ['read-project','list-revisions','read-revision','update-metadata','create-revision','restore-project','soft-delete-project']) {
  const body={...header,projectId:r.projectId,...(op==='list-revisions'?{cursor:null}:{}),...(op==='read-revision'?{revision:r.revision}:{}),...(['update-metadata','create-revision','restore-project','soft-delete-project'].includes(op)?{expectedRevision:r.revision,idempotencyKey:'foreign-'+op}:{}),...(['update-metadata','create-revision'].includes(op)?{metadata:createRequest().metadata}:{}),...(op==='restore-project'?{sourceRevision:r.revision}:{})};
  const response=await post(e.http.url,b,op,body);assert.equal(response.status,404);const text=await response.text();assert.ok(!text.includes(r.projectId)&&!text.includes(r.revision.integrity.value));
 }
 const list=await post(e.http.url,b,'list-projects',{...header,cursor:null});assert.equal(list.status,200);assert.equal((await list.json()).result.projects.length,0);assert.deepEqual(counts(e),{r:1,c:1,a:1});
 }finally{await e.close();}
});
