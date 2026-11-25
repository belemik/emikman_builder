import { createHash } from 'node:crypto';
import { canonicalizeJcsData } from '../../src/projects/canonicalize-project';
import { inspectProjectRequest } from '../../src/projects/request.validation';
import { hasEntityIdShape } from '../../src/projects/compatibility';
import { MODEL_ID, MODEL_VERSION, REGISTRY_ID, REGISTRY_VERSION } from '../../src/projects/definitions';
import { REPOSITORY_DTO_VERSION } from '../../src/projects/repository.dto';
import type { RepositoryOperation, RequestRecord, RequestJson } from '../../src/projects/repository.dto';
import type { ProjectCommandInspection } from './ingest-profile';
import { createOwnedHandoffTestOnly, takeOwnedHandoffTestOnly } from './decode-project-command';
import { isWebPageOperation, webPageCommandVersion, type WebPageOperation } from '../../src/projects/web-page-repository.dto';
export type BOperation = RepositoryOperation | WebPageOperation;

export const TEST_CANDIDATE_PROFILE = 'zarya.p04.r2.command.test/v0';
export const TEST_QUERY_PROFILE = 'zarya.p04.r5.query.test/v0';
const operations = new Set(['create-project','read-project','list-projects','update-metadata','list-revisions',
  'read-revision','create-revision','restore-project','soft-delete-project']);
function operation(value: string): value is RepositoryOperation { return operations.has(value); }
type CandidateVersion = typeof REPOSITORY_DTO_VERSION | ReturnType<typeof webPageCommandVersion>;
export interface TestCommandCandidate<Op extends BOperation = RepositoryOperation,
  Version extends CandidateVersion = typeof REPOSITORY_DTO_VERSION> {
  readonly profile: typeof TEST_CANDIDATE_PROFILE; readonly operation: Op;
  readonly decoderProfile: string; readonly dtoVersion: Version;
  readonly rawSha256: string; readonly fingerprint: string;
  readonly productionAuthority: 'NOT_GRANTED';
}
type Snapshot<Op extends BOperation = BOperation> = Readonly<{ data: RequestRecord; operation: Op; decoderProfile: string;
  fingerprint: string; rawSha256: string }>;
const candidates = new WeakMap<object, Snapshot>();
const extendedCandidates = new WeakSet<object>();
const hash = (domain: string, value: RequestJson): string => {
  const canonical = canonicalizeJcsData(value);
  if (canonical.kind !== 'canonicalized') throw Error('TEST_CANONICALIZATION_FAILED');
  return createHash('sha256').update(domain,'ascii').update(Buffer.from([0])).update(canonical.canonicalText,'utf8').digest('hex');
};
function mint<Op extends BOperation, Version extends CandidateVersion>(
  op: Op, dtoVersion: Version, decoderProfile: string, data: RequestRecord, raw: Uint8Array, extended = false,
): TestCommandCandidate<Op, Version> {
  const pending: RequestJson[] = [data];
  while (pending.length) { const v=pending.pop()!; if(v!==null&&typeof v==='object'){pending.push(...Object.values(v));Object.freeze(v);} }
  const rawSha256=createHash('sha256').update(raw).digest('hex');
  const fingerprint=hash(TEST_CANDIDATE_PROFILE,{profile:TEST_CANDIDATE_PROFILE,decoderProfile,
    dtoVersion,operation:op,request:data});
  const handle=Object.freeze({profile:TEST_CANDIDATE_PROFILE,operation:op,decoderProfile,
    dtoVersion,rawSha256,fingerprint,productionAuthority:'NOT_GRANTED'} as const);
  candidates.set(handle,Object.freeze({data,operation:op,decoderProfile,rawSha256,fingerprint}));
  if (extended) extendedCandidates.add(handle);
  return handle;
}
/** Only owned bytes inspected in the SAME R1 pass enter mint; never JSON.parse/cast/caller DTO. */
export function createTestCommandCandidate(op: string, bytes: Uint8Array) {
  return createCandidate(op, bytes, false);
}

/** Explicit opt-in for the versioned P04 WebPage profile, including its project revision references. */
export function createWebPageRepositoryCandidate(op: string, bytes: Uint8Array) {
  return createCandidate(op, bytes, true);
}

type Rejected = { readonly kind: 'rejected'; readonly report: ProjectCommandInspection; readonly missingGuard: boolean };
type CandidateResult<Op extends BOperation, Version extends CandidateVersion> =
  Rejected | { readonly kind: 'candidate'; readonly candidate: TestCommandCandidate<Op, Version> };

function createCandidate(op: string, bytes: Uint8Array, extended: false):
  CandidateResult<RepositoryOperation, typeof REPOSITORY_DTO_VERSION>;
function createCandidate(op: string, bytes: Uint8Array, extended: true):
  CandidateResult<BOperation, CandidateVersion>;
function createCandidate(op: string, bytes: Uint8Array, extended: boolean):
  CandidateResult<BOperation, CandidateVersion> {
  const handoff=createOwnedHandoffTestOnly(op,bytes,extended);
  if(!handoff.handle)return {kind:'rejected' as const,report:handoff.report,missingGuard:handoff.missingGuard};
  const owned=takeOwnedHandoffTestOnly(handoff.handle);
  if (!owned) throw Error('TEST_HANDOFF_UNAVAILABLE');
  const { operation: opName, profileId, data, bytes: copied } = owned;
  if (operation(opName)) {
    const candidate = mint(opName, REPOSITORY_DTO_VERSION, profileId, data, copied, extended);
    return Object.freeze({ kind: 'candidate', candidate });
  }
  if (!extended || !isWebPageOperation(opName)) throw Error('TEST_HANDOFF_UNAVAILABLE');
  const version = webPageCommandVersion(opName);
  const candidate = mint(opName, version, version, data, copied, true);
  return Object.freeze({ kind: 'candidate', candidate });
}
/** Server-test-module access only. Registry identity, not public fields/TS casts, is authority.
 * Returns only immutable data. No raw byte view is retained/exposed after fingerprint construction.
 */
export function inspectTestCandidate(handle: object): Snapshot<RepositoryOperation> | null {
  const snap = candidates.get(handle);
  return snap && !extendedCandidates.has(handle) && isLegacySnapshot(snap) ? snap : null;
}
function isLegacySnapshot(snap: Snapshot): snap is Snapshot<RepositoryOperation> {
  return operation(snap.operation);
}
export function inspectWebPageRepositoryCandidate(handle: object): Snapshot | null {
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
  return mint(op,REPOSITORY_DTO_VERSION,TEST_QUERY_PROFILE,data,new TextEncoder().encode(rawTarget));
}
