import {test} from 'node:test';import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';import {join} from 'node:path';import {performance} from 'node:perf_hooks';
import {testEnvironment,createRequest,header} from './fixtures/p04-support';
import {startTestHttpHarness,TEST_HTTP_PROFILE} from '../server/projects/test-http-harness';
import {PROJECT_INGEST_TEST_PROFILE as profile} from '../server/projects/ingest-profile';
async function fixture(options:Parameters<typeof startTestHttpHarness>[2]={}){const e=testEnvironment(),a=e.sessions.issue('fixture-account-A'),http=await startTestHttpHarness(e.repository,e.sessions,options);return {...e,a,http,close:async()=>{await http.close();e.store.close();}};}
const headers=(e:Awaited<ReturnType<typeof fixture>>)=>({Authorization:'Bearer '+e.a,Origin:e.http.url,'Content-Type':'application/json','x-test-decoder-profile':profile.id});
const post=(e:Awaited<ReturnType<typeof fixture>>,body:string|ArrayBuffer,signal?:AbortSignal)=>fetch(e.http.url+'/test/v0/commands/create-project',{method:'POST',headers:headers(e),body,signal});
async function until(predicate:()=>boolean){const deadline=performance.now()+2000;while(!predicate()){if(performance.now()>deadline)throw Error('TEST_CONDITION_TIMEOUT');await new Promise<void>(r=>setImmediate(r));}}
test('R6 security wire corpus refuses invalid bytes/duplicates/Unicode/claims/versions with static errors',async()=>{
 const e=await fixture();try{
 const cases:[string|ArrayBuffer,number][]=[['{',400],['{"x":1,"\\u0078":2}',422],['{"\\u005f_proto__":{}}',422],['"\\ud800"',422],['"\\ufdd0"',422],['"'+String.fromCodePoint(0x10ffff)+'"',422],
  [JSON.stringify({...createRequest(),ownerId:'PRIVATE_SENTINEL'}),422],[JSON.stringify({...createRequest(),dtoVersion:'PRIVATE_SENTINEL'}),422],['1e99999',422],['01',400],[new Uint8Array([0xed,0xa0,0x80]).buffer,400]];
 for(const [body,status] of cases){const response=await post(e,body);assert.equal(response.status,status);const text=await response.text();assert.ok(!text.includes('PRIVATE_SENTINEL'));assert.ok(!text.includes('stack'));}
 assert.equal(e.store.database.prepare('SELECT count(*) n FROM revisions').get()?.n,0);
 }finally{await e.close();}
});
test('R6 HTTP resource quotas use actual bytes and aggregate structural/token limits',async()=>{
 const e=await fixture();try{
 const cases=['['.repeat(17)+'null'+']'.repeat(17),'{' + Array.from({length:2049},(_,n)=>`"p${n}":null`).join(',')+'}',
 '['+Array(513).fill('null').join(',')+']',JSON.stringify({['a'.repeat(129)]:null}),JSON.stringify('x'.repeat(65537)),
 '"'+'\\u0061'.repeat(32768)+'"','1'.repeat(129)];
 for(const raw of cases)assert.equal((await post(e,raw)).status,413);
 const raw=JSON.stringify(createRequest('body-boundary')),text=raw+' '.repeat(profile.bodyBytes-Buffer.byteLength(raw));
 assert.equal((await post(e,text)).status,200);assert.equal((await post(e,text+' ')).status,413);assert.equal(e.store.database.prepare('SELECT count(*) n FROM revisions').get()?.n,1);
 }finally{await e.close();}
});
test('R6 bounded admission C1/Q2 rejects saturation and releases every reservation',async()=>{
 let release!:()=>void;const hold=new Promise<void>(r=>release=r);const e=await fixture({beforeDispatch:()=>hold});
 try {
 const first=post(e,JSON.stringify(createRequest('q1')));await until(()=>e.http.metrics().active===1);
 const second=post(e,JSON.stringify(createRequest('q2'))),third=post(e,JSON.stringify(createRequest('q3')));await until(()=>e.http.metrics().queued===2);
 const excess=await post(e,JSON.stringify(createRequest('q4')));assert.equal(excess.status,503);release();
 const results=await Promise.all([first,second,third]);assert.ok(results.every(x=>x.status===200));await until(()=>e.http.metrics().active===0);
 assert.equal(e.http.metrics().peakActive,1);assert.equal(e.http.metrics().peakQueued,2);assert.equal(e.http.metrics().queued,0);assert.equal(e.store.database.prepare('SELECT count(*) n FROM revisions').get()?.n,3);
 }finally{release();await e.close();}
});
test('R6 queued request timeout503 and client cancellation do not write or leak slots',async()=>{
 let release!:()=>void;const hold=new Promise<void>(r=>release=r);const e=await fixture({beforeDispatch:()=>hold});
 try {
 const first=post(e,JSON.stringify(createRequest('active')));await until(()=>e.http.metrics().active===1);
 const expired=await post(e,JSON.stringify(createRequest('expired')));assert.equal(expired.status,503);assert.equal(e.http.metrics().queued,0);
 const abort=new AbortController();const cancelled=post(e,JSON.stringify(createRequest('cancelled')),abort.signal);const rejection=assert.rejects(()=>cancelled);await until(()=>e.http.metrics().queued===1);abort.abort();await rejection;await until(()=>e.http.metrics().queued===0);
 release();assert.equal((await first).status,200);await until(()=>e.http.metrics().active===0);assert.equal(e.store.database.prepare('SELECT count(*) n FROM revisions').get()?.n,1);
 }finally{release();await e.close();}
});
test('R6 active client cancellation after decoding but before dispatch performs no DB write',async()=>{
 let release!:()=>void,entered!:()=>void;const hold=new Promise<void>(r=>release=r),inside=new Promise<void>(r=>entered=r);
 const e=await fixture({beforeDispatch:async()=>{entered();await hold;}});try {
 const abort=new AbortController(),pending=post(e,JSON.stringify(createRequest('active-cancel')),abort.signal),rejection=assert.rejects(()=>pending);await inside;abort.abort();await rejection;await until(()=>e.http.metrics().cancelled>0);release();await until(()=>e.http.metrics().active===0);assert.equal(e.store.database.prepare('SELECT count(*) n FROM revisions').get()?.n,0);
 }finally{release();await e.close();}
});
test('R6 mutable client/source values after validated HTTP candidate cannot change committed data',async()=>{
 let release!:()=>void,entered!:()=>void;const hold=new Promise<void>(r=>release=r),inside=new Promise<void>(r=>entered=r);
 const e=await fixture({beforeDispatch:async()=>{entered();await hold;}});try{
 const source=createRequest('original-key','Verified'),bytes=new TextEncoder().encode(JSON.stringify(source));
 const result=fetch(e.http.url+'/test/v0/commands/create-project',{method:'POST',headers:headers(e),body:bytes});await inside;
 bytes.fill(0);Reflect.set(source.metadata,'name','AFTER');Reflect.set(source,'idempotencyKey','AFTER');release();
 const response=await result;assert.equal(response.status,200);const receipt=(await response.json()).result.receipt;assert.equal(receipt.idempotencyKey,'original-key');assert.equal(e.store.head('fixture-account-A',receipt.projectId)?.manifest.content.metadata.name,'Verified');e.repository.verify();
 }finally{release();await e.close();}
});
test('R6 repeatable LOCAL synthetic CPU/RSS/latency observations; not production benchmark',async()=>{
 const e=await fixture();try {
 const first=await post(e,JSON.stringify(createRequest('perf-start')));assert.equal(first.status,200);let receipt=(await first.json()).result.receipt;
 const N=20,latencies:number[]=[],cpu=process.cpuUsage(),rssBeforeBytes=process.memoryUsage().rss,start=performance.now();let maxSampledRssBytes=rssBeforeBytes;
 for(let i=0;i<N;i++) {
  const t=performance.now();const body={...header,projectId:receipt.projectId,expectedRevision:receipt.revision,idempotencyKey:'perf-'+i,metadata:{...createRequest().metadata,description:'x'.repeat(2000)}};
  const r=await fetch(e.http.url+'/test/v0/commands/update-metadata',{method:'POST',headers:headers(e),body:JSON.stringify(body)});assert.equal(r.status,200);receipt=(await r.json()).result.receipt;latencies.push(performance.now()-t);maxSampledRssBytes=Math.max(maxSampledRssBytes,process.memoryUsage().rss);
 }
 const delta=process.cpuUsage(cpu),sorted=[...latencies].sort((a,b)=>a-b),observation={classification:'LOCAL_TEST_OBSERVATION_NOT_PRODUCTION_BENCHMARK',method:'one loopback process;20 sequential2000-char metadata updates; all responses consumed; no warmup/targetSLA',node:process.version,sqlite:process.versions.sqlite,platform:process.platform,arch:process.arch,samples:N,wallMs:performance.now()-start,cpuUserUs:delta.user,cpuSystemUs:delta.system,rssBeforeBytes,rssAfterBytes:process.memoryUsage().rss,maxSampledRssBytes,latenciesMs:latencies,p50Ms:sorted[9],p95Ms:sorted[18],queue:e.http.metrics(),limits:TEST_HTTP_PROFILE,limitations:['RSS sampled, not isolated per-request peak','No hardCPU/RSS preemption','Not target environment; no production throughput or RPO/RTO claim']};
 assert.equal(observation.queue.active,0);const dir=process.env.P04_EVIDENCE_DIR;if(dir)writeFileSync(join(dir,'R6-resource-observations.json'),JSON.stringify(observation,null,2)+'\n');
 e.repository.verify();
 }finally{await e.close();}
});
