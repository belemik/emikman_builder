import assert from 'node:assert/strict';import {dirname} from 'node:path';import {existsSync} from 'node:fs';
import {BTestRepository,type BFault} from '../../server/projects/b-test-repository';import {BTestLedger,text} from '../../server/projects/b-test-ledger';import {createBTestVolume,adoptBTestVolume,type BVolume} from '../../server/projects/b-test-volume';
import {DTestRuntime} from '../../server/projects/d-test-runtime';import {CTestSessions} from '../../server/projects/c-test-sessions';import {createTestPrincipalBoundary} from '../../server/projects/verified-principal';import {inspectTestFoundationPolicy,FOUNDATION_TEST_PROFILE} from '../../server/projects/server-foundation-policy';
export {createRequest,header} from './p03-support';export {candidate} from './b-test-support';
export function dEnvironment(options:{ledger?:string;fault?:(stage:BFault)=>void}={}){
 const volume=options.ledger?adoptBTestVolume(options.ledger):createBTestVolume('ledger');if(options.ledger&&!existsSync(volume.databasePath))throw Error('D_MISSING_LEDGER');const ledger=new BTestLedger(volume),sessions=new CTestSessions(),token=sessions.issue('a'.repeat(32)),otherToken=sessions.issue('b'.repeat(32));let runtime:DTestRuntime|undefined,initial:BTestRepository|null=null;
 const p=inspectTestFoundationPolicy(FOUNDATION_TEST_PROFILE);if(p.kind!=='test-policy-ready')throw Error('D_POLICY');
 const a=createTestPrincipalBoundary(p.policy,{now:Date.now,resolveSession:k=>sessions.resolve(k),resolveResource:(k,id)=>{try{return (runtime?.repository??initial)?.ownership(k,id)??null;}catch{return null;}}});if(a.kind!=='test-boundary-ready')throw Error('D_AUTH');
 const open=(v:BVolume,l:BTestLedger)=>new BTestRepository(v,l,a.boundary,Date.now,options.fault);
 try{const path=text(ledger.meta(),'path'),main=path?adoptBTestVolume(dirname(path)):createBTestVolume('main');try{initial=open(main,ledger);}catch{if(!path)throw Error('D_NEW_STORE');}runtime=new DTestRuntime(ledger,initial,open);
  const capture=(t:string)=>{const x=a.boundary.capture(sessions.get(t)?.key);if(x.kind!=='test-principal-captured')throw Error('D_PRINCIPAL');return x.principal;};
  return {runtime,ledger,volume,sessions,token,otherToken,principal:capture(token),other:capture(otherToken),capture,close:()=>runtime?.close()};
 }catch(e){initial?.close();ledger.close();throw e;}
}
export function dCommit(r:ReturnType<DTestRuntime['execute']>){assert.equal(r.kind,'committed');if(r.kind!=='committed')throw Error('D_EXPECTED_COMMIT');return r.receipt;}
export function dCounts(e:ReturnType<typeof dEnvironment>){return ['projects','revisions','receipts','operation_status','audit'].map(t=>Number(e.runtime.repository.database.prepare('SELECT count(*) n FROM '+t).get()?.n));}
