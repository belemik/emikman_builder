import { createHash } from 'node:crypto';
import { canonicalizeJcsData } from '../../src/projects/canonicalize-project';
import { inspectProjectRequest } from '../../src/projects/request.validation';
import { hasEntityIdShape } from '../../src/projects/compatibility';
import { MODEL_ID, MODEL_VERSION, REGISTRY_ID, REGISTRY_VERSION } from '../../src/projects/definitions';
import { REPOSITORY_DTO_VERSION } from '../../src/projects/repository.dto';
import type { RepositoryOperation, RequestRecord, RequestJson } from '../../src/projects/repository.dto';
import { createOwnedHandoffTestOnly, takeOwnedHandoffTestOnly } from './decode-project-command';
export const TEST_CANDIDATE_PROFILE = 'zarya.p04.r2.command.test/v0';
export const TEST_QUERY_PROFILE = 'zarya.p04.r5.query.test/v0';
const operations = new Set(['create-project','read-project','list-projects','update-metadata','list-revisions',
  'read-revision','create-revision','restore-project','soft-delete-project']);
function operation(value: string): value is RepositoryOperation { return operations.has(value); }
export interface TestCommandCandidate {
  readonly profile: typeof TEST_CANDIDATE_PROFILE; readonly operation: RepositoryOperation;
  readonly decoderProfile: string; readonly dtoVersion: typeof REPOSITORY_DTO_VERSION;
  readonly rawSha256: string; readonly fingerprint: string;
  readonly productionAuthority: 'NOT_GRANTED';
}
type Snapshot = Readonly<{ data: RequestRecord; operation: RepositoryOperation; decoderProfile: string;
  fingerprint: string; rawSha256: string }>;
const candidates = new WeakMap<object, Snapshot>();
const hash = (domain: string, value: RequestJson): string => {
  const canonical = canonicalizeJcsData(value);
  if (canonical.kind !== 'canonicalized') throw Error('TEST_CANONICALIZATION_FAILED');
  return createHash('sha256').update(domain,'ascii').update(Buffer.from([0])).update(canonical.canonicalText,'utf8').digest('hex');
};
function mint(op: RepositoryOperation, decoderProfile: string, data: RequestRecord, raw: Uint8Array): TestCommandCandidate {
  const pending: RequestJson[] = [data];
  while (pending.length) { const v=pending.pop()!; if(v!==null&&typeof v==='object'){pending.push(...Object.values(v));Object.freeze(v);} }
  const rawSha256=createHash('sha256').update(raw).digest('hex');
  const fingerprint=hash(TEST_CANDIDATE_PROFILE,{profile:TEST_CANDIDATE_PROFILE,decoderProfile,
    dtoVersion:REPOSITORY_DTO_VERSION,operation:op,request:data});
  const handle=Object.freeze({profile:TEST_CANDIDATE_PROFILE,operation:op,decoderProfile,
    dtoVersion:REPOSITORY_DTO_VERSION,rawSha256,fingerprint,productionAuthority:'NOT_GRANTED'} as const);
  candidates.set(handle,Object.freeze({data,operation:op,decoderProfile,rawSha256,fingerprint}));return handle;
}
/** Only owned bytes inspected in the SAME R1 pass enter mint; never JSON.parse/cast/caller DTO. */
export function createTestCommandCandidate(op: string, bytes: Uint8Array) {
  const handoff=createOwnedHandoffTestOnly(op,bytes);
  if(!handoff.handle)return {kind:'rejected' as const,report:handoff.report,missingGuard:handoff.missingGuard};
  const owned=takeOwnedHandoffTestOnly(handoff.handle);
  if(!owned||!operation(owned.operation))throw Error('TEST_HANDOFF_UNAVAILABLE');
  const candidate=mint(owned.operation,owned.profileId,owned.data,owned.bytes);
  return Object.freeze({kind:'candidate' as const,candidate});
}
/** Server-test-module access only. Registry identity, not public fields/TS casts, is authority.
 * Returns only immutable data. No raw byte view is retained/exposed after fingerprint construction.
 */
export function inspectTestCandidate(handle: object): Snapshot | null {
  return candidates.get(handle) ?? null;
}
export function discardTestCandidate(handle: object): void { candidates.delete(handle); }
/** GET input has its own closed primitive validation; does NOT feed URL parameters to R1 JSON decoder.
 * No cursor/limit is admitted: pagination remains explicitly unsupported in HTTP query profile.
 */
export function createTestReadCandidate(op: 'read-project'|'list-projects'|'list-revisions', projectId: string|null, rawTarget: string) {
  if(typeof rawTarget!=='string'||rawTarget.length>2048||!/^[\x21-\x7e]+$/.test(rawTarget))throw Error('TEST_QUERY_INPUT');
  const path=op==='list-projects'?'/test/v0/projects':`/test/v0/projects/${projectId}${op==='list-revisions'?'/history':''}`;
  if(rawTarget!==path&&rawTarget!==path+'?')throw Error('TEST_QUERY_INPUT');
  if(op==='list-projects'?projectId!==null:typeof projectId!=='string'||!hasEntityIdShape(projectId,'project'))throw Error('TEST_QUERY_INPUT');
  const data: {[key:string]:RequestJson}={dtoVersion:REPOSITORY_DTO_VERSION,modelId:MODEL_ID,modelVersion:MODEL_VERSION,
    registry:{id:REGISTRY_ID,version:REGISTRY_VERSION}};
  if(projectId!==null)data.projectId=projectId;
  if(op!=='read-project')data.cursor=null;
  if(inspectProjectRequest(op,data).kind!=='dto-shape-recognized')throw Error('TEST_QUERY_DTO');
  return mint(op,TEST_QUERY_PROFILE,data,new TextEncoder().encode(rawTarget));
}
