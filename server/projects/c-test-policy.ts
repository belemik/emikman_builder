import type {RepositoryOperation} from '../../src/projects/repository.dto';
import type {TestResourceReference} from './verified-principal';
export const C_TEST_PROFILE=Object.freeze({id:'zarya.p04.c.http.test/v1',bodyBytes:262144,targetBytes:2048,queryBytes:1024,headerBytes:8192,outputBytes:65536,internalBytes:2097152,active:1,queued:2,connections:16,queueMs:500,ingressMs:1000,workerMs:3000,totalMs:5000,cursors:64,cursorMs:5000,pageDefault:2,pageMax:4});
export const C_OPERATIONS:readonly RepositoryOperation[]=['create-project','read-project','list-projects','update-metadata','list-revisions','read-revision','create-revision','restore-project','soft-delete-project'];
export const isCOperation=(v:unknown):v is RepositoryOperation=>typeof v==='string'&&C_OPERATIONS.some(op=>op===v);
export const isCWrite=(op:RepositoryOperation)=>['create-project','update-metadata','create-revision','restore-project','soft-delete-project'].includes(op);
export class CFailure extends Error {constructor(readonly status:number,readonly code:string){super(code);}}
export function cFail(status:number,code:string):never {throw new CFailure(status,code);}
export function cRecord(v:unknown):v is Record<string,unknown>{return typeof v==='object'&&v!==null&&!Array.isArray(v);}
import type { BSqliteContention } from './b-test-repository';
import type { BWebPageProfile } from './b-test-web-page';
import type { CWebOperation } from './c-test-web-page-policy';

export interface CJob {readonly main:string;readonly ledger:string;readonly account:string;readonly expires:number;readonly state:SharedArrayBuffer;readonly operation:RepositoryOperation|CWebOperation;readonly webPageProfile?:BWebPageProfile;readonly mode:'command'|'reconcile'|'read';readonly bytes:Uint8Array;readonly project:string|null;readonly target:string;readonly diagnostic?:true;readonly fault:'none'|'spin'|'revoke-after-commit'|'before-web-commit';}
const transactionStages = ['not-observed', 'intent-prepared', 'before-begin', 'in-transaction', 'main-committed', 'ledger-finalized'] as const;
export interface CStorageDiagnostic {
 readonly stage: typeof transactionStages[number];
 readonly sqlite: BSqliteContention | null;
}
export function isCStorageDiagnostic(value:unknown):value is CStorageDiagnostic {
 return cRecord(value) && transactionStages.some(stage => stage === value.stage)
  && (value.sqlite === null || value.sqlite === 'SQLITE_BUSY' || value.sqlite === 'SQLITE_LOCKED');
}
export interface CReply {readonly kind:'c-reply';readonly body:string;readonly refs:readonly TestResourceReference[];readonly webPageEdit?:boolean;readonly diagnostic?:CStorageDiagnostic;}
