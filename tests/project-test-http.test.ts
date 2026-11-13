import {request as rawRequest} from 'node:http';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {startTestHttpHarness} from '../server/projects/test-http-harness';
import {testEnvironment,createRequest,header} from './fixtures/p04-support';
import {PROJECT_INGEST_TEST_PROFILE as profile} from '../server/projects/ingest-profile';
async function env(){const e=testEnvironment(),http=await startTestHttpHarness(e.repository,e.sessions);return {...e,http,a:e.sessions.issue('fixture-account-A'),b:e.sessions.issue('fixture-account-B'),close:async()=>{await http.close();e.store.close();}};}
const headers=(url:string,session:string)=>({Authorization:'Bearer '+session,Origin:url,'Content-Type':'application/json','x-test-decoder-profile':profile.id});
async function post(e:Awaited<ReturnType<typeof env>>,op:string,body:object|string,session=e.a,extra:Record<string,string>={}) {
 return fetch(e.http.url+'/test/v0/commands/'+op,{method:'POST',headers:{...headers(e.http.url,session),...extra},body:typeof body==='string'?body:JSON.stringify(body)});
}
test('R5 real loopback HTTP full lifecycle, GET separate policy and no pagination claims',async()=>{
 const e=await env();try{
 const created=await post(e,'create-project',createRequest());assert.equal(created.status,200);const one=(await created.json()).result.receipt;
 const get=await fetch(e.http.url+'/test/v0/projects/'+one.projectId,{headers:headers(e.http.url,e.a)});assert.equal(get.status,200);assert.equal((await get.json()).result.project.metadata.name,'Fixture project');
 const updated=await post(e,'update-metadata',{...header,projectId:one.projectId,expectedRevision:one.revision,idempotencyKey:'upd',metadata:{...createRequest().metadata,name:'Updated'}});assert.equal(updated.status,200);const two=(await updated.json()).result.receipt;
 const revised=await post(e,'create-revision',{...header,projectId:one.projectId,expectedRevision:two.revision,idempotencyKey:'revision',metadata:{...createRequest().metadata,name:'Third'}});assert.equal(revised.status,200);const three=(await revised.json()).result.receipt;
 const history=await fetch(e.http.url+'/test/v0/projects/'+one.projectId+'/history',{headers:headers(e.http.url,e.a)});assert.equal(history.status,200);const h=await history.json();assert.equal(h.result.revisions.length,3);assert.equal(h.pagination,'BOUNDED_NO_PAGINATION_TEST_ONLY');
 assert.equal((await post(e,'read-revision',{...header,projectId:one.projectId,revision:one.revision})).status,200);
 const deleted=await post(e,'soft-delete-project',{...header,projectId:one.projectId,expectedRevision:three.revision,idempotencyKey:'delete'});assert.equal(deleted.status,200);const del=(await deleted.json()).result.receipt;
 const restored=await post(e,'restore-project',{...header,projectId:one.projectId,expectedRevision:del.revision,sourceRevision:one.revision,idempotencyKey:'restore'});assert.equal(restored.status,200);assert.equal((await restored.json()).result.receipt.restoredFromRevisionId,one.revision.id);
 const list=await fetch(e.http.url+'/test/v0/projects',{headers:headers(e.http.url,e.a)});assert.equal(list.status,200);assert.equal((await list.json()).result.projects.length,1);e.repository.verify();
 }finally{await e.close();}
});
test('R5 exact 400/401/403/404/409/413/422/428 refusals and no foreign content',async()=>{
 const e=await env();try{
 assert.equal((await post(e,'create-project','{')).status,400);
 assert.equal((await post(e,'create-project',createRequest(),'forged')).status,401);
 assert.equal((await post(e,'create-project',createRequest(),e.a,{Origin:'http://foreign.invalid'})).status,403);
 assert.equal((await post(e,'create-project',{...createRequest(),ownerId:'fake'})).status,422);
 assert.equal((await post(e,'create-project',createRequest(),e.a,{'x-test-decoder-profile':'production'})).status,422);
 assert.equal((await post(e,'update-metadata',{...header,projectId:'prj_00000001-0000-4000-8000-000000000000',idempotencyKey:'no-guard',metadata:createRequest().metadata})).status,428);
 // Streamed chunks, no caller Content-Length trust. First over-limit chunk refuses safely.
 const oversized=await post(e,'create-project',' '.repeat(profile.bodyBytes+1));assert.equal(oversized.status,413);
 const first=await post(e,'create-project',createRequest('private-key','DO_NOT_LEAK'));assert.equal(first.status,200);const receipt=(await first.json()).result.receipt;
 const foreign=await fetch(e.http.url+'/test/v0/projects/'+receipt.projectId,{headers:headers(e.http.url,e.b)});assert.equal(foreign.status,404);const text=await foreign.text();assert.ok(!text.includes('DO_NOT_LEAK'));assert.ok(!text.includes(receipt.projectId));
 assert.equal((await post(e,'create-project',createRequest('private-key','CHANGED'))).status,409);
 e.repository.verify();assert.equal(e.store.database.prepare('SELECT count(*) n FROM revisions').get()?.n,1);
 }finally{await e.close();}
});
for(const suffix of ['?x=1','?cursor=a&cursor=b','?cursor=a&%63ursor=b','?cursor=%GG','?cursor=%ff','?limit=1&unknown=x','/../private','/%2e%2e','/%70rj_bad','\\private','#fragment']) {
 test('R5 strict raw query/path rejection '+suffix,async()=>{const e=await env();try{
  const status=await new Promise<number>((resolve,reject)=>{
   const req=rawRequest({host:'127.0.0.1',port:new URL(e.http.url).port,path:'/test/v0/projects'+suffix,method:'GET',headers:headers(e.http.url,e.a)},res=>{res.resume();res.on('end',()=>resolve(res.statusCode??0));});
   req.on('error',reject);req.end();
  });assert.ok([400,422].includes(status));
 }finally{await e.close();}});
}
test('R5 pagination cursor/limit explicitly unsupported, not a production implementation',async()=>{
 const e=await env();try{for(const q of ['?cursor=opaque','?limit=10','?cursor='])assert.equal((await fetch(e.http.url+'/test/v0/projects'+q,{headers:headers(e.http.url,e.a)})).status,422);}finally{await e.close();}
});
