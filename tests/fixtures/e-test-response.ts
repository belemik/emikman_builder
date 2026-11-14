import {types} from 'node:util';
import {hasEntityIdShape} from '../../src/projects/compatibility';
import type {ProjectMetadataDTO,ProjectMetadataSnapshot,ProjectRevisionReferenceDTO,ProjectRevisionView,CommitReceipt,WriteOperation} from '../../src/projects/repository.dto';
export function own(v:unknown,keys?:readonly string[]):Record<string,unknown>|null {
 if(v===null||typeof v!=='object'||types.isProxy(v)||Array.isArray(v))return null;const proto=Object.getPrototypeOf(v);if(proto!==Object.prototype&&proto!==null)return null;
 const descriptors=Object.getOwnPropertyDescriptors(v),names=Reflect.ownKeys(descriptors);if(names.some(k=>typeof k!=='string')||keys&&(names.length!==keys.length||keys.some(k=>!Object.hasOwn(descriptors,k))))return null;
 const result:Record<string,unknown>=Object.create(null);for(const name of Object.keys(descriptors)){const d=descriptors[name];if(!('value'in d))return null;result[name]=d.value;}return result;
}
export function metadata(v:unknown):ProjectMetadataDTO|null {
 const r=own(v,['name','description','defaultProductRef']);if(!r||typeof r.name!=='string'||!r.name.length||typeof r.description!=='string')return null;
 if(r.defaultProductRef===null)return Object.freeze({name:r.name,description:r.description,defaultProductRef:null});const p=own(r.defaultProductRef,['id','definitionVersion']);if(!p||typeof p.id!=='string'||!p.id.length||typeof p.definitionVersion!=='string'||!p.definitionVersion.length)return null;return Object.freeze({name:r.name,description:r.description,defaultProductRef:Object.freeze({id:p.id,definitionVersion:p.definitionVersion})});
}
function id(v:unknown,kind:'project'|'project-revision'):v is string {return typeof v==='string'&&hasEntityIdShape(v,kind);}
export function revision(v:unknown):ProjectRevisionReferenceDTO|null {
 const r=own(v,['kind','id','projectId','integrity']);if(!r||r.kind!=='project'||!id(r.id,'project-revision')||!id(r.projectId,'project'))return null;const i=own(r.integrity,['algorithm','encoding','byteDomain','value']);if(!i||i.algorithm!=='sha256'||i.encoding!=='hex-lower'||i.byteDomain!=='zarya.project-manifest.jcs/v1'||typeof i.value!=='string'||!/^[0-9a-f]{64}$/.test(i.value))return null;
 return Object.freeze({kind:'project',id:r.id,projectId:r.projectId,integrity:Object.freeze({algorithm:'sha256',encoding:'hex-lower',byteDomain:i.byteDomain,value:i.value})});
}
function nullableRevision(v:unknown):v is string|null{return v===null||id(v,'project-revision');}
function project(v:unknown):ProjectMetadataSnapshot|null {const r=own(v,['projectId','revision','metadata','lifecycle']);if(!r||!id(r.projectId,'project')||r.lifecycle!=='active'&&r.lifecycle!=='soft-deleted')return null;const rev=revision(r.revision),m=metadata(r.metadata);return rev&&m&&rev.projectId===r.projectId?Object.freeze({projectId:r.projectId,revision:rev,metadata:m,lifecycle:r.lifecycle}):null;}
function history(v:unknown):ProjectRevisionView|null {const r=own(v,['revision','parentRevisionId','restoredFromRevisionId','sequence','createdAt','metadata']);if(!r||!nullableRevision(r.parentRevisionId)||!nullableRevision(r.restoredFromRevisionId)||typeof r.sequence!=='number'||!Number.isSafeInteger(r.sequence)||r.sequence<1||typeof r.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.createdAt))return null;const rev=revision(r.revision),m=metadata(r.metadata);return rev&&m?Object.freeze({revision:rev,metadata:m,parentRevisionId:r.parentRevisionId,restoredFromRevisionId:r.restoredFromRevisionId,sequence:r.sequence,createdAt:r.createdAt}):null;}
const writes:readonly string[]=['create-project','update-metadata','create-revision','restore-project','soft-delete-project'];
function write(v:unknown):v is WriteOperation {return typeof v==='string'&&writes.includes(v);}
function receipt(v:unknown):CommitReceipt|null {const r=own(v,['operation','projectId','revision','parentRevisionId','restoredFromRevisionId','idempotencyKey','replayed']);if(!r||!write(r.operation)||!id(r.projectId,'project')||typeof r.idempotencyKey!=='string'||typeof r.replayed!=='boolean'||!nullableRevision(r.parentRevisionId)||!nullableRevision(r.restoredFromRevisionId))return null;const rev=revision(r.revision);return rev&&rev.projectId===r.projectId?Object.freeze({operation:r.operation,projectId:r.projectId,revision:rev,parentRevisionId:r.parentRevisionId,restoredFromRevisionId:r.restoredFromRevisionId,idempotencyKey:r.idempotencyKey,replayed:r.replayed}):null;}
export type EAnswer=Readonly<{kind:'project';project:ProjectMetadataSnapshot}>|Readonly<{kind:'page';projects:readonly ProjectMetadataSnapshot[];cursor:string|null}>|Readonly<{kind:'history';revisions:readonly ProjectRevisionView[];cursor:string|null}>|Readonly<{kind:'committed';receipt:CommitReceipt}>;
/** Closed data inspection only, never principal/admission/digest verification. Fail closed on offline FENCED reads. */
export function inspectEAnswer(v:unknown):EAnswer|null {
 const outer=own(v,['scope','result']);if(!outer||outer.scope!=='C_TEST_ONLY')return null;const r=own(outer.result);if(!r||r.scope!=='B_TEST_ONLY'||r.productionAuthority!=='NOT_GRANTED'||r.persistencePermission!=='NOT_GRANTED'||r.executionPermission!=='NOT_GRANTED'||r.trustedAdmission!=='NOT_IMPLEMENTED')return null;
 const common=['scope','productionAuthority','persistencePermission','executionPermission','trustedAdmission','kind'];
 if(r.kind==='committed'){if(!own(r,[...common,'operationId','operationStatus','receipt'])||r.operationStatus!=='COMMITTED'||typeof r.operationId!=='string'||!/^bop_[0-9a-f-]{36}$/.test(r.operationId))return null;const c=receipt(r.receipt);return c?Object.freeze({kind:'committed',receipt:c}):null;}
 if(r.recoveryState!=='ACTIVE')return null;
 if(r.kind==='project'){if(!own(r,[...common,'project','recoveryState']))return null;const p=project(r.project);return p?Object.freeze({kind:'project',project:p}):null;}
 if(r.kind!=='project-page'&&r.kind!=='revision-page'||r.paginationProfile!=='zarya.p04.c.cursor.test/v1'||r.nextCursor!==null&&(typeof r.nextCursor!=='string'||r.nextCursor.length>256))return null;
 if(r.kind==='project-page'){if(!own(r,[...common,'projects','nextCursor','recoveryState','paginationProfile'])||!Array.isArray(r.projects)||r.projects.length>4)return null;const result:ProjectMetadataSnapshot[]=[];for(const item of r.projects){const p=project(item);if(!p||result.some(x=>x.projectId===p.projectId))return null;result.push(p);}return Object.freeze({kind:'page',projects:Object.freeze(result),cursor:r.nextCursor});}
 if(!own(r,[...common,'revisions','nextCursor','recoveryState','paginationProfile'])||!Array.isArray(r.revisions)||r.revisions.length>4)return null;const result:ProjectRevisionView[]=[];for(const item of r.revisions){const h=history(item);if(!h||result.some(x=>x.revision.id===h.revision.id))return null;result.push(h);}return Object.freeze({kind:'history',revisions:Object.freeze(result),cursor:r.nextCursor});
}
export async function readEReply(response:Response):Promise<unknown>{
 if(response.headers.get('content-type')!=='application/json; charset=utf-8'||!response.body)throw Error('E_RESPONSE');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>65536)throw Error('E_RESPONSE_SIZE');chunks.push(next.value);}}finally{await reader.cancel();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}const value:unknown=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));return value;
}
