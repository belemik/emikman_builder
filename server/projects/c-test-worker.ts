import {workerData,parentPort} from 'node:worker_threads';
import {C_TEST_PROFILE as P,cRecord,isCOperation,type CJob,type CReply,type CStorageDiagnostic} from './c-test-policy';
import {adoptBTestVolume} from './b-test-volume';import {BTestLedger} from './b-test-ledger';import {BTestRepository} from './b-test-repository';
import {createTestPrincipalBoundary,type TestResourceReference} from './verified-principal';import {inspectTestFoundationPolicy,FOUNDATION_TEST_PROFILE} from './server-foundation-policy';
import {createTestCommandCandidate,createTestReadCandidate,createWebPageRepositoryCandidate,inspectTestCandidate,inspectWebPageRepositoryCandidate} from './test-command-candidate';
import { CREATE_WEB_PAGE_PROJECT, LIST_WEB_PAGE_DOCUMENTS, READ_WEB_PAGE, SAVE_WEB_PAGE } from '../../src/projects/web-page-repository.dto';
import { isCFault, isCWebJob } from './c-test-web-page-policy';
/** Only our parent worker-client creates this bounded internal bootstrap record. Not wire authority. */
function job(v:unknown):v is CJob {return cRecord(v)&&typeof v.main==='string'&&typeof v.ledger==='string'&&typeof v.account==='string'&&/^[ab]{32}$/.test(v.account)&&typeof v.expires==='number'&&Number.isSafeInteger(v.expires)&&v.state instanceof SharedArrayBuffer&&v.state.byteLength===4&&((v.webPageProfile===true||v.webPageProfile==='workspace-v1')?isCWebJob(v.operation,v.mode,v.webPageProfile==='workspace-v1'):v.webPageProfile===undefined&&isCOperation(v.operation)&&['command','reconcile','read'].includes(String(v.mode)))&&v.bytes instanceof Uint8Array&&v.bytes.byteLength<=P.bodyBytes&&(v.project===null||typeof v.project==='string')&&typeof v.target==='string'&&v.target.length<=P.targetBytes&&(v.diagnostic===undefined||v.diagnostic===true)&&isCFault(v.fault);}
const input:unknown=workerData;if(!job(input))throw Error('C_BOOTSTRAP');const j=input;
if(j.fault==='spin')while(true){/* parent watchdog terminates this worker */}
const ledger=new BTestLedger(adoptBTestVolume(j.ledger)),key={},identity={};let repo:BTestRepository|undefined;
let stage:CStorageDiagnostic['stage']='not-observed',sqlite:CStorageDiagnostic['sqlite']=null;
try {
 const policy=inspectTestFoundationPolicy(FOUNDATION_TEST_PROFILE);if(policy.kind!=='test-policy-ready')throw Error('C_POLICY');
 const auth=createTestPrincipalBoundary(policy.policy,{now:Date.now,resolveSession:k=>k===key&&Atomics.load(new Int32Array(j.state),0)===1?{identity,accountId:j.account,generation:1,expiresAt:j.expires}:null,resolveResource:(k,id)=>repo?.ownership(k,id)??null});if(auth.kind!=='test-boundary-ready')throw Error('C_AUTH');
 repo=new BTestRepository(adoptBTestVolume(j.main),ledger,auth.boundary,Date.now,s=>{
  if(j.diagnostic){
   switch(s){
    case 'after-intent': stage='intent-prepared'; break;
    case 'before-main': stage='before-begin'; break;
    case 'before-commit': stage='in-transaction'; break;
    case 'after-main-commit': stage='main-committed'; break;
    case 'after-ledger-commit': stage='ledger-finalized'; break;
   }
  }
  if(s==='after-main-commit'&&j.fault==='revoke-after-commit')Atomics.store(new Int32Array(j.state),0,0);
  if(s==='before-commit'&&(j.operation===SAVE_WEB_PAGE||j.operation===CREATE_WEB_PAGE_PROJECT)&&j.fault==='before-web-commit')throw Error('C_TEST_INJECTED');
 },{webPageProfile:j.webPageProfile,onSqliteContention:j.diagnostic?code=>{sqlite=code;}:undefined});
 if(j.webPageProfile&&(!repo.current()||ledger.meta().mode!=='ACTIVE'))throw Error('C_RECOVERY');
 const captured=auth.boundary.capture(key);if(captured.kind!=='test-principal-captured')throw Error('C_SESSION');
 let handle:object;
 if(j.mode==='read'){
  if(j.operation!=='read-project'&&j.operation!=='list-projects'&&j.operation!=='list-revisions')throw Error('C_READ');handle=createTestReadCandidate(j.operation,j.project,j.target);
 }else{const c=(j.webPageProfile?createWebPageRepositoryCandidate:createTestCommandCandidate)(j.operation,j.bytes);if(c.kind!=='candidate'){parentPort?.postMessage({kind:'c-rejected'});process.exitCode=0;handle={};}else handle=c.candidate;}
 const snap=(j.webPageProfile?inspectWebPageRepositoryCandidate:inspectTestCandidate)(handle);
 if(snap&&j.webPageProfile==='workspace-v1'&&j.operation===SAVE_WEB_PAGE&&snap.data.documentId===null){
  parentPort?.postMessage({kind:'c-rejected'});
 }else if(snap){const refs:TestResourceReference[]=[];const project=j.operation==='create-project'||j.operation==='list-projects'||j.operation===CREATE_WEB_PAGE_PROJECT||j.operation===LIST_WEB_PAGE_DOCUMENTS?null:snap.data.projectId;if(project!==null){if(typeof project!=='string')throw Error('C_SCOPE');refs.push({kind:'project',id:project,projectId:null});}
  if(j.operation==='read-revision'||j.operation==='restore-project'||j.operation===READ_WEB_PAGE){const source=j.operation==='restore-project'?snap.data.sourceRevision:snap.data.revision;if(!cRecord(source)||typeof source.id!=='string')throw Error('C_SCOPE');refs.push({kind:'revision',id:source.id,projectId:project});}
  const result=j.mode==='reconcile'?repo.reconcile(captured.principal,handle):repo.execute(captured.principal,handle);  const wire=result.kind==='web-page'
   ? {...result,document:{...result.document,payload:Buffer.from(result.document.payload).toString('base64')}} : result;
  const body=JSON.stringify(wire);if(Buffer.byteLength(body)>P.internalBytes)throw Error('C_INTERNAL_BUDGET');const reply:CReply={kind:'c-reply',body,refs,...(j.diagnostic?{diagnostic:{stage,sqlite}}:{}),...(j.webPageProfile?{webPageEdit:j.operation===SAVE_WEB_PAGE&&typeof snap.data.documentId==='string'}:{})};parentPort?.postMessage(reply);
 }
}finally{repo?.close();ledger.close();}
