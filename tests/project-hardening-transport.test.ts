import {test} from 'node:test';import assert from 'node:assert/strict';
import {fork} from 'node:child_process';import {fileURLToPath} from 'node:url';import {writeFileSync,readFileSync} from 'node:fs';import {join} from 'node:path';
import {decodeProjectCommandTestOnly} from '../server/projects/decode-project-command';
import {startTestHttpHarness,TEST_HTTP_PROFILE} from '../server/projects/test-http-harness';
import {testEnvironment,createRequest} from './fixtures/p04-support';
function probe(mode:string) {
 const child=fork(fileURLToPath(new URL('./fixtures/hardening-decoder-worker.ts',import.meta.url)),[mode],{execArgv:['--import','tsx'],stdio:['ignore','ignore','pipe','ipc']});
 const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
 const message=new Promise<unknown>((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);child.once('exit',()=>reject(Error('NO_MESSAGE')));});
 return {child,exit,message};
}
test('H3 isolated decoder CPU/memory observations include process high-water RSS; not hard quotas',async()=>{
 const p=probe('measure');const observation=await p.message;await p.exit;
 assert.ok(observation&&typeof observation==='object'&&'maxRssKiB'in observation&&typeof observation.maxRssKiB==='number'&&observation.maxRssKiB>0);
 const dir=process.env.HARDENING_EVIDENCE_DIR;if(dir)writeFileSync(join(dir,'H3-resource-observations.json'),JSON.stringify(observation,null,2)+'\n');
});
test('H3 external watchdog terminates CPU-bound fixture child; no same-thread timer claim',async()=>{
 const p=probe('spin');assert.deepEqual(await p.message,{kind:'spinning'});
 const timer=setTimeout(()=>p.child.kill('SIGKILL'),50);try{assert.deepEqual(await p.exit,{code:null,signal:'SIGKILL'});}finally{clearTimeout(timer);}
});
test('H3 actual input bytes count astral Unicode; decoded duplicates refused without normalization',()=>{
 const encode=(s:string)=>new TextEncoder().encode(s);
 const raw=JSON.stringify(createRequest('unicode','😀 e\u0301'));assert.ok(encode(raw).length>raw.length);
 assert.equal(decodeProjectCommandTestOnly('create-project',encode(raw)).kind,'test-dto-inspected');
 const duplicate=raw.replace('"name":','"name":"first","na\\u006de":');assert.notEqual(decodeProjectCommandTestOnly('create-project',encode(duplicate)).kind,'test-dto-inspected');
 assert.notEqual(decodeProjectCommandTestOnly('create-project',new Uint8Array(262145)).kind,'test-dto-inspected');
});
test('H3 GET query rejects duplicate decoded names, unsupported cursor, foreign scope; output guard is postserialization',async()=>{
 const e=testEnvironment(),token=e.sessions.issue('fixture-account-A'),http=await startTestHttpHarness(e.repository,e.sessions);
 try {
 const headers={Authorization:'Bearer '+token};
 for(const [path,status] of [['?cursor=x&%63ursor=y',400],['?cursor=x',422],['?other=x',400],['?limit=%ZZ',400]] as const)assert.equal((await fetch(http.url+'/test/v0/projects'+path,{headers})).status,status);
 assert.equal((await fetch(http.url+'/test/v0/projects',{headers})).status,200);
 const source=readFileSync(new URL('../server/projects/test-http-harness.ts',import.meta.url),'utf8');
 assert.ok(source.indexOf('let data=JSON.stringify')<source.indexOf('Buffer.byteLength(data)>TEST_HTTP_PROFILE.responseBytes'));
 assert.equal(TEST_HTTP_PROFILE.responseBytes,262144); // Evidence of existing limitation, NOT fixed production allocation guard.
 }finally{await http.close();e.store.close();}
});
