import {test} from 'node:test';import assert from 'node:assert/strict';
import {testEnvironment,candidate,createRequest,receipt,header} from './fixtures/p04-support';
import {inspectTestCandidate,discardTestCandidate} from '../server/projects/test-command-candidate';
const counts=(e:ReturnType<typeof testEnvironment>)=>e.store.database.prepare('SELECT (SELECT count(*) FROM revisions) r,(SELECT count(*) FROM receipts) c,(SELECT count(*) FROM audit) a').get();
test('R4 create/read/history/revision/update/create-revision/softdelete/restore through candidate + session',async()=>{
 const e=testEnvironment(),a=e.sessions.issue('fixture-account-A');try {
 const original=createRequest('first','Original'),c=candidate('create-project',original);Reflect.set(original.metadata,'name','AFTER');
 const r=await e.repository.execute(a,c);assert.equal(r.kind,'committed');if(r.kind!=='committed')throw Error();const first=r.receipt;
 assert.ok(first.projectId.startsWith('prj_'));assert.ok(first.revision.id.startsWith('prv_'));
 const read=await e.repository.execute(a,candidate('read-project',{...header,projectId:first.projectId}));assert.equal(read.kind,'project');if(read.kind!=='project')throw Error();assert.equal(read.project.metadata.name,'Original');
 const update=await e.repository.execute(a,candidate('update-metadata',{...header,projectId:first.projectId,expectedRevision:first.revision,idempotencyKey:'update',metadata:{...original.metadata,name:'Updated'}}));assert.equal(update.kind,'committed');if(update.kind!=='committed')throw Error();
 const newer=await e.repository.execute(a,candidate('create-revision',{...header,projectId:first.projectId,expectedRevision:update.receipt.revision,idempotencyKey:'rev',metadata:{...original.metadata,name:'Snapshot'}}));assert.equal(newer.kind,'committed');if(newer.kind!=='committed')throw Error();
 const deleted=await e.repository.execute(a,candidate('soft-delete-project',{...header,projectId:first.projectId,expectedRevision:newer.receipt.revision,idempotencyKey:'delete'}));assert.equal(deleted.kind,'committed');if(deleted.kind!=='committed')throw Error();
 const list=await e.repository.execute(a,candidate('list-projects',{...header,cursor:null}));assert.equal(list.kind,'project-page');if(list.kind!=='project-page')throw Error();assert.equal(list.projects.length,0);
 const restored=await e.repository.execute(a,candidate('restore-project',{...header,projectId:first.projectId,expectedRevision:deleted.receipt.revision,sourceRevision:first.revision,idempotencyKey:'restore'}));assert.equal(restored.kind,'committed');if(restored.kind!=='committed')throw Error();assert.equal(restored.receipt.parentRevisionId,deleted.receipt.revision.id);assert.equal(restored.receipt.restoredFromRevisionId,first.revision.id);
 const history=await e.repository.execute(a,candidate('list-revisions',{...header,projectId:first.projectId,cursor:null}));assert.equal(history.kind,'revision-page');if(history.kind!=='revision-page')throw Error();assert.equal(history.revisions.length,5);
 assert.equal((await e.repository.execute(a,candidate('read-revision',{...header,projectId:first.projectId,revision:first.revision}))).kind,'revision');
 e.repository.verify();assert.deepEqual({...counts(e)},{r:5,c:5,a:5});
 }finally{e.store.close();}
});
test('R4 auth before retries, owner scope and candidate identity; rejects do not write',async()=>{
 const e=testEnvironment(),a=e.sessions.issue('fixture-account-A'),b=e.sessions.issue('fixture-account-B');try {
 const c=candidate('create-project',createRequest()),result=await e.repository.execute(a,c);assert.equal(result.kind,'committed');if(result.kind!=='committed')throw Error();const before=counts(e);
 assert.equal((await e.repository.execute(b,c)).kind,'test-denied');
 const foreign=await e.repository.execute(b,candidate('read-project',{...header,projectId:result.receipt.projectId}));assert.equal(foreign.kind,'not-found');assert.ok(!JSON.stringify(foreign).includes(result.receipt.projectId));
 e.sessions.denyOperation(a,'create-project');const denied=await e.repository.execute(a,c);assert.equal(denied.kind,'test-denied');if(denied.kind!=='test-denied')throw Error();assert.equal(denied.status,403);
 e.sessions.revoke(a);const revoked=await e.repository.execute(a,c);assert.equal(revoked.kind,'test-denied');if(revoked.kind!=='test-denied')throw Error();assert.equal(revoked.status,401);
 assert.equal((await e.repository.execute(b,{...c})).kind,'test-denied');discardTestCandidate(c);assert.equal(inspectTestCandidate(c),null);assert.deepEqual(counts(e),before);
 }finally{e.store.close();}
});
test('R4 fingerprint replay, changed command conflict, stale/digest mismatches, unchanged data on refusal',async()=>{
 const e=testEnvironment(),a=e.sessions.issue('fixture-account-A');try {
 const body=createRequest('same-key'),one=await e.repository.execute(a,candidate('create-project',body));assert.equal(one.kind,'committed');if(one.kind!=='committed')throw Error();
 const retry=await e.repository.execute(a,candidate('create-project',body));assert.equal(retry.kind,'committed');if(retry.kind!=='committed')throw Error();assert.equal(retry.receipt.replayed,true);assert.equal(retry.receipt.projectId,one.receipt.projectId);
 assert.equal((await e.repository.execute(a,candidate('create-project',createRequest('same-key','Changed')))).kind,'conflict');
 const bad={...one.receipt.revision,integrity:{...one.receipt.revision.integrity,value:'b'.repeat(64)}};
 const before=counts(e);assert.equal((await e.repository.execute(a,candidate('soft-delete-project',{...header,projectId:one.receipt.projectId,expectedRevision:bad,idempotencyKey:'bad'}))).kind,'conflict');assert.deepEqual(counts(e),before);e.repository.verify();
 }finally{e.store.close();}
});
test('R4 R1 accepted input can exceed explicit P03 allocation budget: fail without writes',async()=>{
 const e=testEnvironment(),a=e.sessions.issue('fixture-account-A');try {
 const r=await e.repository.execute(a,candidate('create-project',{...createRequest(),metadata:{name:'x',description:'a'.repeat(40000),defaultProductRef:null}}));assert.equal(r.kind,'unavailable');assert.equal(counts(e)?.r,0);
 }finally{e.store.close();}
});
