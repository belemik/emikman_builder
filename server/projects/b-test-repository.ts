import {DatabaseSync,backup} from 'node:sqlite';import {readFileSync,existsSync,chmodSync} from 'node:fs';import {randomUUID,createHash} from 'node:crypto';
import type {RequestRecord,RequestJson,RepositoryOperation,WriteOperation,ProjectMetadataDTO,ProjectRevisionReferenceDTO,CommitReceipt,ProjectMetadataSnapshot,ProjectRevisionView} from '../../src/projects/repository.dto';
import type {CanonicalProjectManifestV1} from '../../src/projects/canonicalization.types';
import {canonicalizeJcsData} from '../../src/projects/canonicalize-project';
import {computeManifestIntegrity} from './manifest-integrity';import {createServerIdIssuer} from './server-identities';
import {inspectTestCandidate} from './test-command-candidate';
import type {TestPrincipalBoundary,TestResourceReference} from './verified-principal';
import {assertBTestVolume,createBTestFile,type BVolume} from './b-test-volume';
import {BTestLedger,text,number,type BRow} from './b-test-ledger';
export const B_TEST_PROFILE='zarya.p04.b.store.test/v1';
export const B_FINGERPRINT_PROFILE='zarya.p04.b.command.test/v1';
const limits=Object.freeze({metadataBytes:32768,projects:32,revisions:128,intents:512,receiptWindowMs:60000});
const boundary={scope:'B_TEST_ONLY',productionAuthority:'NOT_GRANTED',persistencePermission:'NOT_GRANTED',executionPermission:'NOT_GRANTED',trustedAdmission:'NOT_IMPLEMENTED'} as const;
export type BResult=typeof boundary&({kind:'committed';receipt:CommitReceipt;operationId:string;operationStatus:'COMMITTED'}|
 {kind:'denied'|'invalid'|'unavailable'|'unknown-outcome'}|{kind:'conflict';reason:'EXPECTED_REVISION_MISMATCH'|'IDEMPOTENCY_KEY_REUSED'}|
 {kind:'project';project:ProjectMetadataSnapshot;recoveryState:string}|{kind:'project-page';projects:readonly ProjectMetadataSnapshot[];nextCursor:null;recoveryState:string}|
 {kind:'revision';revision:ProjectRevisionView;recoveryState:string}|{kind:'revision-page';revisions:readonly ProjectRevisionView[];nextCursor:null;recoveryState:string});
export type BFault='after-snapshot'|'after-intent'|'before-main'|'after-revision'|'after-head'|'after-receipt'|'after-status'|'after-audit'|'before-commit'|'after-main-commit'|'after-ledger-commit';
const fail=(kind:'denied'|'invalid'|'unavailable'|'unknown-outcome'):BResult=>({...boundary,kind});
const conflict=(reason:'EXPECTED_REVISION_MISMATCH'|'IDEMPOTENCY_KEY_REUSED'):BResult=>({...boundary,kind:'conflict',reason});
function isRecord(v:RequestJson):v is RequestRecord {return v!==null&&typeof v==='object'&&!Array.isArray(v);}
function rec(v:RequestJson):RequestRecord {if(!isRecord(v))throw Error('B_SNAPSHOT');return v;}
function str(v:RequestJson):string {if(typeof v!=='string')throw Error('B_SNAPSHOT');return v;}
function metadata(v:RequestJson):ProjectMetadataDTO {const r=rec(v),p=r.defaultProductRef;return Object.freeze({name:str(r.name),description:str(r.description),defaultProductRef:p===null?null:Object.freeze({id:str(rec(p).id),definitionVersion:str(rec(p).definitionVersion)})});}
function expected(v:RequestJson):ProjectRevisionReferenceDTO {const r=rec(v),i=rec(r.integrity);if(r.kind!=='project'||i.algorithm!=='sha256'||i.encoding!=='hex-lower')throw Error('B_REFERENCE');return {kind:r.kind,id:str(r.id),projectId:str(r.projectId),integrity:{algorithm:i.algorithm,encoding:i.encoding,byteDomain:str(i.byteDomain),value:str(i.value)}};}
function fingerprint(accountId:string,operation:string,scopeProject:string,request:RequestRecord,decoderProfile:string):string {
 const j=canonicalizeJcsData({profile:B_FINGERPRINT_PROFILE,decoderProfile,accountId,operation,scopeProject,request});if(j.kind!=='canonicalized')throw Error('B_FINGERPRINT');
 return createHash('sha256').update(B_FINGERPRINT_PROFILE).update(Buffer.from([0])).update(j.canonicalText).digest('hex');
}
function time(clock:()=>number):number {const t=clock();if(!Number.isSafeInteger(t)||t<0||t>Number.MAX_SAFE_INTEGER-limits.receiptWindowMs)throw Error('B_CLOCK');return t;}
export class BTestRepository {
 readonly database:DatabaseSync;#ids=createServerIdIssuer();
 constructor(readonly volume:BVolume,readonly ledger:BTestLedger,private readonly auth:TestPrincipalBoundary,private readonly clock:()=>number,private readonly fault?:(stage:BFault)=>void) {
  assertBTestVolume(volume);if(volume.role!=='main'||volume.directory===ledger.volume.directory)throw Error('B_MAIN_ROLE');
  const fresh=!existsSync(volume.databasePath),meta=ledger.meta();
  if(fresh&&text(meta,'path')!=='')throw Error('B_MISSING_BOUND_DATABASE');if(fresh)createBTestFile(volume);
  this.database=new DatabaseSync(volume.databasePath,{enableForeignKeyConstraints:true});
  try {
   this.database.exec('PRAGMA busy_timeout=600;PRAGMA synchronous=FULL;PRAGMA foreign_keys=ON;');
   ledger.locked(()=>{
    if(fresh){this.database.exec('PRAGMA journal_mode=WAL;BEGIN IMMEDIATE;');try{this.database.exec(readFileSync(new URL('./b-test-schema.sql',import.meta.url),'utf8'));this.database.prepare('INSERT INTO b_meta VALUES(?,?)').run(text(meta,'store_id'),number(meta,'generation'));this.database.exec('COMMIT');}catch(e){this.database.exec('ROLLBACK');throw e;}}
    const b=this.binding();if(text(b,'store_id')!==text(meta,'store_id'))throw Error('B_STORE_ID');
    if(text(meta,'path')===''){if(this.database.prepare('SELECT count(*) n FROM revisions').get()?.n!==0)throw Error('B_UNBOUND_HISTORY');ledger.database.prepare('UPDATE meta SET path=?').run(volume.databasePath);}
    if(!this.current())throw Error('B_BINDING');this.verifyMain();
    if(!this.consistentLedger())ledger.database.exec("UPDATE meta SET mode='FENCED'");
   });
  }catch(e){this.database.close();throw e;}
 }
 binding():BRow {if(this.database.prepare('PRAGMA user_version').get()?.user_version!==1||this.database.prepare('SELECT profile FROM store_profile').get()?.profile!==B_TEST_PROFILE||this.database.prepare('PRAGMA journal_mode').get()?.journal_mode!=='wal')throw Error('B_SCHEMA');const r=this.database.prepare('SELECT * FROM b_meta').get();if(!r)throw Error('B_META');return r;}
 current():boolean {const a=this.ledger.meta(),b=this.binding();return text(a,'store_id')===text(b,'store_id')&&number(a,'generation')===number(b,'generation')&&text(a,'path')===this.volume.databasePath;}
 ownership(kind:'project'|'revision'|'receipt',id:string):Readonly<{accountId:string;projectId:string|null}>|null {
  const row=kind==='project'?this.database.prepare('SELECT account,NULL AS scope FROM projects WHERE id=?').get(id):kind==='revision'?this.database.prepare('SELECT account,project_id AS scope FROM revisions WHERE id=?').get(id):this.database.prepare('SELECT account,scope_project AS scope FROM receipts WHERE id=?').get(id);
  return row?{accountId:text(row,'account'),projectId:row.scope===null||row.scope===''?null:text(row,'scope')}:null;
 }
 private revisionRow(account:string,projectId:string,id:string):BRow|undefined {return this.database.prepare('SELECT * FROM revisions WHERE account=? AND project_id=? AND id=?').get(account,projectId,id);}
 private head(account:string,projectId:string):BRow|undefined {return this.database.prepare('SELECT r.* FROM projects p JOIN revisions r ON r.id=p.head AND r.account=p.account AND r.project_id=p.id WHERE p.account=? AND p.id=?').get(account,projectId);}
 private manifest(r:BRow):CanonicalProjectManifestV1 {
  const nullable=(k:string)=>r[k]===null?null:text(r,k),pid=nullable('product_id'),pv=nullable('product_version');if((pid===null)!==(pv===null))throw Error('B_PRODUCT');
  const m:CanonicalProjectManifestV1={modelId:'zarya.project-envelope',modelVersion:'1.0.0',canonicalizationProfile:'zarya.project-manifest.jcs/v1',projectId:text(r,'project_id'),revision:{id:text(r,'id'),parentId:nullable('parent_id'),restoreOf:nullable('restore_id'),sequence:number(r,'sequence'),createdAt:text(r,'created_at'),actorRef:text(r,'actor')},content:{metadata:{name:text(r,'name'),description:text(r,'description'),defaultProjectType:pid===null||pv===null?null:{id:pid,definitionVersion:pv}},permittedSourceRefs:[],designDefaultsRef:null,works:[],documentHeads:[]}};
  const hash=computeManifestIntegrity(m);if(hash.kind!=='manifest-integrity'||hash.canonicalText!==r.canonical||hash.integrity.value!==r.digest||m.revision.actorRef!==r.account)throw Error('B_MANIFEST');return m;
 }
 private ref(r:BRow):ProjectRevisionReferenceDTO {this.manifest(r);return {kind:'project',id:text(r,'id'),projectId:text(r,'project_id'),integrity:{algorithm:'sha256',encoding:'hex-lower',byteDomain:'zarya.project-manifest.jcs/v1',value:text(r,'digest')}};}
 private matches(v:ProjectRevisionReferenceDTO,r:BRow):boolean {const b=this.ref(r);return v.id===b.id&&v.projectId===b.projectId&&v.integrity.algorithm===b.integrity.algorithm&&v.integrity.encoding===b.integrity.encoding&&v.integrity.byteDomain===b.integrity.byteDomain&&v.integrity.value===b.integrity.value;}
 private meta(r:BRow):ProjectMetadataDTO {const m=this.manifest(r).content.metadata;return {name:m.name,description:m.description,defaultProductRef:m.defaultProjectType};}
 private view(r:BRow):ProjectRevisionView {return {revision:this.ref(r),metadata:this.meta(r),parentRevisionId:r.parent_id===null?null:text(r,'parent_id'),restoredFromRevisionId:r.restore_id===null?null:text(r,'restore_id'),sequence:number(r,'sequence'),createdAt:text(r,'created_at')};}
 private projectSnapshot(r:BRow):ProjectMetadataSnapshot {const lifecycle=r.lifecycle;if(lifecycle!=='active'&&lifecycle!=='soft-deleted')throw Error('B_LIFECYCLE');return {projectId:text(r,'project_id'),revision:this.ref(r),metadata:this.meta(r),lifecycle};}
 private refs(op:RepositoryOperation,d:RequestRecord,replay?:BRow):TestResourceReference[] {
  const list:TestResourceReference[]=[];const project=op==='create-project'||op==='list-projects'?null:str(d.projectId);
  if(project!==null)list.push({kind:'project',id:project,projectId:null});
  if(op==='read-revision'||op==='restore-project')list.push({kind:'revision',id:expected(op==='read-revision'?d.revision:d.sourceRevision).id,projectId:project});
  if(replay)list.push({kind:'receipt',id:text(replay,'id'),projectId:project});return list;
 }
 private authorize(principal:unknown,op:RepositoryOperation,d:RequestRecord,replay?:BRow):string|null {const r=this.auth.authorize(principal,op,this.refs(op,d,replay),replay?'replay':'dispatch');return r.kind==='test-authorized'?r.accountId:null;}
 private committed(r:BRow,replayed:boolean):BResult {
  const revision=this.revisionRow(text(r,'account'),text(r,'project_id'),text(r,'revision_id'));if(!revision)throw Error('B_RECEIPT_REVISION');
  const op=r.operation;if(op!=='create-project'&&op!=='update-metadata'&&op!=='create-revision'&&op!=='restore-project'&&op!=='soft-delete-project')throw Error('B_OPERATION');
  const status=this.database.prepare('SELECT * FROM operation_status WHERE op_id=? AND account=?').get(text(r,'op_id'),text(r,'account'));
  const audit=this.database.prepare('SELECT * FROM audit WHERE op_id=? AND account=?').get(text(r,'op_id'),text(r,'account'));
  if(!status||!audit||status.receipt_id!==r.id||status.fingerprint!==r.fingerprint||status.state!=='COMMITTED'||audit.project_id!==r.project_id||audit.revision_id!==r.revision_id||audit.operation!==op||revision.operation!==op)throw Error('B_RECEIPT_LINK');
  const v=this.view(revision);return {...boundary,kind:'committed',operationId:text(r,'op_id'),operationStatus:'COMMITTED',receipt:{operation:op,projectId:text(r,'project_id'),revision:v.revision,parentRevisionId:v.parentRevisionId,restoredFromRevisionId:v.restoredFromRevisionId,idempotencyKey:text(r,'key'),replayed}};
 }
 private agree(intent:BRow,r:BRow):boolean {return intent.account===r.account&&intent.scope===r.scope_project&&intent.operation===r.operation&&intent.key===r.key&&intent.fingerprint===r.fingerprint&&intent.op_id===r.op_id&&intent.generation===r.generation&&intent.expires_ms===r.expires_ms;}
 consistentLedger():boolean {
  for(const i of this.ledger.database.prepare('SELECT * FROM intents').all()) {
   const r=this.database.prepare('SELECT * FROM receipts WHERE op_id=?').get(text(i,'op_id'));
   if(i.state==='REJECTED'){if(r)throw Error('B_REJECTED_COMMIT');continue;}
   if(!r)return false;if(!this.agree(i,r))throw Error('B_LEDGER_LINK');this.committed(r,true);
  }
  for(const r of this.database.prepare('SELECT * FROM receipts').all()){const i=this.ledger.find(text(r,'account'),text(r,'scope_project'),text(r,'operation'),text(r,'key'));if(!i||!this.agree(i,r)||i.state==='REJECTED')throw Error('B_LEDGER_MISSING');}
  return true;
 }
 verifyMain():void {
  this.binding();if(this.database.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok'||this.database.prepare('PRAGMA foreign_key_check').all().length)throw Error('B_SQL_INTEGRITY');
  const counts=this.database.prepare('SELECT (SELECT count(*) FROM revisions) r,(SELECT count(*) FROM receipts) c,(SELECT count(*) FROM operation_status) s,(SELECT count(*) FROM audit) a').get();if(!counts||counts.r!==counts.c||counts.r!==counts.s||counts.r!==counts.a)throw Error('B_PARTIAL_COMMIT');
  for(const r of this.database.prepare('SELECT * FROM revisions').all()) {
   const m=this.manifest(r);if(m.revision.parentId!==null){const p=this.revisionRow(text(r,'account'),m.projectId,m.revision.parentId);if(!p||number(p,'sequence')+1!==m.revision.sequence)throw Error('B_LINEAGE');}
   if(m.revision.restoreOf!==null){const source=this.revisionRow(text(r,'account'),m.projectId,m.revision.restoreOf);if(!source||source.lifecycle!=='active'||number(source,'sequence')>=m.revision.sequence)throw Error('B_RESTORE');}
  }
  for(const p of this.database.prepare('SELECT * FROM projects').all()){const h=this.head(text(p,'account'),text(p,'id'));if(!h||h.lifecycle!==p.lifecycle||this.database.prepare('SELECT max(sequence) n FROM revisions WHERE project_id=?').get(text(p,'id'))?.n!==h.sequence)throw Error('B_HEAD');}
  for(const r of this.database.prepare('SELECT * FROM receipts').all())this.committed(r,true);
 }
 execute(principal:unknown,candidate:object):BResult {return this.run(principal,candidate,false);}
 reconcile(principal:unknown,candidate:object):BResult {return this.run(principal,candidate,true);}
 private run(principal:unknown,handle:object,statusOnly:boolean):BResult {try{return this.ledger.exclusive(()=>this.runOwned(principal,handle,statusOnly));}catch{return fail('unavailable');}}
 private runOwned(principal:unknown,handle:object,statusOnly:boolean):BResult {
  const snap=inspectTestCandidate(handle);if(!snap)return fail('invalid');const d=snap.data,op=snap.operation;
  let account:string|null=null,scope='',key='',fp='',opId='';
  try {
   account=this.authorize(principal,op,d);if(!account)return fail('denied');
   scope=op==='create-project'||op==='list-projects'?'':str(d.projectId);
   const read=['read-project','list-projects','list-revisions','read-revision'].includes(op);
   if(read)return statusOnly?fail('invalid'):this.ledger.locked(()=>this.read(principal,account!,op,d));
   key=str(d.idempotencyKey);fp=fingerprint(account,op,scope,d,snap.decoderProfile);this.fault?.('after-snapshot');
   const early=this.ledger.locked<BResult|null>(()=>{
    if(!this.current())return fail('unknown-outcome');if(this.authorize(principal,op,d)!==account)return fail('denied');
    const intent=this.ledger.find(account!,scope,op,key);
    if(intent){if(intent.fingerprint!==fp)return conflict('IDEMPOTENCY_KEY_REUSED');return this.replay(principal,op,d,intent);}
    if(statusOnly||text(this.ledger.meta(),'mode')!=='ACTIVE')return fail('unknown-outcome');
    const n=this.ledger.database.prepare('SELECT count(*) n FROM intents WHERE account=?').get(account!)?.n;if(typeof n!=='number'||n>=limits.intents)throw Error('B_INTENT_BUDGET');
    opId='bop_'+randomUUID();this.ledger.database.prepare("INSERT INTO intents VALUES(?,?,?,?,?,?,?,?,'PREPARED',NULL)").run(account!,scope,op,key,fp,opId,number(this.ledger.meta(),'generation'),time(this.clock)+limits.receiptWindowMs);return null;
   });if(early)return early;
   this.fault?.('after-intent');
   const result=this.ledger.locked<BResult>(()=>{
    if(!this.current()||text(this.ledger.meta(),'mode')!=='ACTIVE')return fail('unknown-outcome');
    if(this.authorize(principal,op,d)!==account)return fail('denied');
    const intent=this.ledger.find(account!,scope,op,key);if(!intent||intent.op_id!==opId||intent.fingerprint!==fp)return fail('unknown-outcome');
    this.fault?.('before-main');if(this.authorize(principal,op,d)!==account)return fail('denied');
    this.database.exec('BEGIN IMMEDIATE');let committed=false;
    try {
     const result=this.mutate(principal,account!,op,d,intent);
     if(result.kind!=='committed'){this.database.exec('ROLLBACK');this.ledger.setState(opId,'REJECTED',result.kind==='conflict'?result.reason:'invalid');return result;}
     this.fault?.('before-commit');if(this.authorize(principal,op,d)!==account)throw Error('B_REVOKED');
     this.database.exec('COMMIT');committed=true;this.fault?.('after-main-commit');this.ledger.setState(opId,'COMMITTED');return result;
    }catch(e){if(!committed)try{this.database.exec('ROLLBACK');}catch{}throw e;}
   });this.fault?.('after-ledger-commit');return result;
  }catch{if(opId)try{this.ledger.locked(()=>{if(!this.consistentLedger())this.ledger.database.exec("UPDATE meta SET mode='FENCED'");});}catch{}return opId?fail('unknown-outcome'):fail('unavailable');}
 }
 private replay(principal:unknown,op:RepositoryOperation,d:RequestRecord,i:BRow):BResult {
  if(time(this.clock)>=number(i,'expires_ms')||text(this.ledger.meta(),'mode')!=='ACTIVE')return fail('unknown-outcome');
  if(i.state==='REJECTED')return i.reason==='EXPECTED_REVISION_MISMATCH'?conflict('EXPECTED_REVISION_MISMATCH'):fail('invalid');
  const r=this.database.prepare('SELECT * FROM receipts WHERE op_id=?').get(text(i,'op_id'));if(!r)return fail('unknown-outcome');
  if(!this.agree(i,r))throw Error('B_REPLAY_LINK');if(this.authorize(principal,op,d,r)!==i.account)return fail('denied');
  const result=this.committed(r,true);if(i.state!=='COMMITTED')this.ledger.setState(text(i,'op_id'),'COMMITTED');return result;
 }
 private mutate(principal:unknown,account:string,op:RepositoryOperation,d:RequestRecord,intent:BRow):BResult {
  const scope=text(intent,'scope'),key=text(intent,'key'),opId=text(intent,'op_id'),head=scope?this.head(account,scope):undefined;
  if(scope&&!head)return fail('denied');if(head&&!this.matches(expected(d.expectedRevision),head))return conflict('EXPECTED_REVISION_MISMATCH');
  if(head&&head.lifecycle==='soft-deleted'&&op!=='restore-project')return fail('invalid');
  const source=op==='restore-project'?this.revisionRow(account,scope,expected(d.sourceRevision).id):undefined;
  if(op==='restore-project'&&(!source||source.lifecycle!=='active'||!this.matches(expected(d.sourceRevision),source)))return fail('denied');
  const m=d.metadata!==undefined?metadata(d.metadata):source?this.meta(source):head?this.meta(head):null;if(!m)return fail('invalid');
  if(Buffer.byteLength(m.name)+Buffer.byteLength(m.description)+(m.defaultProductRef?Buffer.byteLength(m.defaultProductRef.id)+Buffer.byteLength(m.defaultProductRef.definitionVersion):0)>limits.metadataBytes)return fail('invalid');
  if(!head&&Number(this.database.prepare('SELECT count(*) n FROM projects WHERE account=?').get(account)?.n)>=limits.projects)return fail('invalid');
  if(head&&Number(this.database.prepare('SELECT count(*) n FROM revisions WHERE project_id=?').get(scope)?.n)>=limits.revisions)return fail('invalid');
  const projectId=head?scope:this.#ids.next('project'),id=this.#ids.next('project-revision'),receiptId='brc_'+randomUUID();
  const manifest:CanonicalProjectManifestV1={modelId:'zarya.project-envelope',modelVersion:'1.0.0',canonicalizationProfile:'zarya.project-manifest.jcs/v1',projectId,revision:{id,parentId:head?text(head,'id'):null,restoreOf:source?text(source,'id'):null,sequence:head?number(head,'sequence')+1:1,createdAt:new Date(time(this.clock)).toISOString(),actorRef:account},content:{metadata:{name:m.name,description:m.description,defaultProjectType:m.defaultProductRef},permittedSourceRefs:[],designDefaultsRef:null,works:[],documentHeads:[]}};
  const hash=computeManifestIntegrity(manifest);if(hash.kind!=='manifest-integrity')return fail('invalid');const rev=manifest.revision,lifecycle=op==='soft-delete-project'?'soft-deleted':'active';
  if(!head)this.database.prepare('INSERT INTO projects VALUES(?,?,?,?)').run(account,projectId,id,lifecycle);
  this.database.prepare('INSERT INTO revisions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,account,projectId,rev.parentId,rev.restoreOf,rev.sequence,rev.createdAt,account,m.name,m.description,m.defaultProductRef?.id??null,m.defaultProductRef?.definitionVersion??null,lifecycle,op,hash.canonicalText,hash.integrity.value);this.fault?.('after-revision');
  if(head&&this.database.prepare('UPDATE projects SET head=?,lifecycle=? WHERE account=? AND id=? AND head=?').run(id,lifecycle,account,projectId,text(head,'id')).changes!==1)throw Error('B_CAS');this.fault?.('after-head');
  this.database.prepare('INSERT INTO receipts(account,scope_project,operation,key,project_id,revision_id,fingerprint,id,op_id,generation,expires_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(account,scope,op,key,projectId,id,text(intent,'fingerprint'),receiptId,opId,number(intent,'generation'),number(intent,'expires_ms'));this.fault?.('after-receipt');
  this.database.prepare("INSERT INTO operation_status VALUES(?,?,?,?,'COMMITTED')").run(opId,account,receiptId,text(intent,'fingerprint'));this.fault?.('after-status');
  this.database.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(id,account,projectId,op,opId,opId);this.fault?.('after-audit');
  const receipt=this.database.prepare('SELECT * FROM receipts WHERE id=?').get(receiptId);if(!receipt)throw Error('B_RECEIPT');return this.committed(receipt,false);
 }
 private read(principal:unknown,account:string,op:RepositoryOperation,d:RequestRecord):BResult {
  if(!this.current())return fail('unknown-outcome');if(this.authorize(principal,op,d)!==account)return fail('denied');const recoveryState=text(this.ledger.meta(),'mode');
  if(op==='list-projects'){if(d.cursor!==null)return fail('invalid');return {...boundary,kind:'project-page',projects:this.database.prepare("SELECT r.* FROM projects p JOIN revisions r ON r.id=p.head WHERE p.account=? AND p.lifecycle='active' ORDER BY p.id").all(account).map(r=>this.projectSnapshot(r)),nextCursor:null,recoveryState};}
  const project=str(d.projectId),head=this.head(account,project);if(!head)return fail('denied');
  if(op==='read-project')return {...boundary,kind:'project',project:this.projectSnapshot(head),recoveryState};
  if(op==='list-revisions'){if(d.cursor!==null)return fail('invalid');return {...boundary,kind:'revision-page',revisions:this.database.prepare('SELECT * FROM revisions WHERE account=? AND project_id=? ORDER BY sequence').all(account,project).map(r=>this.view(r)),nextCursor:null,recoveryState};}
  const r=this.revisionRow(account,project,expected(d.revision).id);return r&&this.matches(expected(d.revision),r)?{...boundary,kind:'revision',revision:this.view(r),recoveryState}:fail('denied');
 }
 async snapshot(target:BVolume):Promise<void> {
  assertBTestVolume(target);if(target.role!=='snapshot'||existsSync(target.databasePath))throw Error('B_FRESH_SNAPSHOT');
  this.ledger.database.exec('BEGIN IMMEDIATE');try{if(!this.current())throw Error('B_BINDING');this.verifyMain();await backup(this.database,target.databasePath);chmodSync(target.databasePath,0o600);this.ledger.database.exec('COMMIT');}catch(e){try{this.ledger.database.exec('ROLLBACK');}catch{}throw e;}
 }
 close():void {this.database.close();}
}
/** Trusted TEST administrative restore. Ledger never belongs to the snapshot rollback domain. */
export async function restoreBTestSnapshot(snapshot:BVolume,target:BVolume,ledger:BTestLedger):Promise<void> {
 assertBTestVolume(snapshot);assertBTestVolume(target);if(snapshot.role!=='snapshot'||target.role!=='main'||existsSync(target.databasePath)||target.directory===ledger.volume.directory)throw Error('B_FRESH_RESTORE');
 const source=new DatabaseSync(snapshot.databasePath,{readOnly:true});
 try {
  if(source.prepare('PRAGMA user_version').get()?.user_version!==1||source.prepare('SELECT profile FROM store_profile').get()?.profile!==B_TEST_PROFILE||source.prepare('SELECT store_id FROM b_meta').get()?.store_id!==ledger.meta().store_id)throw Error('B_SNAPSHOT_PROFILE');
  const generation=ledger.locked(()=>{const g=number(ledger.meta(),'generation')+1;if(!Number.isSafeInteger(g))throw Error('B_GENERATION');ledger.database.prepare("UPDATE meta SET generation=?,path=?,mode='FENCED'").run(g,target.databasePath);return g;});
  await backup(source,target.databasePath);chmodSync(target.databasePath,0o600);const db=new DatabaseSync(target.databasePath);try{db.exec('PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;');db.prepare('UPDATE b_meta SET generation=?').run(generation);}finally{db.close();}
 }finally{source.close();}
}
/** Explicit test activation: only complete ledger/receipt agreement may release the restore fence. */
export function activateBTestRestore(repository:BTestRepository):boolean {return repository.ledger.locked(()=>{if(!repository.current())return false;repository.verifyMain();if(!repository.consistentLedger())return false;repository.ledger.database.exec("UPDATE meta SET mode='ACTIVE'");return true;});}
