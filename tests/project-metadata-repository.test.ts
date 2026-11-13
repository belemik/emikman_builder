import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {environment,header,createRequest,receipt} from './fixtures/p03-support';
import type {ProjectMutationResult,CreateProjectRequest,UpdateProjectRequest,RestoreProjectRequest,SoftDeleteProjectRequest,ProjectMetadataDTO,ProjectRevisionReferenceDTO,CommitReceipt,RequestJson} from '../src/projects/repository.dto';
import {commandFingerprint,receiptChecksum} from '../server/projects/command-fingerprint';
import {computeManifestIntegrity} from '../server/projects/manifest-integrity';
function worker(directory:string,label:string,mode='race'){
 const child=fork(fileURLToPath(new URL('./fixtures/p03-worker.ts',import.meta.url)),[directory,mode,label,''],{execArgv:['--import','tsx'],stdio:['ignore','ignore','pipe','ipc']});
 const ready=new Promise<string>((resolve,reject)=>{child.once('error',reject);child.on('message',m=>{if(m&&typeof m==='object'&&'kind'in m&&m.kind==='ready'&&'head'in m&&typeof m.head==='string')resolve(m.head);});});
 const result=new Promise<ProjectMutationResult>((resolve,reject)=>{child.on('message',m=>{if(m&&typeof m==='object'&&'kind'in m&&m.kind==='result'&&'result'in m)resolve(m.result as ProjectMutationResult);});child.once('error',reject);child.once('exit',code=>{if(code!==0)reject(Error('worker exit '+code));});});
 return {child,ready,result};
}
test('S3 P02 create/read/list/history/revision; restart and durable replay',async()=>{
 let e=environment();const first=receipt(await e.repo.create(e.context,createRequest()));
 assert.equal((await e.repo.read(e.context,{...header,projectId:first.projectId})).kind,'project');
 assert.equal((await e.repo.revision(e.context,{...header,projectId:first.projectId,revision:first.revision})).kind,'revision');
 e.repo.verifyRepository();e.store.close();e=environment(e.volume.directory);const replay=receipt(await e.repo.create(e.context,createRequest()));assert.equal(replay.replayed,true);assert.equal(replay.revision.id,first.revision.id);e.store.close();
});
test('S3 CAS and createRevision, immutable history, stale/digest mismatch never rebased',async()=>{
 const e=environment(),first=receipt(await e.repo.create(e.context,createRequest()));const req={...header,projectId:first.projectId,expectedRevision:first.revision,idempotencyKey:'update',metadata:createRequest('x','Second').metadata};
 const second=receipt(await e.repo.updateMetadata(e.context,req));assert.equal(second.parentRevisionId,first.revision.id);
 assert.equal((await e.repo.createRevision(e.context,{...req,idempotencyKey:'stale'})).kind,'conflict');
 assert.equal((await e.repo.updateMetadata(e.context,{...req,idempotencyKey:'bad-hash',expectedRevision:{...second.revision,integrity:{...second.revision.integrity,value:'0'.repeat(64)}}})).kind,'conflict');
 receipt(await e.repo.createRevision(e.context,{...req,expectedRevision:second.revision,idempotencyKey:'third'}));
 const history=await e.repo.history(e.context,{...header,projectId:first.projectId,cursor:null});if(history.kind!=='revision-page')throw Error('fixture');assert.equal(history.revisions.length,3);assert.equal(history.revisions[0].metadata.name,'Fixture project');e.repo.verifyRepository();e.store.close();
});
test('S3 same-key/body replay after head advanced; changed body/guard conflicts',async()=>{
 const e=environment(),first=receipt(await e.repo.create(e.context,createRequest()));const req={...header,projectId:first.projectId,expectedRevision:first.revision,idempotencyKey:'update',metadata:createRequest('x','Second').metadata};
 const second=receipt(await e.repo.updateMetadata(e.context,req));receipt(await e.repo.updateMetadata(e.context,{...req,expectedRevision:second.revision,idempotencyKey:'later'}));
 const replay=receipt(await e.repo.updateMetadata(e.context,req));assert.equal(replay.replayed,true);assert.equal(replay.revision.id,second.revision.id);
 assert.equal((await e.repo.updateMetadata(e.context,{...req,metadata:createRequest('x','Changed').metadata})).kind,'conflict');assert.equal((await e.repo.updateMetadata(e.context,{...req,expectedRevision:second.revision})).kind,'conflict');
 const wrong={...req};Reflect.set(wrong,'dtoVersion','future');assert.equal((await e.repo.updateMetadata(e.context,wrong)).kind,'validation-error');e.store.close();
});
test('S3 lost response AFTER commit then reopen/retry creates no duplicate',async()=>{
 const e=environment(undefined,stage=>{if(stage==='after-commit')throw Error('LOST_RESPONSE');});assert.equal((await e.repo.create(e.context,createRequest())).kind,'unavailable');e.store.close();
 const reopened=environment(e.volume.directory);assert.equal(receipt(await reopened.repo.create(reopened.context,createRequest())).replayed,true);assert.equal(reopened.store.database.prepare('SELECT count(*) AS n FROM revisions').get()?.n,1);reopened.repo.verifyRepository();reopened.store.close();
});
test('S3 every precommit failure leaves zero partial rows',async()=>{
 for(const stage of ['before-transaction','after-revision','after-head','after-audit','after-receipt','before-commit']){
  const e=environment(undefined,hit=>{if(hit===stage)throw Error('FAULT');});assert.equal((await e.repo.create(e.context,createRequest())).kind,'unavailable');
  for(const table of ['projects','revisions','audit','receipts'])assert.equal(e.store.database.prepare('SELECT count(*) AS n FROM '+table).get()?.n,0);e.repo.verifyRepository();e.store.close();
 }
});
test('S3 account scoping for reads/writes/history/receipts, revocation before replay',async()=>{
 const e=environment(),first=receipt(await e.repo.create(e.context,createRequest())),base={...header,projectId:first.projectId};
 assert.equal((await e.repo.read(e.other,base)).kind,'not-found');assert.equal((await e.repo.history(e.other,{...base,cursor:null})).kind,'not-found');assert.equal((await e.repo.revision(e.other,{...base,revision:first.revision})).kind,'not-found');
 const guard={...base,expectedRevision:first.revision,idempotencyKey:'foreign'};
 assert.equal((await e.repo.updateMetadata(e.other,{...guard,metadata:createRequest().metadata})).kind,'not-found');assert.equal((await e.repo.softDelete(e.other,guard)).kind,'not-found');assert.equal((await e.repo.restore(e.other,{...guard,sourceRevision:{...first.revision,integrity:{...first.revision.integrity}}})).kind,'not-found');
 const list=await e.repo.list(e.other,{...header,cursor:null});if(list.kind!=='project-page')throw Error('fixture');assert.equal(list.projects.length,0);
 e.authority.revoke('fixture-account-A');assert.equal((await e.repo.create(e.context,createRequest())).kind,'forbidden');e.store.close();
});
test('S3 forged context and client owner claims are never authority',async()=>{
 const e=environment();assert.equal((await e.repo.create({...e.context},createRequest())).kind,'forbidden');
 const req={...createRequest()};Reflect.set(req,'ownerId','fixture-account-B');assert.equal((await e.repo.create(e.context,req)).kind,'validation-error');assert.equal(e.store.list('fixture-account-B').length,0);e.store.close();
});
test('S3 tombstone preserves history; restore creates new revision with exact links',async()=>{
 const e=environment(),first=receipt(await e.repo.create(e.context,createRequest())),base={...header,projectId:first.projectId};
 const deleted=receipt(await e.repo.softDelete(e.context,{...base,expectedRevision:first.revision,idempotencyKey:'delete'}));const list=await e.repo.list(e.context,{...header,cursor:null});if(list.kind!=='project-page')throw Error('fixture');assert.equal(list.projects.length,0);
 const tombstone=await e.repo.read(e.context,base);if(tombstone.kind!=='project')throw Error('fixture');assert.equal(tombstone.project.lifecycle,'soft-deleted');
 assert.equal((await e.repo.softDelete(e.context,{...base,expectedRevision:deleted.revision,idempotencyKey:'second-delete'})).kind,'validation-error');
 const restored=receipt(await e.repo.restore(e.context,{...base,expectedRevision:deleted.revision,sourceRevision:first.revision,idempotencyKey:'restore'}));assert.notEqual(restored.revision.id,first.revision.id);assert.equal(restored.parentRevisionId,deleted.revision.id);assert.equal(restored.restoredFromRevisionId,first.revision.id);assert.equal(e.store.history('fixture-account-A',first.projectId).length,3);e.repo.verifyRepository();e.store.close();
});
for(const same of [false,true])test('S3 real concurrent processes '+(same?'same-key replay':'A/B/C CAS single winner'),{timeout:30000},async()=>{
 const e=environment(),first=receipt(await e.repo.create(e.context,createRequest()));const workers=['A','B','C'].map(label=>worker(e.volume.directory,label,same?'same-key':'race'));
 try{assert.deepEqual(await Promise.all(workers.map(w=>w.ready)),Array(3).fill(first.revision.id));workers.forEach(w=>w.child.send('go'));const results=await Promise.all(workers.map(w=>w.result));
 if(same){const all=results.map(receipt);assert.equal(new Set(all.map(r=>r.revision.id)).size,1);assert.equal(all.filter(r=>!r.replayed).length,1);}else{assert.equal(results.filter(r=>r.kind==='committed').length,1);assert.equal(results.filter(r=>r.kind==='conflict').length,2);}
 assert.equal(e.store.history('fixture-account-A',first.projectId).length,2);e.repo.verifyRepository();
 }finally{workers.forEach(w=>{if(w.child.connected)w.child.kill();});e.store.close();}
});
test('S3 unsupported cursor and unknown metadata refused, no silent defaults',async()=>{
 const e=environment();assert.equal((await e.repo.list(e.context,{...header,cursor:'unimplemented'})).kind,'validation-error');const req=createRequest();Reflect.set(req.metadata,'payload','not supported');assert.equal((await e.repo.create(e.context,req)).kind,'validation-error');e.store.close();
});

test('S3 SQL metacharacters stay data; metadata is never executed',async()=>{
 const e=environment(),name="x'); DROP TABLE projects; --";const first=receipt(await e.repo.create(e.context,createRequest('sql-data',name)));
 const read=await e.repo.read(e.context,{...header,projectId:first.projectId});if(read.kind!=='project')throw Error('fixture');assert.equal(read.project.metadata.name,name);assert.equal(e.store.database.prepare('SELECT count(*) AS n FROM projects').get()?.n,1);e.store.close();
});

test('S3 concurrent create key has account/operation scope and one allocated project',{timeout:30000},async()=>{
 const e=environment();receipt(await e.repo.create(e.context,createRequest()));const workers=['A','B','C'].map(label=>worker(e.volume.directory,label,'create-same-key'));
 try{await Promise.all(workers.map(w=>w.ready));workers.forEach(w=>w.child.send('go'));const all=(await Promise.all(workers.map(w=>w.result))).map(receipt);assert.equal(new Set(all.map(r=>r.projectId)).size,1);assert.equal(all.filter(r=>!r.replayed).length,1);assert.equal(e.store.list('fixture-account-A').length,2);e.repo.verifyRepository();}
 finally{workers.forEach(w=>{if(w.child.connected)w.child.kill();});e.store.close();}
});
test('S3 create keys are independent across accounts, cross-project restore cannot be forged',async()=>{
 const e=environment(),a=receipt(await e.repo.create(e.context,createRequest())),b=receipt(await e.repo.create(e.other,createRequest()));assert.notEqual(a.projectId,b.projectId);
 const foreignRef={...b.revision,projectId:a.projectId,integrity:{...b.revision.integrity}};
 assert.equal((await e.repo.restore(e.context,{...header,projectId:a.projectId,expectedRevision:a.revision,sourceRevision:foreignRef,idempotencyKey:'foreign-source'})).kind,'not-found');e.store.close();
});

// S3-01: only ordinary caller-owned mutable fixture objects; no Proxy/getter required.
type MutationFixture = ReturnType<typeof environment>;
type WriteFixture = CreateProjectRequest|UpdateProjectRequest|RestoreProjectRequest|SoftDeleteProjectRequest;
function change(target:object,key:string,value:unknown):void{
 assert.equal(Reflect.set(target,key,value),true,'mutation must change the ordinary caller-owned fixture');
}
function mutatingEnvironment(){
 let action:(()=>void)|undefined;
 const env=environment(undefined,stage=>{if(stage==='before-transaction'){const once=action;action=undefined;once?.();}});
 return {...env,mutateNext(fn:()=>void){action=fn;}};
}
function afterValidated(env:MutationFixture,mutate:()=>void){
 // Private test instrumentation only: read operations have no public fault callback.
 const original=Reflect.get(env.repo,'validate');assert.equal(typeof original,'function');let armed=true;
 change(env.repo,'validate',function(...args:unknown[]){
  const result=Reflect.apply(original,env.repo,args);if(armed){armed=false;mutate();}return result;
 });
}
function refData(ref:ProjectRevisionReferenceDTO){return {...ref,integrity:{...ref.integrity}};}
function requestData(request:WriteFixture):RequestJson{
 const data:{[key:string]:RequestJson}={dtoVersion:request.dtoVersion,modelId:request.modelId,modelVersion:request.modelVersion,registry:{...request.registry},idempotencyKey:request.idempotencyKey};
 if('projectId'in request)data.projectId=request.projectId;
 if('expectedRevision'in request)data.expectedRevision=refData(request.expectedRevision);
 if('sourceRevision'in request)data.sourceRevision=refData(request.sourceRevision);
 if('metadata'in request)data.metadata={...request.metadata,defaultProductRef:request.metadata.defaultProductRef?{...request.metadata.defaultProductRef}:null};
 return data;
}
function assertAtomicCounts(env:MutationFixture,revisions:number,projects=1){
 assert.equal(env.store.database.prepare('SELECT count(*) AS n FROM projects').get()?.n,projects);
 for(const table of ['revisions','audit','receipts'])assert.equal(env.store.database.prepare('SELECT count(*) AS n FROM '+table).get()?.n,revisions);
 env.repo.verifyRepository();
}
function assertBoundWrite(env:MutationFixture,verified:WriteFixture,committed:CommitReceipt,metadata:ProjectMetadataDTO){
 const scope='projectId'in verified?verified.projectId:'';
 assert.equal(committed.idempotencyKey,verified.idempotencyKey);
 const row=env.store.database.prepare('SELECT * FROM receipts WHERE account=? AND scope_project=? AND operation=? AND key=?')
  .get('fixture-account-A',scope,committed.operation,verified.idempotencyKey);
 assert.ok(row);assert.equal(row.project_id,committed.projectId);assert.equal(row.revision_id,committed.revision.id);
 const expectedFingerprint=commandFingerprint(committed.operation,'fixture-account-A',scope,requestData(verified));
 assert.equal(row.fingerprint,expectedFingerprint);
 assert.equal(row.checksum,receiptChecksum('fixture-account-A',scope,committed.operation,verified.idempotencyKey,committed.projectId,committed.revision.id,expectedFingerprint));
 const stored=env.store.revision('fixture-account-A',committed.projectId,committed.revision.id);assert.ok(stored);
 assert.deepEqual(env.store.metadata(stored.manifest),metadata);
 const expectedManifest={...stored.manifest,content:{...stored.manifest.content,metadata:{name:metadata.name,description:metadata.description,defaultProjectType:metadata.defaultProductRef?{...metadata.defaultProductRef}:null}}};
 const digest=computeManifestIntegrity(expectedManifest);assert.equal(digest.kind,'manifest-integrity');
 if(digest.kind==='manifest-integrity'){assert.equal(stored.digest,digest.integrity.value);assert.equal(committed.revision.integrity.value,digest.integrity.value);}
}

test('S3-01 A: create metadata mutation after fingerprint keeps verified name and retry',async()=>{
 const e=mutatingEnvironment(),request={...createRequest('danger-key','Original verified name'),registry:{...header.registry}},verified=structuredClone(request);
 try{
  e.mutateNext(()=>change(request.metadata,'name','Changed AFTER fingerprint'));
  const saved=receipt(await e.repo.create(e.context,request));assertBoundWrite(e,verified,saved,verified.metadata);
  const replay=receipt(await e.repo.create(e.context,verified));assert.equal(replay.replayed,true);assert.equal(replay.revision.id,saved.revision.id);assertBoundWrite(e,verified,replay,verified.metadata);assertAtomicCounts(e,1);
 }finally{e.store.close();}
});
test('S3-01 B: idempotencyKey mutation after fingerprint cannot split lookup and receipt',async()=>{
 const e=mutatingEnvironment(),request={...createRequest('key-before','Verified'),registry:{...header.registry}},verified=structuredClone(request);
 try{
  e.mutateNext(()=>change(request,'idempotencyKey','key-after'));
  const saved=receipt(await e.repo.create(e.context,request));assertBoundWrite(e,verified,saved,verified.metadata);
  assert.equal(e.store.database.prepare('SELECT count(*) AS n FROM receipts WHERE key=?').get('key-after')?.n,0);
  const replay=receipt(await e.repo.create(e.context,verified));assert.equal(replay.replayed,true);assert.equal(replay.projectId,saved.projectId);assertAtomicCounts(e,1);
 }finally{e.store.close();}
});
for(const field of ['name','description','product-id','product-version','expected-id','expected-project','expected-digest','expected-domain']){
 test('S3-01 update mutation after snapshot: '+field,async()=>{
  const e=mutatingEnvironment();
  try{
   const first=receipt(await e.repo.create(e.context,createRequest()));
   const request:UpdateProjectRequest={...header,registry:{...header.registry},projectId:first.projectId,expectedRevision:refData(first.revision),idempotencyKey:'snapshot-'+field,
    metadata:{name:'Verified update',description:createRequest().metadata.description,defaultProductRef:{id:'product:mobile-app',definitionVersion:'1.0.0'}}};
   const verified=structuredClone(request);
   e.mutateNext(()=>{
    if(field==='name'||field==='description')change(request.metadata,field,'Changed after snapshot');
    if(field==='product-id')change(request.metadata.defaultProductRef!,'id','product:landing-page');
    if(field==='product-version')change(request.metadata.defaultProductRef!,'definitionVersion','future');
    if(field==='expected-id')change(request.expectedRevision,'id','prv_00000003-0000-4000-8000-000000000000');
    if(field==='expected-project')change(request.expectedRevision,'projectId','prj_00000003-0000-4000-8000-000000000000');
    if(field==='expected-digest')change(request.expectedRevision.integrity,'value','0'.repeat(64));
    if(field==='expected-domain')change(request.expectedRevision.integrity,'byteDomain','wrong-domain');
   });
   const saved=receipt(await e.repo.updateMetadata(e.context,request));assert.equal(saved.parentRevisionId,first.revision.id);assertBoundWrite(e,verified,saved,verified.metadata);
   const replay=receipt(await e.repo.updateMetadata(e.context,verified));assert.equal(replay.replayed,true);assert.equal(replay.revision.id,saved.revision.id);assertAtomicCounts(e,2);
  }finally{e.store.close();}
 });
}
test('S3-01 projectId/guard redirect after validation cannot move write into another project',async()=>{
 const e=environment();
 try{
  const a=receipt(await e.repo.create(e.context,createRequest('a','Project A'))),b=receipt(await e.repo.create(e.context,createRequest('b','Project B')));
  const request:UpdateProjectRequest={...header,registry:{...header.registry},projectId:a.projectId,expectedRevision:refData(a.revision),idempotencyKey:'scope-verified',metadata:createRequest('unused','Only A updated').metadata};
  const verified=structuredClone(request);
  afterValidated(e,()=>{change(request,'projectId',b.projectId);change(request,'expectedRevision',refData(b.revision));});
  const saved=receipt(await e.repo.updateMetadata(e.context,request));assert.equal(saved.projectId,a.projectId);assertBoundWrite(e,verified,saved,verified.metadata);
  assert.equal(e.store.head('fixture-account-A',b.projectId)?.manifest.content.metadata.name,'Project B');
  assert.equal(receipt(await e.repo.updateMetadata(e.context,verified)).replayed,true);assertAtomicCounts(e,3,2);
 }finally{e.store.close();}
});
test('S3-01 stale snapshot cannot be silently rebased by replacing the original expectedRevision',async()=>{
 const e=mutatingEnvironment();
 try{
  const first=receipt(await e.repo.create(e.context,createRequest()));
  const second=receipt(await e.repo.updateMetadata(e.context,{...header,projectId:first.projectId,expectedRevision:refData(first.revision),idempotencyKey:'advance',metadata:createRequest('x','Concurrent winner').metadata}));
  const request:UpdateProjectRequest={...header,registry:{...header.registry},projectId:first.projectId,expectedRevision:refData(first.revision),idempotencyKey:'must-conflict',metadata:createRequest('x','Stale draft').metadata};
  e.mutateNext(()=>change(request,'expectedRevision',refData(second.revision)));
  const result=await e.repo.updateMetadata(e.context,request);assert.equal(result.kind,'conflict');if(result.kind==='conflict')assert.equal(result.reason,'EXPECTED_REVISION_MISMATCH');
  assert.equal(e.store.head('fixture-account-A',first.projectId)?.manifest.revision.id,second.revision.id);
  assert.equal(e.store.database.prepare('SELECT count(*) AS n FROM receipts WHERE key=?').get('must-conflict')?.n,0);assertAtomicCounts(e,2);
 }finally{e.store.close();}
});
for(const field of ['redirect-source','source-project','source-digest']){
 test('S3-01 restore mutation after snapshot: '+field,async()=>{
  const e=mutatingEnvironment();
  try{
   const first=receipt(await e.repo.create(e.context,createRequest('original','Original source')));
   const second=receipt(await e.repo.updateMetadata(e.context,{...header,projectId:first.projectId,expectedRevision:refData(first.revision),idempotencyKey:'second',metadata:createRequest('x','Second source').metadata}));
   const request:RestoreProjectRequest={...header,registry:{...header.registry},projectId:first.projectId,expectedRevision:refData(second.revision),sourceRevision:refData(first.revision),idempotencyKey:'restore-snapshot-'+field};
   const verified=structuredClone(request),source=e.store.revision('fixture-account-A',first.projectId,first.revision.id);assert.ok(source);
   e.mutateNext(()=>{
    if(field==='redirect-source')change(request,'sourceRevision',refData(second.revision));
    if(field==='source-project')change(request.sourceRevision,'projectId','prj_00000003-0000-4000-8000-000000000000');
    if(field==='source-digest')change(request.sourceRevision.integrity,'value','0'.repeat(64));
   });
   const saved=receipt(await e.repo.restore(e.context,request));assert.equal(saved.restoredFromRevisionId,first.revision.id);assert.equal(saved.parentRevisionId,second.revision.id);assertBoundWrite(e,verified,saved,e.store.metadata(source.manifest));
   assert.equal(receipt(await e.repo.restore(e.context,verified)).replayed,true);assertAtomicCounts(e,3);
  }finally{e.store.close();}
 });
}
for(const operation of ['read','list','history','revision'] as const){
 test('S3-01 read snapshot is independent of caller mutation: '+operation,async()=>{
  const e=environment();
  try{
   const a=receipt(await e.repo.create(e.context,createRequest('a','Project A'))),b=receipt(await e.repo.create(e.context,createRequest('b','Project B')));
   if(operation==='list'){
    const request={...header,registry:{...header.registry},cursor:null};afterValidated(e,()=>change(request,'cursor','unsupported-after-validation'));
    const result=await e.repo.list(e.context,request);assert.equal(result.kind,'project-page');if(result.kind==='project-page')assert.equal(result.projects.length,2);
   }else if(operation==='read'){
    const request={...header,registry:{...header.registry},projectId:a.projectId};afterValidated(e,()=>change(request,'projectId',b.projectId));
    const result=await e.repo.read(e.context,request);assert.equal(result.kind,'project');if(result.kind==='project')assert.equal(result.project.projectId,a.projectId);
   }else if(operation==='history'){
    const request={...header,registry:{...header.registry},projectId:a.projectId,cursor:null};afterValidated(e,()=>change(request,'projectId',b.projectId));
    const result=await e.repo.history(e.context,request);assert.equal(result.kind,'revision-page');if(result.kind==='revision-page')assert.equal(result.revisions[0].revision.projectId,a.projectId);
   }else{
    const request={...header,registry:{...header.registry},projectId:a.projectId,revision:refData(a.revision)};
    afterValidated(e,()=>change(request.revision.integrity,'value','0'.repeat(64)));
    const result=await e.repo.revision(e.context,request);assert.equal(result.kind,'revision');if(result.kind==='revision')assert.equal(result.revision.revision.id,a.revision.id);
   }
   assertAtomicCounts(e,2,2);
  }finally{e.store.close();}
 });
}
