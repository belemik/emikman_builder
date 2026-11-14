import {existsSync} from 'node:fs';
import {BTestRepository,type BResult} from './b-test-repository';import {BTestLedger,text,number} from './b-test-ledger';import {assertBTestVolume,type BVolume} from './b-test-volume';
import {DTestControl,dState,type DState,type DCode} from './d-test-control';import {createDBackup,inspectDBackup,copyDRestore,type DFault} from './d-test-backup';import {inspectTestCandidate} from './test-command-candidate';import {CFailure} from './c-test-policy';
type Open=(volume:BVolume,ledger:BTestLedger)=>BTestRepository;
const refusal=()=>({scope:'D_TEST_ONLY' as const,kind:'unknown-outcome' as const,productionAuthority:'NOT_GRANTED' as const,executionPermission:'NOT_GRANTED' as const});
/** Private TEST administrator, never a wire principal, production issuer or real ops API. */
export class DTestRuntime {
 readonly control:DTestControl;#repo:BTestRepository|null;#blocked=false;#closed=false;
 constructor(readonly ledger:BTestLedger,repository:BTestRepository|null,private readonly open:Open){
  this.#repo=repository;const meta=ledger.meta(),fresh=repository!==null&&repository.database.prepare('SELECT count(*) n FROM revisions').get()?.n===0&&ledger.database.prepare('SELECT count(*) n FROM intents').get()?.n===0;
  this.control=new DTestControl(ledger.volume,text(meta,'store_id'),number(meta,'generation'),fresh);
  const previous=this.control.read().state;this.mode(previous==='RECOVERING'?'FENCED':previous==='HEALTHY'?'RECOVERY_REQUIRED':previous,'D_STARTUP');
 }
 get repository():BTestRepository {if(!this.#repo)throw Error('D_REPOSITORY_UNAVAILABLE');return this.#repo;}
 private mode(state:DState,code:DCode,operationId:string|null=null){if(state==='HEALTHY')throw Error('D_EXPLICIT_ADMIT_REQUIRED');this.ledger.locked(()=>{this.ledger.database.exec("UPDATE meta SET mode='FENCED'");this.control.set(state,code,number(this.ledger.meta(),'generation'),operationId);});}
 private core(complete:boolean){
  if(this.#closed||this.#blocked||!existsSync(this.ledger.volume.databasePath))throw Error('D_STORAGE');assertBTestVolume(this.ledger.volume);const repo=this.repository;assertBTestVolume(repo.volume);if(!existsSync(repo.volume.databasePath)||!repo.current())throw Error('D_BINDING');const control=this.control.read(),meta=this.ledger.meta();if(control.store!==meta.store_id||control.generation!==meta.generation)throw Error('D_GENERATION');repo.verifyMain();if(complete&&!repo.consistentLedger())throw Error('D_PENDING');
 }
 private failed(code:DCode){this.#blocked=true;try{this.ledger.locked(()=>this.ledger.database.exec("UPDATE meta SET mode='FENCED'"));}catch{}try{const generation=Math.max(this.control.read().generation,number(this.ledger.meta(),'generation'));this.control.set('FENCED',code,generation);}catch{}}
 private note(code:DCode,operationId:string|null=null){this.ledger.locked(()=>{const state=this.control.read().state;if(state!=='HEALTHY')this.ledger.database.exec("UPDATE meta SET mode='FENCED'");this.control.set(state,code,number(this.ledger.meta(),'generation'),operationId);});}
 health(){
  if(this.#closed)return {live:false,ready:false,state:'RECOVERY_REQUIRED' as DState,code:'D_CONTROL' as DCode};
  try{const row=this.control.read();if(row.state==='HEALTHY'){this.core(true);if(this.ledger.meta().mode!=='ACTIVE')throw Error('D_FENCE');}return {live:true,ready:row.state==='HEALTHY'&&!this.#blocked,state:row.state,code:row.code};}catch{this.failed('D_STORAGE');return {live:true,ready:false,state:'FENCED' as DState,code:'D_STORAGE' as DCode};}
 }
 enter(next:unknown){
  const state=this.control.read().state;const allowed:Record<DState,readonly DState[]>={HEALTHY:['DEGRADED','READ_ONLY','FENCED','RECOVERY_REQUIRED'],DEGRADED:['READ_ONLY','FENCED','RECOVERY_REQUIRED'],READ_ONLY:['FENCED','RECOVERY_REQUIRED'],FENCED:['RECOVERY_REQUIRED','READ_ONLY'],RECOVERY_REQUIRED:['FENCED','READ_ONLY'],RECOVERING:['FENCED','RECOVERY_REQUIRED']};
  if(!dState(next)||!allowed[state].includes(next)){this.failed('D_INVALID_TRANSITION');return false;}try{if(next==='READ_ONLY')this.core(false);this.mode(next,next==='DEGRADED'?'D_DEGRADED':next==='READ_ONLY'?'D_READ_ONLY':next==='FENCED'?'D_FENCED':'D_CHECK_REQUIRED');return true;}catch{this.failed('D_STORAGE');return false;}
 }
 admit():boolean {try{if(this.control.read().state==='RECOVERING')return false;this.#blocked=false;this.ledger.locked(()=>{this.core(true);this.control.set('HEALTHY','D_VALIDATED',number(this.ledger.meta(),'generation'));this.ledger.database.exec("UPDATE meta SET mode='ACTIVE'");});return true;}catch{this.failed('D_STORAGE');return false;}}
 execute(principal:unknown,candidate:object,reconcile=false):BResult|ReturnType<typeof refusal>{
  const snap=inspectTestCandidate(candidate);if(!snap)return refusal();const read=['read-project','list-projects','list-revisions','read-revision'].includes(snap.operation);
  try{const h=this.health();if(!h.ready&&!(h.state==='READ_ONLY'&&read&&!reconcile))return refusal();this.core(!read);const result=reconcile?this.repository.reconcile(principal,candidate):this.repository.execute(principal,candidate);
   if(result.kind==='committed')this.note('D_COMMITTED',result.operationId);else if(result.kind==='conflict')this.note('D_CONFLICT');else if(result.kind==='unknown-outcome'||result.kind==='unavailable')this.failed('D_AMBIGUOUS');return result;
  }catch{this.failed('D_STORAGE');return refusal();}
 }
 httpGuard(repository:BTestRepository){if(!this.health().ready||!repository.current()||repository.volume.databasePath!==this.repository.volume.databasePath)throw new CFailure(503,'D_NOT_READY');}
 async snapshot(target:BVolume,fault?:DFault){try{if(this.control.read().state==='HEALTHY'&&!this.enter('READ_ONLY'))throw Error('D_DRAIN');if(this.control.read().state!=='READ_ONLY')throw Error('D_READ_ONLY_REQUIRED');this.core(true);await createDBackup(this.repository,target,fault);this.mode('READ_ONLY','D_BACKUP_OK');}catch{this.failed('D_BACKUP_FAILED');throw Error('D_BACKUP_FAILED');}}
 async restore(snapshot:BVolume,target:BVolume,fault?:DFault){
  try{
   if(this.control.read().state==='HEALTHY'&&!this.enter('READ_ONLY'))throw Error('D_DRAIN');assertBTestVolume(target);if(target.role!=='main'||existsSync(target.databasePath))throw Error('D_FRESH_TARGET');const meta=this.ledger.meta();if(number(meta,'generation')<this.control.read().generation)throw Error('D_FENCE_ROLLBACK');inspectDBackup(snapshot,text(meta,'store_id'),number(meta,'generation'));
   this.mode('RECOVERING','D_RECOVERING');fault?.('before-restore');const generation=this.ledger.locked(()=>{const g=number(this.ledger.meta(),'generation')+1;if(!Number.isSafeInteger(g))throw Error('D_GENERATION');this.ledger.database.prepare("UPDATE meta SET generation=?,path=?,mode='FENCED'").run(g,target.databasePath);this.control.set('RECOVERING','D_RECOVERING',g);return g;});fault?.('after-fence');
   await copyDRestore(snapshot,target,generation,fault);this.#repo?.close();this.#repo=null;this.#repo=this.open(target,this.ledger);this.#repo.verifyMain();this.#blocked=false;this.mode('RECOVERY_REQUIRED','D_RESTORE_OK');fault?.('after-verification');return target;
  }catch{this.failed('D_RESTORE_FAILED');throw Error('D_RESTORE_FAILED');}
 }
 close(){if(this.#closed)return;try{this.ledger.locked(()=>this.ledger.database.exec("UPDATE meta SET mode='FENCED'"));}catch{}this.#closed=true;this.#repo?.close();this.control.close();this.ledger.close();}
}
