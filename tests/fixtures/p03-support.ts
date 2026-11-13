import assert from 'node:assert/strict';
import {TestFixtureAuthority} from '../../server/projects/test-authority';
import {DisposableMetadataStore,type TestStoreLimits} from '../../server/projects/sqlite-metadata-store';
import {createDisposableVolume,adoptDisposableVolume} from '../../server/projects/disposable-volume';
import {TestMetadataRepository,type FaultStage} from '../../server/projects/metadata-repository';
import type {ProjectMutationResult,CreateProjectRequest,CommitReceipt} from '../../src/projects/repository.dto';
export const limits:TestStoreLimits={maxMetadataUtf8Bytes:32768,maxProjectsPerAccount:32,maxRevisionsPerProject:128,maxReceiptsPerAccount:512,maxRequestNodes:256,maxRequestUtf8Bytes:65536,busyTimeoutMs:3000};
export const header={dtoVersion:'1.0.0',modelId:'zarya.project-envelope',modelVersion:'1.0.0',registry:{id:'zarya.project-definitions',version:'1.1.0-draft.1'}} as const;
export function createRequest(key='retry-1',name='Fixture project'):CreateProjectRequest{return {...header,idempotencyKey:key,metadata:{name,description:'Keep \r\n e\u0301 unchanged',defaultProductRef:null}};}
export function receipt(result:ProjectMutationResult):CommitReceipt {assert.equal(result.kind,'committed');if(result.kind!=='committed')throw Error('Expected committed fixture');return result.receipt;}
export function environment(directory?:string,fault?:(stage:FaultStage)=>void){
 const volume=directory?adoptDisposableVolume(directory):createDisposableVolume();const authority=new TestFixtureAuthority(['fixture-account-A','fixture-account-B']);
 const context=authority.context('fixture-account-A'),other=authority.context('fixture-account-B');const store=new DisposableMetadataStore(volume,limits);const repo=new TestMetadataRepository(store,authority,fault);
 return {volume,authority,context,other,store,repo};
}
