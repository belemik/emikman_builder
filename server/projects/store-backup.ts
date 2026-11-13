import {backup,DatabaseSync} from 'node:sqlite';
import {existsSync,chmodSync} from 'node:fs';
import {assertDisposableVolume,type DisposableVolume} from './disposable-volume';
import {DisposableMetadataStore,type TestStoreLimits} from './sqlite-metadata-store';
import {verifyDisposableRepository} from './metadata-repository';
/** Native SQLite backup, never raw-copy a live DB/WAL. Only a fresh owned temporary target. */
export async function snapshotDisposableStore(source:DisposableMetadataStore,target:DisposableVolume):Promise<void> {
 assertDisposableVolume(source.volume);assertDisposableVolume(target);
 if(source.inTransaction||existsSync(target.databasePath))throw Error('FRESH_DISPOSABLE_BACKUP_TARGET_REQUIRED');
 verifyDisposableRepository(source);
 await backup(source.database,target.databasePath);
 chmodSync(target.databasePath,0o600);
 // Backup destination journal mode is configured explicitly, not assumed from the source.
 const db=new DatabaseSync(target.databasePath);
 try{db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');}finally{db.close();}
 const check=new DisposableMetadataStore(target,source.limits);
 try{verifyDisposableRepository(check);}finally{check.close();}
}
/** Restore is a new-volume clone of a verified SQLite snapshot; never overwrite source/target. */
export async function restoreDisposableSnapshot(snapshot:DisposableVolume,target:DisposableVolume,limits:TestStoreLimits):Promise<void> {
 assertDisposableVolume(snapshot);assertDisposableVolume(target);
 if(!existsSync(snapshot.databasePath)||existsSync(target.databasePath))throw Error('FRESH_DISPOSABLE_RESTORE_TARGET_REQUIRED');
 const source=new DisposableMetadataStore(snapshot,limits);
 try{source.database.exec('PRAGMA query_only=ON');await snapshotDisposableStore(source,target);}finally{source.close();}
}
