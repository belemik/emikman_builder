import { TestSessionAuthority } from '../../server/projects/test-session-authority';
import { DisposableMetadataStore } from '../../server/projects/sqlite-metadata-store';
import { createDisposableVolume, adoptDisposableVolume } from '../../server/projects/disposable-volume';
import { TestCommandRepository } from '../../server/projects/test-command-repository';
import { createTestCommandCandidate } from '../../server/projects/test-command-candidate';
import type { FaultStage } from '../../server/projects/metadata-repository';
export { limits, header, createRequest, receipt } from './p03-support';
import { limits } from './p03-support';
export const encode=(value: object) => new TextEncoder().encode(JSON.stringify(value));
export function candidate(op:string,input:object) {
  const r=createTestCommandCandidate(op,encode(input));if(r.kind!=='candidate')throw Error('BAD_SYNTHETIC_FIXTURE');return r.candidate;
}
export function testEnvironment(options: { directory?:string; fault?:(stage:FaultStage)=>void }={}) {
  const volume=options.directory?adoptDisposableVolume(options.directory):createDisposableVolume();
  const sessions=new TestSessionAuthority(['fixture-account-A','fixture-account-B']);
  const store=new DisposableMetadataStore(volume,limits);const repository=new TestCommandRepository(store,sessions,options.fault);
  return {volume,sessions,store,repository};
}
