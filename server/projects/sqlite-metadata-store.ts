import { DatabaseSync } from 'node:sqlite';
import { existsSync, openSync, closeSync, readFileSync, chmodSync } from 'node:fs';
import { assertDisposableVolume, type DisposableVolume } from './disposable-volume';
import { computeManifestIntegrity } from './manifest-integrity';
import type { CanonicalProjectManifestV1 } from '../../src/projects/canonicalization.types';
import type { ProjectMetadataDTO, WriteOperation } from '../../src/projects/repository.dto';
export type StoredRevision=Readonly<{ manifest:CanonicalProjectManifestV1; digest:string;
  lifecycle:'active'|'soft-deleted'; operation:WriteOperation }>;
export type TestStoreLimits=Readonly<{ maxMetadataUtf8Bytes:number; maxProjectsPerAccount:number;
  maxRevisionsPerProject:number; maxReceiptsPerAccount:number; maxRequestNodes:number; maxRequestUtf8Bytes:number; busyTimeoutMs:number }>;
export class TestStoreError extends Error { constructor(readonly reason:string){super('P03_TEST_STORE_'+reason);} }
function text(row:Record<string,unknown>,key:string):string {
 const value=row[key];if(typeof value!=='string')throw new TestStoreError('CORRUPT_RECORD');return value;
}
function nullable(row:Record<string,unknown>,key:string):string|null {return row[key]===null?null:text(row,key);}
export class DisposableMetadataStore {
 readonly database:DatabaseSync;
 readonly limits:TestStoreLimits;
 #closed=false;#transaction=false;
 constructor(readonly volume:DisposableVolume, limits:TestStoreLimits) {
  assertDisposableVolume(volume);
  const required=['maxMetadataUtf8Bytes','maxProjectsPerAccount','maxRevisionsPerProject','maxReceiptsPerAccount','maxRequestNodes','maxRequestUtf8Bytes','busyTimeoutMs'];
  if(Object.keys(limits).length!==required.length||required.some(key=>!Object.hasOwn(limits,key)))throw new TestStoreError('EXPLICIT_TEST_BUDGET_REQUIRED');
  for(const value of Object.values(limits))if(!Number.isSafeInteger(value)||value<1)throw new TestStoreError('EXPLICIT_TEST_BUDGET_REQUIRED');
  this.limits=Object.freeze({...limits});
  const fresh=!existsSync(volume.databasePath);
  if(fresh)closeSync(openSync(volume.databasePath,'wx',0o600));
  this.database=new DatabaseSync(volume.databasePath,{enableForeignKeyConstraints:true});
  try{
   this.database.exec('PRAGMA busy_timeout='+limits.busyTimeoutMs+'; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
   if(fresh){this.database.exec('PRAGMA journal_mode=WAL;');this.database.exec(readFileSync(new URL('./sqlite-schema.sql',import.meta.url),'utf8'));}
   const version=this.database.prepare('PRAGMA user_version').get();
   if(version?.user_version!==1)throw new TestStoreError('SCHEMA_VERSION');
   if(this.database.prepare('SELECT profile FROM store_profile').get()?.profile!=='zarya.p03.disposable/v1')throw new TestStoreError('STORE_PROFILE');
   if(this.database.prepare('PRAGMA journal_mode').get()?.journal_mode!=='wal')throw new TestStoreError('JOURNAL_PROFILE');
   if(this.database.prepare('SELECT count(*) AS n FROM sqlite_master WHERE type=\'trigger\'').get()?.n!==6)throw new TestStoreError('SCHEMA_TRIGGERS');
   if(this.database.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok'||this.database.prepare('PRAGMA foreign_key_check').all().length)throw new TestStoreError('SQLITE_INTEGRITY');
   chmodSync(volume.databasePath,0o600);
   this.verifyAll();
  }catch(error){this.database.close();this.#closed=true;throw error;}
 }
 get inTransaction():boolean {return this.#transaction;}
 close():void {if(!this.#closed){this.database.close();this.#closed=true;}}
 transaction<T>(fn:()=>T):T {
  if(this.#closed||this.#transaction)throw new TestStoreError('TRANSACTION_STATE');
  this.database.exec('BEGIN IMMEDIATE');this.#transaction=true;
  try {const value=fn();this.database.exec('COMMIT');return value;}
  catch(error){try{this.database.exec('ROLLBACK');}catch{}throw error;}
  finally{this.#transaction=false;}
 }
 checkMetadata(metadata:ProjectMetadataDTO):void {
  const bytes=Buffer.byteLength(metadata.name,'utf8')+Buffer.byteLength(metadata.description,'utf8')
   +(metadata.defaultProductRef?Buffer.byteLength(metadata.defaultProductRef.id)+Buffer.byteLength(metadata.defaultProductRef.definitionVersion):0);
  if(bytes>this.limits.maxMetadataUtf8Bytes)throw new TestStoreError('TEST_ALLOCATION_LIMIT');
 }
 decode(row:Record<string,unknown>):StoredRevision {
  const sequence=row.sequence;if(typeof sequence!=='number')throw new TestStoreError('CORRUPT_SEQUENCE');
  const productId=nullable(row,'product_id'),productVersion=nullable(row,'product_version');
  if((productId===null)!==(productVersion===null))throw new TestStoreError('CORRUPT_PRODUCT');
  const lifecycle=row.lifecycle,operation=row.operation;
  if(lifecycle!=='active'&&lifecycle!=='soft-deleted')throw new TestStoreError('CORRUPT_LIFECYCLE');
  if(operation!=='create-project'&&operation!=='update-metadata'&&operation!=='create-revision'&&operation!=='restore-project'&&operation!=='soft-delete-project')throw new TestStoreError('CORRUPT_OPERATION');
  if((operation==='soft-delete-project')!==(lifecycle==='soft-deleted'))throw new TestStoreError('CORRUPT_LIFECYCLE');
  const manifest:CanonicalProjectManifestV1={modelId:'zarya.project-envelope',modelVersion:'1.0.0',canonicalizationProfile:'zarya.project-manifest.jcs/v1',
   projectId:text(row,'project_id'),revision:{id:text(row,'id'),parentId:nullable(row,'parent_id'),restoreOf:nullable(row,'restore_id'),sequence,createdAt:text(row,'created_at'),actorRef:text(row,'actor')},
   content:{metadata:{name:text(row,'name'),description:text(row,'description'),defaultProjectType:productId!==null&&productVersion!==null?{id:productId,definitionVersion:productVersion}:null},
    permittedSourceRefs:[],designDefaultsRef:null,works:[],documentHeads:[]}};
  const hash=computeManifestIntegrity(manifest);
  if(hash.kind!=='manifest-integrity'||hash.canonicalText!==text(row,'canonical')||hash.integrity.value!==text(row,'digest')||text(row,'account')!==manifest.revision.actorRef)throw new TestStoreError('MANIFEST_INTEGRITY');
  this.checkMetadata(this.metadata(manifest));
  return {manifest,digest:hash.integrity.value,lifecycle,operation};
 }
 metadata(manifest:CanonicalProjectManifestV1):ProjectMetadataDTO {
  const m=manifest.content.metadata;return {name:m.name,description:m.description,defaultProductRef:m.defaultProjectType===null?null:{...m.defaultProjectType}};
 }
 revision(account:string,projectId:string,id:string):StoredRevision|undefined {
  const row=this.database.prepare('SELECT * FROM revisions WHERE account=? AND project_id=? AND id=?').get(account,projectId,id);
  return row?this.decode(row):undefined;
 }
 head(account:string,projectId:string):StoredRevision|undefined {
  const row=this.database.prepare('SELECT r.*,p.lifecycle AS head_lifecycle FROM projects p JOIN revisions r ON r.id=p.head AND r.project_id=p.id AND r.account=p.account WHERE p.account=? AND p.id=?').get(account,projectId);
  if(!row)return undefined;
  const result=this.decode(row);if(row.head_lifecycle!==result.lifecycle)throw new TestStoreError('HEAD_LIFECYCLE');return result;
 }
 list(account:string):StoredRevision[] {
  return this.database.prepare('SELECT r.*,p.lifecycle AS head_lifecycle FROM projects p JOIN revisions r ON r.account=p.account AND r.project_id=p.id AND r.id=p.head WHERE p.account=? AND p.lifecycle=\'active\' ORDER BY p.id').all(account).map(row=>{const result=this.decode(row);if(row.head_lifecycle!==result.lifecycle)throw new TestStoreError('HEAD_LIFECYCLE');return result;});
 }
 history(account:string,projectId:string):StoredRevision[] {
  return this.database.prepare('SELECT * FROM revisions WHERE account=? AND project_id=? ORDER BY sequence').all(account,projectId).map(row=>this.decode(row));
 }
 insertRevision(account:string,record:StoredRevision):void {
  if(!this.#transaction)throw new TestStoreError('TRANSACTION_REQUIRED');
  const m=record.manifest,r=m.revision,metadata=m.content.metadata;
  this.checkMetadata(this.metadata(m));
  const computed=computeManifestIntegrity(m);
  if(computed.kind!=='manifest-integrity'||computed.integrity.value!==record.digest||account!==r.actorRef)throw new TestStoreError('INSERT_INTEGRITY');
  const count=this.database.prepare('SELECT count(*) AS n FROM revisions WHERE project_id=?').get(m.projectId)?.n;
  if(typeof count!=='number'||count>=this.limits.maxRevisionsPerProject)throw new TestStoreError('TEST_REVISION_LIMIT');
  this.database.prepare('INSERT INTO revisions(id,account,project_id,parent_id,restore_id,sequence,created_at,actor,name,description,product_id,product_version,lifecycle,operation,canonical,digest) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
   .run(r.id,account,m.projectId,r.parentId,r.restoreOf,r.sequence,r.createdAt,r.actorRef,metadata.name,metadata.description,metadata.defaultProjectType?.id??null,metadata.defaultProjectType?.definitionVersion??null,record.lifecycle,record.operation,computed.canonicalText,record.digest);
 }
 /** Low-level S2 checkpoint operation; no public port/receipt guarantee until S3. */
 insertInitial(account:string,record:StoredRevision):void {
  this.transaction(()=>{
   if(record.manifest.revision.sequence!==1||record.operation!=='create-project'||record.lifecycle!=='active')throw new TestStoreError('INITIAL_RECORD');
   const n=this.database.prepare('SELECT count(*) AS n FROM projects WHERE account=?').get(account)?.n;
   if(typeof n!=='number'||n>=this.limits.maxProjectsPerAccount)throw new TestStoreError('TEST_PROJECT_LIMIT');
   this.database.prepare('INSERT INTO projects(account,id,head,lifecycle) VALUES(?,?,?,?)').run(account,record.manifest.projectId,record.manifest.revision.id,record.lifecycle);
   this.insertRevision(account,record);
  });
 }
 verifyAll():void {
  for(const row of this.database.prepare('SELECT * FROM revisions ORDER BY project_id,sequence').all()) {
   const r=this.decode(row),m=r.manifest;
   if(m.revision.parentId!==null){const parent=this.revision(text(row,'account'),m.projectId,m.revision.parentId);if(!parent||parent.manifest.revision.sequence+1!==m.revision.sequence)throw new TestStoreError('REVISION_LINEAGE');}
   if(m.revision.restoreOf!==null){const source=this.revision(text(row,'account'),m.projectId,m.revision.restoreOf);if(!source||source.lifecycle!=='active'||source.manifest.revision.sequence>=m.revision.sequence)throw new TestStoreError('RESTORE_LINEAGE');}
  }
  for(const p of this.database.prepare('SELECT * FROM projects').all()){
   const head=this.head(text(p,'account'),text(p,'id'));if(!head)throw new TestStoreError('HEAD_MISSING');
   const max=this.database.prepare('SELECT max(sequence) AS n FROM revisions WHERE project_id=?').get(text(p,'id'))?.n;
   if(max!==head.manifest.revision.sequence)throw new TestStoreError('HEAD_NOT_LATEST');
  }
 }
}
