import {DatabaseSync} from 'node:sqlite';import {existsSync,openSync,closeSync,lstatSync} from 'node:fs';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {assertBTestVolume,createBTestFile,type BVolume} from './b-test-volume';
export type BRow=Record<string,unknown>;
export function text(r:BRow,k:string):string {const v=r[k];if(typeof v!=='string')throw Error('B_RECORD');return v;}
export function number(r:BRow,k:string):number {const v=r[k];if(typeof v!=='number'||!Number.isSafeInteger(v))throw Error('B_RECORD');return v;}
export class BTestLedger {
 readonly database:DatabaseSync;#mutex:DatabaseSync;#depth=0;
 constructor(readonly volume:BVolume) {
  assertBTestVolume(volume);if(volume.role!=='ledger')throw Error('B_LEDGER_ROLE');const fresh=!existsSync(volume.databasePath);if(fresh)createBTestFile(volume);
  const lockPath=join(volume.directory,'b-coordinator.sqlite');if(!existsSync(lockPath))closeSync(openSync(lockPath,'wx',0o600));const st=lstatSync(lockPath);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1)throw Error('B_MUTEX_FILE');
  this.#mutex=new DatabaseSync(lockPath);this.#mutex.exec('PRAGMA busy_timeout=600;CREATE TABLE IF NOT EXISTS mutex_marker(v INTEGER);');
  this.database=new DatabaseSync(volume.databasePath);
  try {
   this.database.exec('PRAGMA busy_timeout=600;PRAGMA synchronous=FULL;');
   if(fresh)this.database.exec(`PRAGMA journal_mode=WAL;BEGIN IMMEDIATE;
    PRAGMA user_version=1;
    CREATE TABLE meta(profile TEXT PRIMARY KEY,store_id TEXT NOT NULL,generation INTEGER NOT NULL CHECK(generation>0),path TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN('ACTIVE','FENCED'))) STRICT;
    CREATE TABLE intents(account TEXT NOT NULL,scope TEXT NOT NULL,operation TEXT NOT NULL,key TEXT NOT NULL,fingerprint TEXT NOT NULL,op_id TEXT NOT NULL UNIQUE,generation INTEGER NOT NULL,expires_ms INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN('PREPARED','COMMITTED','REJECTED')),reason TEXT,PRIMARY KEY(account,scope,operation,key)) STRICT;
    COMMIT;`);
   if(fresh)this.database.prepare('INSERT INTO meta VALUES(?,?,1,?,?)').run('zarya.p04.b.ledger.test/v1',randomUUID(),'','ACTIVE');
   if(this.database.prepare('PRAGMA user_version').get()?.user_version!==1||this.database.prepare('SELECT profile FROM meta').get()?.profile!=='zarya.p04.b.ledger.test/v1'||this.database.prepare('PRAGMA journal_mode').get()?.journal_mode!=='wal')throw Error('B_LEDGER_VERSION');
   if(this.database.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok')throw Error('B_LEDGER_INTEGRITY');
  }catch(e){this.database.close();throw e;}
 }
 meta():BRow {const row=this.database.prepare('SELECT * FROM meta').get();if(!row)throw Error('B_META');return row;}
 exclusive<T>(fn:()=>T):T {
  if(this.#depth)return fn();this.#mutex.exec('BEGIN IMMEDIATE');this.#depth++;try{return fn();}finally{this.#depth--;this.#mutex.exec('ROLLBACK');}
 }
 locked<T>(fn:()=>T):T {
  return this.exclusive(()=>{this.database.exec('BEGIN IMMEDIATE');try{const r=fn();this.database.exec('COMMIT');return r;}catch(e){try{this.database.exec('ROLLBACK');}catch{}throw e;}});
 }
 find(account:string,scope:string,op:string,key:string):BRow|undefined {return this.database.prepare('SELECT * FROM intents WHERE account=? AND scope=? AND operation=? AND key=?').get(account,scope,op,key);}
 setState(id:string,state:'COMMITTED'|'REJECTED',reason:string|null=null):void {this.database.prepare('UPDATE intents SET state=?,reason=? WHERE op_id=?').run(state,reason,id);}
 close():void {this.database.close();this.#mutex.close();}
}
