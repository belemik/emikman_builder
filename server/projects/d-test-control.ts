import {DatabaseSync} from 'node:sqlite';
import {existsSync,openSync,closeSync,lstatSync} from 'node:fs';
import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {assertBTestVolume,type BVolume} from './b-test-volume';
export const D_PROFILE='zarya.p04.d.operations.test/v1';
export const D_STATES=['HEALTHY','DEGRADED','READ_ONLY','FENCED','RECOVERY_REQUIRED','RECOVERING'] as const;
export type DState=typeof D_STATES[number];
export const D_CODES=['D_STARTUP','D_VALIDATED','D_DEGRADED','D_READ_ONLY','D_FENCED','D_CHECK_REQUIRED','D_RECOVERING','D_BACKUP_OK','D_BACKUP_FAILED','D_RESTORE_OK','D_RESTORE_FAILED','D_AMBIGUOUS','D_COMMITTED','D_CONFLICT','D_INVALID_TRANSITION','D_STORAGE','D_CONTROL'] as const;
export type DCode=typeof D_CODES[number];
export function dState(v:unknown):v is DState{return typeof v==='string'&&D_STATES.some(x=>x===v);}
export function dCode(v:unknown):v is DCode{return typeof v==='string'&&D_CODES.some(x=>x===v);}
export function dFile(path:string):void {const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||(s.mode&0o777)!==0o600)throw Error('D_FILE');}
export function readDControl(volume:BVolume){
 assertBTestVolume(volume);const path=join(volume.directory,'d-control.sqlite');dFile(path);const db=new DatabaseSync(path,{readOnly:true});try{const r=db.prepare('SELECT * FROM control').get();if(db.prepare('PRAGMA user_version').get()?.user_version!==1||!r||r.profile!==D_PROFILE||!dState(r.state)||!dCode(r.code)||typeof r.generation!=='number'||!Number.isSafeInteger(r.generation)||r.generation<1||typeof r.store!=='string')throw Error('D_CONTROL');return {state:r.state,code:r.code,generation:r.generation,store:r.store};}finally{db.close();}
}
/** External to main snapshots. Private trusted TEST administration; no HTTP interface. */
export class DTestControl {
 readonly database:DatabaseSync;readonly path:string;#owner:DatabaseSync;
 constructor(readonly volume:BVolume,store:string,generation:number,freshAllowed:boolean){
  assertBTestVolume(volume);if(volume.role!=='ledger')throw Error('D_ROLE');this.path=join(volume.directory,'d-control.sqlite');const fresh=!existsSync(this.path);if(fresh&&!freshAllowed)throw Error('D_MISSING_CONTROL');
  const owner=join(volume.directory,'d-owner.sqlite');if(!existsSync(owner))closeSync(openSync(owner,'wx',0o600));dFile(owner);this.#owner=new DatabaseSync(owner);
  try{this.#owner.exec('PRAGMA busy_timeout=100;BEGIN IMMEDIATE');}catch{this.#owner.close();throw Error('D_OWNER_BUSY');}
  if(fresh)closeSync(openSync(this.path,'wx',0o600));dFile(this.path);this.database=new DatabaseSync(this.path);
  try{
   this.database.exec('PRAGMA busy_timeout=100;PRAGMA synchronous=FULL;');
   if(fresh){this.database.exec(`PRAGMA journal_mode=WAL;BEGIN IMMEDIATE;PRAGMA user_version=1;
    CREATE TABLE control(profile TEXT PRIMARY KEY,store TEXT NOT NULL,generation INTEGER NOT NULL CHECK(generation>0),state TEXT NOT NULL CHECK(state IN('HEALTHY','DEGRADED','READ_ONLY','FENCED','RECOVERY_REQUIRED','RECOVERING')),code TEXT NOT NULL) STRICT;
    CREATE TABLE events(seq INTEGER PRIMARY KEY,correlation TEXT NOT NULL UNIQUE,generation INTEGER NOT NULL,code TEXT NOT NULL,operation_id TEXT) STRICT;
    CREATE TRIGGER events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'D_IMMUTABLE_AUDIT');END;
    CREATE TRIGGER events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'D_IMMUTABLE_AUDIT');END;`);this.database.prepare('INSERT INTO control VALUES(?,?,?,?,?)').run(D_PROFILE,store,generation,'RECOVERY_REQUIRED','D_STARTUP');this.database.exec('COMMIT');}
   const row=this.read();if(row.store!==store||row.generation>generation)throw Error('D_FENCE_ROLLBACK');
  }catch(e){this.database.close();this.#owner.exec('ROLLBACK');this.#owner.close();throw e;}
 }
 read(){return readDControl(this.volume);}
 set(state:DState,code:DCode,generation:number,operationId:string|null=null):void {
  if(!dState(state)||!dCode(code)||!Number.isSafeInteger(generation)||generation<1||operationId!==null&&!/^bop_[0-9a-f-]{36}$/.test(operationId))throw Error('D_EVENT');dFile(this.path);
  this.database.exec('BEGIN IMMEDIATE');try{const seen=this.database.prepare('SELECT generation FROM control').get()?.generation;if(typeof seen!=='number'||generation<seen)throw Error('D_FENCE_ROLLBACK');const n=this.database.prepare('SELECT count(*) n FROM events').get()?.n;if(typeof n!=='number'||n>=1024)throw Error('D_AUDIT_BUDGET');this.database.prepare('UPDATE control SET state=?,code=?,generation=?').run(state,code,generation);this.database.prepare('INSERT INTO events(correlation,generation,code,operation_id) VALUES(?,?,?,?)').run('dc_'+randomUUID(),generation,code,operationId);this.database.exec('COMMIT');}catch(e){this.database.exec('ROLLBACK');throw e;}
 }
 events(){return this.database.prepare('SELECT seq,correlation,generation,code,operation_id FROM events ORDER BY seq').all();}
 close(){this.database.close();this.#owner.exec('ROLLBACK');this.#owner.close();}
}
