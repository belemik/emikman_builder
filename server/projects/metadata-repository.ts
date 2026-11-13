import {inspectProjectRequest} from '../../src/projects/request.validation';
import type {ProjectRepositoryPort,RepositoryContext} from '../../src/projects/repository.port';
import type {CreateProjectRequest,ReadProjectRequest,ListProjectsRequest,UpdateProjectRequest,ListProjectRevisionsRequest,
 ReadProjectRevisionRequest,CreateProjectRevisionRequest,RestoreProjectRequest,SoftDeleteProjectRequest,
 ProjectReadResult,ProjectListResult,ProjectHistoryResult,ProjectRevisionResult,ProjectMutationResult,
 ProjectRevisionReferenceDTO,ProjectMetadataSnapshot,ProjectRevisionView,CommitReceipt,RepositoryFailure,
 RequestJson,RequestRecord,ProjectMetadataDTO,WriteOperation} from '../../src/projects/repository.dto';
import type {CanonicalProjectManifestV1} from '../../src/projects/canonicalization.types';
import {createServerIdIssuer} from './server-identities';
import {computeManifestIntegrity} from './manifest-integrity';
import {commandFingerprint,receiptChecksum} from './command-fingerprint';
import {TestFixtureAuthority} from './test-authority';
import {DisposableMetadataStore,TestStoreError,type StoredRevision} from './sqlite-metadata-store';
const boundary={scope:'PROJECT_METADATA_ONLY',executionPermission:'NOT_GRANTED',semanticAdmission:'NOT_EVALUATED',trustedAdmission:'NOT_IMPLEMENTED'} as const;
const denied=(kind:'not-found'|'forbidden'|'unavailable'):RepositoryFailure=>({...boundary,kind});
const conflict=(reason:'EXPECTED_REVISION_MISMATCH'|'IDEMPOTENCY_KEY_REUSED'):RepositoryFailure=>({...boundary,kind:'conflict',reason});
const invalid=(path:string):RepositoryFailure=>({...boundary,kind:'validation-error',diagnostics:[{code:'REQUEST_VALUE',path,reason:'Unsupported test-only request or declared state.'}]});
export type FaultStage='before-transaction'|'after-revision'|'after-head'|'after-audit'|'after-receipt'|'before-commit'|'after-commit';
type WriteRequest=CreateProjectRequest|UpdateProjectRequest|CreateProjectRevisionRequest|RestoreProjectRequest|SoftDeleteProjectRequest;
/** Bounded clone only of controlled internal fixtures; not a network/hostile Proxy boundary.
 * No parsed DTO/admitted value is exported, and no JSON.parse/cast is used. */
function fixtureData(value:unknown,store:DisposableMetadataStore):RequestJson {
 let nodes=0,bytes=0;const seen=new Set<object>();
 function copy(v:unknown):RequestJson {
  if(++nodes>store.limits.maxRequestNodes)throw Error('FIXTURE_NODE_LIMIT');
  if(v===null||typeof v==='boolean')return v;
  if(typeof v==='number'&&Number.isFinite(v))return v;
  if(typeof v==='string'){bytes+=Buffer.byteLength(v);if(bytes>store.limits.maxRequestUtf8Bytes)throw Error('FIXTURE_BYTE_LIMIT');return v;}
  if(typeof v!=='object'||seen.has(v))throw Error('FIXTURE_DATA_ONLY');seen.add(v);
  const proto=Object.getPrototypeOf(v);if(proto!==Object.prototype&&proto!==null&&proto!==Array.prototype)throw Error('FIXTURE_DATA_ONLY');
  const d=Object.getOwnPropertyDescriptors(v);
  if(Reflect.ownKeys(d).some(k=>typeof k!=='string'))throw Error('FIXTURE_DATA_ONLY');
  if(Array.isArray(v)){
   if(Object.keys(d).length!==v.length+1)throw Error('FIXTURE_DENSE_ARRAY');const result:RequestJson[]=[];
   for(let i=0;i<v.length;i++){const p=d[String(i)];if(!p||!('value'in p)||!p.enumerable)throw Error('FIXTURE_DATA_ONLY');result.push(copy(p.value));}return Object.freeze(result);
  }
  const result:{[key:string]:RequestJson}=Object.create(null);
  for(const key of Object.keys(d).sort()){
   const p=d[key];if(!('value'in p)||!p.enumerable)throw Error('FIXTURE_DATA_ONLY');
   bytes+=Buffer.byteLength(key);if(bytes>store.limits.maxRequestUtf8Bytes)throw Error('FIXTURE_BYTE_LIMIT');result[key]=copy(p.value);
  }return Object.freeze(result);
 }
 return copy(value);
}
/** Typed projections ONLY from the owned, inspected fixture snapshot below. These guards
 * do not parse JSON, confer admission, normalize values or cast unknown into a DTO. */
function snapshotRecord(value:RequestJson):RequestRecord {
 if(!isSnapshotRecord(value))throw Error('FIXTURE_SNAPSHOT_RECORD');return value;
}
function isSnapshotRecord(value:RequestJson):value is RequestRecord {
 return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function snapshotString(record:RequestRecord,key:string):string {
 const value=record[key];if(typeof value!=='string')throw Error('FIXTURE_SNAPSHOT_STRING');return value;
}
function snapshotMetadata(value:RequestJson):ProjectMetadataDTO {
 const record=snapshotRecord(value),product=record.defaultProductRef;
 const defaultProductRef=product===null?null:(()=>{const ref=snapshotRecord(product);return Object.freeze({id:snapshotString(ref,'id'),definitionVersion:snapshotString(ref,'definitionVersion')});})();
 return Object.freeze({name:snapshotString(record,'name'),description:snapshotString(record,'description'),defaultProductRef});
}
function snapshotRevision(value:RequestJson):ProjectRevisionReferenceDTO {
 const record=snapshotRecord(value),integrity=snapshotRecord(record.integrity);
 const kind=record.kind,algorithm=integrity.algorithm,encoding=integrity.encoding;
 if(kind!=='project'||algorithm!=='sha256'||encoding!=='hex-lower')throw Error('FIXTURE_SNAPSHOT_REVISION');
 return Object.freeze({kind,id:snapshotString(record,'id'),projectId:snapshotString(record,'projectId'),
  integrity:Object.freeze({algorithm,encoding,byteDomain:snapshotString(integrity,'byteDomain'),value:snapshotString(integrity,'value')})});
}
function reference(r:StoredRevision):ProjectRevisionReferenceDTO {
 return {kind:'project',id:r.manifest.revision.id,projectId:r.manifest.projectId,
 integrity:{algorithm:'sha256',encoding:'hex-lower',byteDomain:'zarya.project-manifest.jcs/v1',value:r.digest}};
}
function matches(a:ProjectRevisionReferenceDTO,r:StoredRevision):boolean {
 const b=reference(r);return a.kind===b.kind&&a.id===b.id&&a.projectId===b.projectId&&a.integrity.algorithm===b.integrity.algorithm
 &&a.integrity.encoding===b.integrity.encoding&&a.integrity.byteDomain===b.integrity.byteDomain&&a.integrity.value===b.integrity.value;
}
/** Existing P02 port implemented solely for disposable, registered test contexts. No live auth. */
export class TestMetadataRepository implements ProjectRepositoryPort {
 #ids=createServerIdIssuer();
 #lastFailure:'SQLITE_FULL'|'SQLITE_BUSY'|'SQLITE_CONSTRAINT'|'TEST_STORE_ERROR'|'TEST_FAILURE'|null=null;
 /** Sanitized test diagnostics, never raw SQL/messages/metadata. Not part of the P02 result. */
 get lastTestFailure(){return this.#lastFailure;}
 private failed(error:unknown):RepositoryFailure {
  const code=error&&typeof error==='object'&&'errcode'in error&&typeof error.errcode==='number'?error.errcode&255:null;
  this.#lastFailure=code===13?'SQLITE_FULL':code===5||code===6?'SQLITE_BUSY':code===19?'SQLITE_CONSTRAINT':error instanceof TestStoreError?'TEST_STORE_ERROR':'TEST_FAILURE';
  return denied('unavailable');
 }
 constructor(readonly store:DisposableMetadataStore,private readonly authority:TestFixtureAuthority,
  private readonly fault?:(stage:FaultStage)=>void,private readonly clock:()=>string=()=>new Date().toISOString()) {
  this.verifyRepository();
 }
 private validate(operation:string,request:object):{ok:true;data:RequestRecord}|{ok:false;result:RepositoryFailure} {
  try{
   const data=fixtureData(request,this.store),inspection=inspectProjectRequest(operation,data);
   if(inspection.kind!=='dto-shape-recognized')return {ok:false,result:{...boundary,kind:'validation-error',diagnostics:inspection.diagnostics}};
   // The fixture remains internal; shape recognition grants no general admission.
   commandFingerprint(operation,'fixture-validation','',data);return {ok:true,data:snapshotRecord(data)};
  }catch{return {ok:false,result:invalid('')};}
 }
 private snapshot(r:StoredRevision):ProjectMetadataSnapshot {return {projectId:r.manifest.projectId,revision:reference(r),metadata:this.store.metadata(r.manifest),lifecycle:r.lifecycle};}
 private view(r:StoredRevision):ProjectRevisionView {const rev=r.manifest.revision;return {revision:reference(r),parentRevisionId:rev.parentId,restoredFromRevisionId:rev.restoreOf,sequence:rev.sequence,createdAt:rev.createdAt,metadata:this.store.metadata(r.manifest)};}
 private receipt(account:string,scope:string,op:WriteOperation,key:string,fingerprint:string):ProjectMutationResult|null {
  const row=this.store.database.prepare('SELECT * FROM receipts WHERE account=? AND scope_project=? AND operation=? AND key=?').get(account,scope,op,key);
  if(!row)return null;
  for(const field of ['project_id','revision_id','fingerprint','checksum'])if(typeof row[field]!=='string')throw new TestStoreError('RECEIPT_CORRUPT');
  const projectId=String(row.project_id),revisionId=String(row.revision_id),storedFingerprint=String(row.fingerprint);
  if(receiptChecksum(account,scope,op,key,projectId,revisionId,storedFingerprint)!==row.checksum)throw new TestStoreError('RECEIPT_CHECKSUM');
  const rev=this.store.revision(account,projectId,revisionId);if(!rev||rev.operation!==op)throw new TestStoreError('RECEIPT_REVISION');
  if(storedFingerprint!==fingerprint)return conflict('IDEMPOTENCY_KEY_REUSED');
  return {...boundary,kind:'committed',receipt:this.makeReceipt(rev,op,key,true)};
 }
 private makeReceipt(r:StoredRevision,operation:WriteOperation,key:string,replayed:boolean):CommitReceipt {
  return {operation,projectId:r.manifest.projectId,revision:reference(r),parentRevisionId:r.manifest.revision.parentId,restoredFromRevisionId:r.manifest.revision.restoreOf,idempotencyKey:key,replayed};
 }
 private write(context:RepositoryContext,op:WriteOperation,input:WriteRequest):ProjectMutationResult {
  this.#lastFailure=null;const account=this.authority.authorize(context);if(!account)return denied('forbidden');
  const checked=this.validate(op,input);if(!checked.ok)return checked.result;
  // Never read input after this point. Fingerprint and all semantic projections share
  // this deeply frozen, caller-independent fixture snapshot (not production admission).
  const request=checked.data;
  try{
   const scope=op==='create-project'?'':snapshotString(request,'projectId');
   const key=snapshotString(request,'idempotencyKey');
   const expected='expectedRevision'in request?snapshotRevision(request.expectedRevision):null;
   const sourceReference='sourceRevision'in request?snapshotRevision(request.sourceRevision):null;
   const proposedMetadata='metadata'in request?snapshotMetadata(request.metadata):null;
   const fingerprint=commandFingerprint(op,account,scope,request);
   this.fault?.('before-transaction');
   const result=this.store.transaction<ProjectMutationResult>(()=>{
    const head=scope?this.store.head(account,scope):undefined;
    if(scope&&!head)return denied('not-found');
    const replay=this.receipt(account,scope,op,key,fingerprint);if(replay)return replay;
    if(expected!==null&&(!head||!matches(expected,head)))return conflict('EXPECTED_REVISION_MISMATCH');
    if(head&&head.lifecycle==='soft-deleted'&&op!=='restore-project')return invalid('/projectId');
    let source:StoredRevision|undefined;
    if(sourceReference!==null){source=this.store.revision(account,scope,sourceReference.id);if(!source||source.lifecycle!=='active'||!matches(sourceReference,source))return denied('not-found');}
    const metadata=proposedMetadata??(source?this.store.metadata(source.manifest):head?this.store.metadata(head.manifest):undefined);
    if(!metadata)return invalid('/metadata');this.store.checkMetadata(metadata);
    const n=this.store.database.prepare('SELECT count(*) AS n FROM receipts WHERE account=?').get(account)?.n;
    if(typeof n!=='number'||n>=this.store.limits.maxReceiptsPerAccount)throw new TestStoreError('TEST_RECEIPT_LIMIT');
    if(!head){const projects=this.store.database.prepare('SELECT count(*) AS n FROM projects WHERE account=?').get(account)?.n;if(typeof projects!=='number'||projects>=this.store.limits.maxProjectsPerAccount)throw new TestStoreError('TEST_PROJECT_LIMIT');}
    const projectId=head?scope:this.#ids.next('project'),id=this.#ids.next('project-revision');
    const manifest:CanonicalProjectManifestV1={modelId:'zarya.project-envelope',modelVersion:'1.0.0',canonicalizationProfile:'zarya.project-manifest.jcs/v1',projectId,
     revision:{id,parentId:head?.manifest.revision.id??null,restoreOf:source?.manifest.revision.id??null,sequence:head?head.manifest.revision.sequence+1:1,createdAt:this.clock(),actorRef:account},
     content:{metadata:{name:metadata.name,description:metadata.description,defaultProjectType:metadata.defaultProductRef?{...metadata.defaultProductRef}:null},permittedSourceRefs:[],designDefaultsRef:null,works:[],documentHeads:[]}};
    const hash=computeManifestIntegrity(manifest);if(hash.kind!=='manifest-integrity')return invalid('/revision');
    const lifecycle=op==='soft-delete-project'?'soft-deleted':'active';
    if(!head)this.store.database.prepare('INSERT INTO projects(account,id,head,lifecycle) VALUES(?,?,?,?)').run(account,projectId,id,lifecycle);
    const record:StoredRevision={manifest,digest:hash.integrity.value,lifecycle,operation:op};this.store.insertRevision(account,record);this.fault?.('after-revision');
    if(head){const changed=this.store.database.prepare('UPDATE projects SET head=?,lifecycle=? WHERE account=? AND id=? AND head=?').run(id,lifecycle,account,scope,head.manifest.revision.id);if(changed.changes!==1)throw new TestStoreError('HEAD_CAS');}
    this.fault?.('after-head');
    this.store.database.prepare('INSERT INTO audit(revision_id,account,project_id,operation,request_id) VALUES(?,?,?,?,?)').run(id,account,projectId,op,context.requestId);this.fault?.('after-audit');
    const checksum=receiptChecksum(account,scope,op,key,projectId,id,fingerprint);
    this.store.database.prepare('INSERT INTO receipts(account,scope_project,operation,key,project_id,revision_id,fingerprint,checksum) VALUES(?,?,?,?,?,?,?,?)').run(account,scope,op,key,projectId,id,fingerprint,checksum);this.fault?.('after-receipt');
    this.fault?.('before-commit');return {...boundary,kind:'committed',receipt:this.makeReceipt(record,op,key,false)};
   });
   if(result.kind==='committed')this.fault?.('after-commit');return result;
  }catch(error){return this.failed(error);}
 }
 private reading<T>(context:RepositoryContext,op:string,request:object,fn:(account:string,snapshot:RequestRecord)=>T):T|RepositoryFailure {
  this.#lastFailure=null;const account=this.authority.authorize(context);if(!account)return denied('forbidden');
  const checked=this.validate(op,request);if(!checked.ok)return checked.result;
  try{return fn(account,checked.data);}catch(error){return this.failed(error);}
 }
 async create(c:RepositoryContext,r:CreateProjectRequest):Promise<ProjectMutationResult>{return this.write(c,'create-project',r);}
 async updateMetadata(c:RepositoryContext,r:UpdateProjectRequest):Promise<ProjectMutationResult>{return this.write(c,'update-metadata',r);}
 async createRevision(c:RepositoryContext,r:CreateProjectRevisionRequest):Promise<ProjectMutationResult>{return this.write(c,'create-revision',r);}
 async restore(c:RepositoryContext,r:RestoreProjectRequest):Promise<ProjectMutationResult>{return this.write(c,'restore-project',r);}
 async softDelete(c:RepositoryContext,r:SoftDeleteProjectRequest):Promise<ProjectMutationResult>{return this.write(c,'soft-delete-project',r);}
 async read(c:RepositoryContext,r:ReadProjectRequest):Promise<ProjectReadResult>{
  return this.reading(c,'read-project',r,(account,snapshot)=>{const h=this.store.head(account,snapshotString(snapshot,'projectId'));return h?{...boundary,kind:'project' as const,project:this.snapshot(h)}:denied('not-found');});
 }
 async list(c:RepositoryContext,r:ListProjectsRequest):Promise<ProjectListResult>{
  return this.reading(c,'list-projects',r,(account,snapshot)=>snapshot.cursor!==null?invalid('/cursor'):{...boundary,kind:'project-page' as const,projects:this.store.list(account).map(v=>this.snapshot(v)),nextCursor:null});
 }
 async history(c:RepositoryContext,r:ListProjectRevisionsRequest):Promise<ProjectHistoryResult>{
  return this.reading(c,'list-revisions',r,(account,snapshot)=>{if(snapshot.cursor!==null)return invalid('/cursor');const projectId=snapshotString(snapshot,'projectId');if(!this.store.head(account,projectId))return denied('not-found');return {...boundary,kind:'revision-page' as const,revisions:this.store.history(account,projectId).map(v=>this.view(v)),nextCursor:null};});
 }
 async revision(c:RepositoryContext,r:ReadProjectRevisionRequest):Promise<ProjectRevisionResult>{
  return this.reading(c,'read-revision',r,(account,snapshot)=>{const ref=snapshotRevision(snapshot.revision),rev=this.store.revision(account,snapshotString(snapshot,'projectId'),ref.id);return rev&&matches(ref,rev)?{...boundary,kind:'revision' as const,revision:this.view(rev)}:denied('not-found');});
 }
 verifyRepository():void {verifyDisposableRepository(this.store);}
}
/** Startup/backup consistency checker; no authority or new admission is created. */
export function verifyDisposableRepository(store:DisposableMetadataStore):void {
  store.verifyAll();
  const counts=store.database.prepare('SELECT (SELECT count(*) FROM revisions) AS revisions,(SELECT count(*) FROM audit) AS audit,(SELECT count(*) FROM receipts) AS receipts').get();
  if(!counts||counts.revisions!==counts.audit||counts.revisions!==counts.receipts)throw new TestStoreError('PARTIAL_REPOSITORY');
  for(const row of store.database.prepare('SELECT * FROM receipts').all()){
   for(const k of ['account','scope_project','operation','key','project_id','revision_id','fingerprint','checksum'])if(typeof row[k]!=='string')throw new TestStoreError('RECEIPT_CORRUPT');
   const account=String(row.account),project=String(row.project_id),rev=store.revision(account,project,String(row.revision_id));
   if(!rev||rev.operation!==row.operation||receiptChecksum(account,String(row.scope_project),String(row.operation),String(row.key),project,String(row.revision_id),String(row.fingerprint))!==row.checksum)throw new TestStoreError('RECEIPT_INTEGRITY');
   const audit=store.database.prepare('SELECT * FROM audit WHERE revision_id=? AND account=? AND project_id=?').get(String(row.revision_id),account,project);
   if(!audit||audit.operation!==row.operation||typeof audit.request_id!=='string')throw new TestStoreError('AUDIT_INTEGRITY');
  }
}
