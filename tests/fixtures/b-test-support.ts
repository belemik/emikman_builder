import assert from 'node:assert/strict';
import {createBTestVolume,adoptBTestVolume} from '../../server/projects/b-test-volume';
import {BTestLedger} from '../../server/projects/b-test-ledger';
import {BTestRepository,type BFault,type BResult} from '../../server/projects/b-test-repository';
import {createTestPrincipalBoundary} from '../../server/projects/verified-principal';
import {inspectTestFoundationPolicy,FOUNDATION_TEST_PROFILE} from '../../server/projects/server-foundation-policy';
import {createTestCommandCandidate} from '../../server/projects/test-command-candidate';
export {header,createRequest} from './p03-support';
export function candidate(op:string,body:object){const bytes=new TextEncoder().encode(JSON.stringify(body));const c=createTestCommandCandidate(op,bytes);assert.equal(c.kind,'candidate');if(c.kind!=='candidate')throw Error('candidate');return c.candidate;}
export function committed(r:BResult){assert.equal(r.kind,'committed');if(r.kind!=='committed')throw Error('commit');return r;}
export function environment(options:{main?:string;ledger?:string;fault?:(stage:BFault)=>void}={}){
 const main=options.main?adoptBTestVolume(options.main):createBTestVolume('main'),volume=options.ledger?adoptBTestVolume(options.ledger):createBTestVolume('ledger'),ledger=new BTestLedger(volume);
 let now=Date.parse('2026-11-14T00:00:00.000Z'),live=true;const key={},otherKey={},identity={},otherIdentity={};let repo:BTestRepository;
 const policy=inspectTestFoundationPolicy(FOUNDATION_TEST_PROFILE);if(policy.kind!=='test-policy-ready')throw Error('policy');
 const auth=createTestPrincipalBoundary(policy.policy,{now:()=>now,resolveSession:k=>!live&&k===key?null:k===key?{identity,accountId:'a'.repeat(32),generation:1,expiresAt:now+1000000}:k===otherKey?{identity:otherIdentity,accountId:'b'.repeat(32),generation:1,expiresAt:now+1000000}:null,resolveResource:(k,id)=>repo?.ownership(k,id)??null});if(auth.kind!=='test-boundary-ready')throw Error('auth');
 repo=new BTestRepository(main,ledger,auth.boundary,()=>now,options.fault);
 const capture=(k:object)=>{const p=auth.boundary.capture(k);if(p.kind!=='test-principal-captured')throw Error('principal');return p.principal;};
 return {main,volume,repo,ledger,principal:capture(key),other:capture(otherKey),revoke:()=>{live=false;},advance:(ms:number)=>{now+=ms;},close:()=>{repo.close();ledger.close();}};
}
export function counts(e:ReturnType<typeof environment>){return ['projects','revisions','receipts','operation_status','audit'].map(t=>Number(e.repo.database.prepare('SELECT count(*) n FROM '+t).get()?.n));}
