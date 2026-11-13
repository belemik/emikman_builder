import type {RequestJson,RequestRecord,RequestHeader,ProjectMetadataDTO,ProjectRevisionReferenceDTO,
 ProjectReadResult,ProjectListResult,ProjectHistoryResult,ProjectRevisionResult,ProjectMutationResult} from '../../src/projects/repository.dto';
import {TestMetadataRepository,type FaultStage} from './metadata-repository';
import {DisposableMetadataStore} from './sqlite-metadata-store';
import {TestSessionAuthority} from './test-session-authority';
import {inspectTestCandidate} from './test-command-candidate';
import {commandFingerprint} from './command-fingerprint';
const bindings=new WeakMap<object,string>();
export type TestDenied=Readonly<{kind:'test-denied';status:401|403|422|503;code:'TEST_SESSION'|'TEST_AUTHORIZATION'|'TEST_CANDIDATE'|'TEST_UNAVAILABLE'}>;
export type TestRepositoryResult=TestDenied|ProjectReadResult|ProjectListResult|ProjectHistoryResult|ProjectRevisionResult|ProjectMutationResult;
function isRecord(v:RequestJson):v is RequestRecord {return v!==null&&typeof v==='object'&&!Array.isArray(v);}
function record(v:RequestJson):RequestRecord {if(!isRecord(v))throw Error('TEST_PROJECTION');return v;}
function string(v:RequestJson):string {if(typeof v!=='string')throw Error('TEST_PROJECTION');return v;}
/** Explicit projections only from private R2-owned immutable snapshots, never arbitrary unknown/caller DTO. */
function header(d:RequestRecord):RequestHeader {
 const r=record(d.registry),dtoVersion=d.dtoVersion,modelId=d.modelId,modelVersion=d.modelVersion,id=r.id,version=r.version;
 if(dtoVersion!=='1.0.0'||modelId!=='zarya.project-envelope'||modelVersion!=='1.0.0'||id!=='zarya.project-definitions'||version!=='1.1.0-draft.1')throw Error('TEST_VERSION');
 return {dtoVersion,modelId,modelVersion,registry:{id,version}};
}
function metadata(v:RequestJson):ProjectMetadataDTO {const d=record(v),ref=d.defaultProductRef;
 return {name:string(d.name),description:string(d.description),defaultProductRef:ref===null?null:{id:string(record(ref).id),definitionVersion:string(record(ref).definitionVersion)}};}
function revision(v:RequestJson):ProjectRevisionReferenceDTO {const d=record(v),h=record(d.integrity),kind=d.kind,algorithm=h.algorithm,encoding=h.encoding;
 if(kind!=='project'||algorithm!=='sha256'||encoding!=='hex-lower')throw Error('TEST_REVISION');
 return {kind,id:string(d.id),projectId:string(d.projectId),integrity:{algorithm,encoding,byteDomain:string(h.byteDomain),value:string(h.value)}};
}
/** Private P03 backend; all entry calls re-resolve synthetic sessions before any receipt/read/write.
 * No production authority, DATA_DIR or arbitrary DTO/context entry. Existing P03 stays unchanged.
 */
export class TestCommandRepository {
 #backend:TestMetadataRepository;
 constructor(private readonly store:DisposableMetadataStore,private readonly sessions:TestSessionAuthority,fault?:(stage:FaultStage)=>void) {
  this.#backend=new TestMetadataRepository(store,sessions.repositoryAuthorityTestOnly(),fault);
 }
 async execute(token:string,handle:object):Promise<TestRepositoryResult> {
  const candidate=inspectTestCandidate(handle);if(!candidate)return {kind:'test-denied',status:422,code:'TEST_CANDIDATE'};
  const auth=this.sessions.resolve(token,candidate.operation);
  if(auth.kind==='unauthenticated')return {kind:'test-denied',status:401,code:'TEST_SESSION'};
  if(auth.kind==='forbidden')return {kind:'test-denied',status:403,code:'TEST_AUTHORIZATION'};
  const bound=bindings.get(handle);if(bound!==undefined&&bound!==auth.account)return {kind:'test-denied',status:403,code:'TEST_AUTHORIZATION'};
  bindings.set(handle,auth.account);
  const d=candidate.data,c=auth.context,op=candidate.operation;
  try {
   const h=header(d);let result:TestRepositoryResult;
   switch(op) {
    case 'create-project':result=await this.#backend.create(c,{...h,metadata:metadata(d.metadata),idempotencyKey:string(d.idempotencyKey)});break;
    case 'read-project':result=await this.#backend.read(c,{...h,projectId:string(d.projectId)});break;
    case 'list-projects':result=await this.#backend.list(c,{...h,cursor:d.cursor===null?null:string(d.cursor)});break;
    case 'list-revisions':result=await this.#backend.history(c,{...h,projectId:string(d.projectId),cursor:d.cursor===null?null:string(d.cursor)});break;
    case 'read-revision':result=await this.#backend.revision(c,{...h,projectId:string(d.projectId),revision:revision(d.revision)});break;
    case 'update-metadata':case 'create-revision': {
     const req={...h,projectId:string(d.projectId),metadata:metadata(d.metadata),expectedRevision:revision(d.expectedRevision),idempotencyKey:string(d.idempotencyKey)};
     result=op==='update-metadata'?await this.#backend.updateMetadata(c,req):await this.#backend.createRevision(c,req);break;
    }
    case 'restore-project':result=await this.#backend.restore(c,{...h,projectId:string(d.projectId),expectedRevision:revision(d.expectedRevision),sourceRevision:revision(d.sourceRevision),idempotencyKey:string(d.idempotencyKey)});break;
    case 'soft-delete-project':result=await this.#backend.softDelete(c,{...h,projectId:string(d.projectId),expectedRevision:revision(d.expectedRevision),idempotencyKey:string(d.idempotencyKey)});break;
   }
   if(result.kind==='committed') {
    const scope=op==='create-project'?'':string(d.projectId),key=string(d.idempotencyKey);
    const row=this.store.database.prepare('SELECT fingerprint FROM receipts WHERE account=? AND scope_project=? AND operation=? AND key=?').get(auth.account,scope,op,key);
    // P03 receipt profile is intentionally distinct from the unscoped R2 test candidate fingerprint.
    if(row?.fingerprint!==commandFingerprint(op,auth.account,scope,d))return {kind:'test-denied',status:503,code:'TEST_UNAVAILABLE'};
   }
   return result;
  }catch{return {kind:'test-denied',status:503,code:'TEST_UNAVAILABLE'};}
 }
 get lastTestFailure(){return this.#backend.lastTestFailure;}
 verify():void {this.#backend.verifyRepository();}
}
