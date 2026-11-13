import {mkdtempSync,realpathSync,lstatSync,readFileSync,writeFileSync,openSync,closeSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,relative,sep} from 'node:path';
export type BVolume=Readonly<{directory:string;databasePath:string;role:'main'|'ledger'|'snapshot'}>;
const owned=new WeakSet<object>();
export function createBTestVolume(role:BVolume['role']):BVolume {
 if(!['main','ledger','snapshot'].includes(role))throw Error('B_TEST_ROLE');
 const directory=mkdtempSync(join(realpathSync(tmpdir()),'zarya-p04-b-'));
 writeFileSync(join(directory,'.b-test-only'),'ZARYA_B_TEST_ONLY_V1 '+role+'\n',{flag:'wx',mode:0o600});return adoptBTestVolume(directory);
}
export function adoptBTestVolume(directory:string):BVolume {
 const base=realpathSync(tmpdir()),real=realpathSync(directory),rel=relative(base,real);
 if(real!==directory||rel.startsWith('..')||rel.includes(sep)||!rel.startsWith('zarya-p04-b-')||(lstatSync(real).mode&0o777)!==0o700)throw Error('B_TEST_VOLUME');
 const marker=readFileSync(join(real,'.b-test-only'),'utf8'),role=marker.replace('ZARYA_B_TEST_ONLY_V1 ','').trim();
 if((role!=='main'&&role!=='ledger'&&role!=='snapshot')||marker!=='ZARYA_B_TEST_ONLY_V1 '+role+'\n')throw Error('B_TEST_MARKER');
 const v=Object.freeze({directory:real,databasePath:join(real,'b-test.sqlite'),role});owned.add(v);assertBTestVolume(v);return v;
}
export function assertBTestVolume(v:BVolume):void {
 if(!owned.has(v))throw Error('B_TEST_VOLUME_IDENTITY');
 if(realpathSync(v.directory)!==v.directory||(lstatSync(v.directory).mode&0o777)!==0o700||readFileSync(join(v.directory,'.b-test-only'),'utf8')!=='ZARYA_B_TEST_ONLY_V1 '+v.role+'\n')throw Error('B_TEST_VOLUME');
 if(existsSync(v.databasePath)){const s=lstatSync(v.databasePath);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)throw Error('B_TEST_FILE');}
}
export function createBTestFile(v:BVolume):void {assertBTestVolume(v);closeSync(openSync(v.databasePath,'wx',0o600));}
