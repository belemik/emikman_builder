import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {createTestCommandCandidate,inspectTestCandidate,discardTestCandidate} from '../server/projects/test-command-candidate';
import {createOwnedHandoffTestOnly,takeOwnedHandoffTestOnly,decodeProjectCommandTestOnly} from '../server/projects/decode-project-command';
import {createRequest,header} from './fixtures/p03-support';
import type {RequestJson} from '../src/projects/repository.dto';
const encode=(value:object)=>new TextEncoder().encode(JSON.stringify(value));
function make(op='create-project',data:object=createRequest()) { const r=createTestCommandCandidate(op,encode(data));assert.equal(r.kind,'candidate');if(r.kind!=='candidate')throw Error();return r.candidate; }
test('R2 one scan handoff owns bytes and immutable data; identity one use',()=>{
 const input=encode(createRequest());const h=createOwnedHandoffTestOnly('create-project',input);assert.ok(h.handle);
 input.fill(0);const owned=takeOwnedHandoffTestOnly(h.handle);assert.ok(owned);assert.equal(owned.data.idempotencyKey,'retry-1');
 assert.ok(Object.isFrozen(owned.data));assert.equal(takeOwnedHandoffTestOnly(h.handle),null);assert.equal(takeOwnedHandoffTestOnly({}),null);
 assert.equal(Object.hasOwn(decodeProjectCommandTestOnly('create-project',encode(createRequest())),'handle'),false);
});
test('R2 fingerprint deterministic semantic, raw bytes distinct with whitespace, no authority',()=>{
 const a=make(),b=createTestCommandCandidate('create-project',new TextEncoder().encode(JSON.stringify(createRequest(),null,2)));
 assert.equal(b.kind,'candidate');if(b.kind!=='candidate')throw Error();assert.equal(a.fingerprint,b.candidate.fingerprint);assert.notEqual(a.rawSha256,b.candidate.rawSha256);
 assert.equal(a.rawSha256,createHash('sha256').update(encode(createRequest())).digest('hex'));assert.equal(a.productionAuthority,'NOT_GRANTED');
 assert.ok(Object.isFrozen(a));assert.equal(Object.hasOwn(a,'data'),false);assert.equal(inspectTestCandidate({...a}),null);
 discardTestCandidate(a);assert.equal(inspectTestCandidate(a),null);
});
for(const field of ['metadata','idempotencyKey','projectId','expectedRevision','sourceRevision']) test(`R2 S3-01 mutation ${field} after owned copy`,()=>{
 const projectId='prj_00000001-0000-4000-8000-000000000000';const ref={kind:'project',id:'prv_00000001-0000-4000-8000-000000000000',projectId,integrity:{algorithm:'sha256',encoding:'hex-lower',byteDomain:'zarya.project-manifest.jcs/v1',value:'a'.repeat(64)}};
 const request={...header,projectId,expectedRevision:ref,sourceRevision:ref,idempotencyKey:'original'};const source=field==='metadata'?createRequest():request;const op=field==='metadata'?'create-project':'restore-project';
 const input=encode(source),baseline=createTestCommandCandidate(op,input);assert.equal(baseline.kind,'candidate');if(baseline.kind!=='candidate')throw Error();
 const original=TextDecoder.prototype.decode;const replacement=mock.method(TextDecoder.prototype,'decode',function(this:TextDecoder,...args:Parameters<TextDecoder['decode']>){input.fill(0);return Reflect.apply(original,this,args);});
 let result;try{input.set(encode(source));result=createTestCommandCandidate(op,input);}finally{replacement.mock.restore();}
 assert.equal(result.kind,'candidate');if(result.kind!=='candidate')throw Error();assert.equal(result.candidate.fingerprint,baseline.candidate.fingerprint);
 if('metadata' in source)Reflect.set(source.metadata,'name','CHANGED');else Reflect.set(source,field,'CHANGED');
 assert.equal(result.candidate.fingerprint,baseline.candidate.fingerprint);assert.ok(Object.isFrozen(inspectTestCandidate(result.candidate)?.data));
 const owned:RequestJson[]=[inspectTestCandidate(result.candidate)!.data];
 while(owned.length){const v=owned.pop()!;if(v!==null&&typeof v==='object'){assert.ok(Object.isFrozen(v));assert.equal(Reflect.set(v,'__test_mutation','changed'),false);owned.push(...Object.values(v));}}
 const changed=createTestCommandCandidate(op,encode(source));
 if(changed.kind==='candidate')assert.notEqual(changed.candidate.fingerprint,baseline.candidate.fingerprint);
 else assert.equal(changed.report.kind,'rejected');
});
test('R2 nested immutable fields, exact op/version and failure cannot mint',()=>{
 const c=make(),data=inspectTestCandidate(c)!.data;assert.ok(Object.isFrozen(data.metadata));
 assert.equal(Reflect.set(data,'idempotencyKey','CHANGED'),false);
 for(const input of [new TextEncoder().encode('{'),encode({...createRequest(),dtoVersion:'bad'}),encode({...createRequest(),accountId:'fake'})])assert.equal(createTestCommandCandidate('create-project',input).kind,'rejected');
 assert.equal(createTestCommandCandidate('apply',encode(createRequest())).kind,'rejected');assert.equal(inspectTestCandidate({}),null);
});
