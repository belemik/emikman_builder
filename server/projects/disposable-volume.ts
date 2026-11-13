import { mkdtempSync, realpathSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
export type DisposableVolume = Readonly<{ directory: string; databasePath: string }>;
const owned=new WeakSet<object>();
const marker='ZARYA P03 DISPOSABLE TEST DATA v1\n';
function checkDirectory(directory: string): void {
  const base=realpathSync(tmpdir()), real=realpathSync(directory), rel=relative(base,real);
  if(real!==directory||rel.startsWith('..')||rel.includes(sep)||!rel.startsWith('zarya-p03-')
    ||lstatSync(directory).isSymbolicLink()||(lstatSync(directory).mode&0o777)!==0o700
    ||readFileSync(join(directory,'.p03-test-only'),'utf8')!==marker) throw Error('DISPOSABLE_VOLUME_REQUIRED');
}
/** Test-only temporary volume; no DATA_DIR, app directory or existing arbitrary DB path accepted. */
export function createDisposableVolume(): DisposableVolume {
  const directory=mkdtempSync(join(realpathSync(tmpdir()),'zarya-p03-'));
  writeFileSync(join(directory,'.p03-test-only'),marker,{flag:'wx',mode:0o600});
  return adoptDisposableVolume(directory);
}
/** Only for reopening a caller-owned test volume and trusted child fixtures. No network entry. */
export function adoptDisposableVolume(directory: string): DisposableVolume {
  checkDirectory(directory);const result=Object.freeze({directory,databasePath:join(directory,'metadata.sqlite')});
  owned.add(result);return result;
}
export function assertDisposableVolume(volume: DisposableVolume): void {
  if(!owned.has(volume))throw Error('DISPOSABLE_CAPABILITY_REQUIRED');
  checkDirectory(volume.directory);
  try { const stat=lstatSync(volume.databasePath);if(stat.isSymbolicLink()||!stat.isFile()||stat.nlink!==1)throw Error('DISPOSABLE_FILE_REQUIRED'); }
  catch(error){if(!(error instanceof Error&&'code' in error&&error.code==='ENOENT'))throw error;}
}
