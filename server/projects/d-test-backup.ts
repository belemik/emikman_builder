import {DatabaseSync,backup} from 'node:sqlite';
import {existsSync,readFileSync,writeFileSync,statSync,openSync,readSync,closeSync,chmodSync} from 'node:fs';
import {createHash} from 'node:crypto';import {join} from 'node:path';
import {assertBTestVolume,type BVolume} from './b-test-volume';import {BTestRepository} from './b-test-repository';import {dFile} from './d-test-control';
export type DStage='manifest-write'|'before-restore'|'after-fence'|'copy-progress'|'after-copy'|'after-verification';
export type DFault=(stage:DStage)=>void;
export const D_MANIFEST='d-backup.manifest';
const maximum=32*1024*1024;
export function dCounts(db:DatabaseSync):number[]{return ['projects','revisions','receipts','operation_status','audit'].map(t=>{const n=db.prepare('SELECT count(*) n FROM '+t).get()?.n;if(typeof n!=='number'||!Number.isSafeInteger(n))throw Error('D_COUNTS');return n;});}
export function dDigest(path:string):string {
 dFile(path);const size=statSync(path).size;if(size<1||size>maximum)throw Error('D_BACKUP_SIZE');const fd=openSync(path,'r'),hash=createHash('sha256'),buffer=Buffer.alloc(65536);let total=0;
 try{for(;;){const n=readSync(fd,buffer,0,buffer.length,null);if(!n)break;total+=n;if(total>maximum)throw Error('D_BACKUP_SIZE');hash.update(buffer.subarray(0,n));}if(total!==size||statSync(path).size!==size)throw Error('D_BACKUP_CHANGED');return hash.digest('hex');}finally{closeSync(fd);}
}
export async function createDBackup(repo:BTestRepository,target:BVolume,fault?:DFault):Promise<void>{
 await repo.snapshot(target);const meta=repo.ledger.meta(),bytes=statSync(target.databasePath).size,hash=dDigest(target.databasePath),counts=dCounts(repo.database);
 if(typeof meta.store_id!=='string'||typeof meta.generation!=='number')throw Error('D_META');
 const manifest=['ZARYA_D_BACKUP_TEST_V1','schema=1','store='+meta.store_id,'generation='+meta.generation,'bytes='+bytes,'sha256='+hash,'counts='+counts.join(',')].join('\n')+'\n';fault?.('manifest-write');writeFileSync(join(target.directory,D_MANIFEST),manifest,{flag:'wx',mode:0o600});
}
export function inspectDBackup(volume:BVolume,store:string,generation:number){
 assertBTestVolume(volume);if(volume.role!=='snapshot')throw Error('D_SNAPSHOT_ROLE');const path=join(volume.directory,D_MANIFEST);dFile(path);if(statSync(path).size>2048)throw Error('D_MANIFEST_SIZE');const b=readFileSync(path);if(b.some(x=>x>127))throw Error('D_MANIFEST');
 const match=/^ZARYA_D_BACKUP_TEST_V1\nschema=1\nstore=([0-9a-f-]{36})\ngeneration=([1-9][0-9]*)\nbytes=([1-9][0-9]*)\nsha256=([0-9a-f]{64})\ncounts=([0-9]+,[0-9]+,[0-9]+,[0-9]+,[0-9]+)\n$/.exec(b.toString('ascii'));
 if(!match||match[1]!==store)throw Error('D_MANIFEST');const g=Number(match[2]),size=Number(match[3]),counts=match[5].split(',').map(Number);if(!Number.isSafeInteger(g)||g>generation||!Number.isSafeInteger(size)||size>maximum||counts.some(x=>!Number.isSafeInteger(x)||x<0))throw Error('D_MANIFEST');
 if(statSync(volume.databasePath).size!==size||dDigest(volume.databasePath)!==match[4])throw Error('D_CHECKSUM');const db=new DatabaseSync(volume.databasePath,{readOnly:true});
 try{db.exec('PRAGMA query_only=ON;PRAGMA trusted_schema=OFF;');const m=db.prepare('SELECT * FROM b_meta').get();if(db.prepare('PRAGMA user_version').get()?.user_version!==1||db.prepare('SELECT profile FROM store_profile').get()?.profile!=='zarya.p04.b.store.test/v1'||m?.store_id!==store||m.generation!==g||db.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length||dCounts(db).some((x,i)=>x!==counts[i]))throw Error('D_BACKUP_INTEGRITY');}finally{db.close();}
 return Object.freeze({generation:g,sha256:match[4],bytes:size,counts:Object.freeze(counts)});
}
export async function copyDRestore(snapshot:BVolume,target:BVolume,generation:number,fault?:DFault){
 assertBTestVolume(target);if(target.role!=='main'||existsSync(target.databasePath))throw Error('D_FRESH_TARGET');
 const db=new DatabaseSync(snapshot.databasePath,{readOnly:true});try{await backup(db,target.databasePath,{rate:1,progress:info=>{if(info.remainingPages>0)fault?.('copy-progress');}});chmodSync(target.databasePath,0o600);fault?.('after-copy');const restored=new DatabaseSync(target.databasePath);try{restored.exec('PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;');restored.prepare('UPDATE b_meta SET generation=?').run(generation);}finally{restored.close();}}finally{db.close();}
}
