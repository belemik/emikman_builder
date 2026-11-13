import type {RepositoryOperation} from '../../src/projects/repository.dto';
import type {TestResourceReference} from './verified-principal';
export const C_TEST_PROFILE=Object.freeze({id:'zarya.p04.c.http.test/v1',bodyBytes:262144,targetBytes:2048,queryBytes:1024,headerBytes:8192,outputBytes:65536,internalBytes:2097152,active:1,queued:2,connections:16,queueMs:500,ingressMs:1000,workerMs:3000,totalMs:5000,cursors:64,cursorMs:5000,pageDefault:2,pageMax:4});
export const C_OPERATIONS:readonly RepositoryOperation[]=['create-project','read-project','list-projects','update-metadata','list-revisions','read-revision','create-revision','restore-project','soft-delete-project'];
export const isCOperation=(v:unknown):v is RepositoryOperation=>typeof v==='string'&&C_OPERATIONS.some(op=>op===v);
export const isCWrite=(op:RepositoryOperation)=>['create-project','update-metadata','create-revision','restore-project','soft-delete-project'].includes(op);
export class CFailure extends Error {constructor(readonly status:number,readonly code:string){super(code);}}
export function cFail(status:number,code:string):never {throw new CFailure(status,code);}
export function cRecord(v:unknown):v is Record<string,unknown>{return typeof v==='object'&&v!==null&&!Array.isArray(v);}
export interface CJob {readonly main:string;readonly ledger:string;readonly account:string;readonly expires:number;readonly state:SharedArrayBuffer;readonly operation:RepositoryOperation;readonly mode:'command'|'reconcile'|'read';readonly bytes:Uint8Array;readonly project:string|null;readonly target:string;readonly fault:'none'|'spin'|'revoke-after-commit';}
export interface CReply {readonly kind:'c-reply';readonly body:string;readonly refs:readonly TestResourceReference[];}
