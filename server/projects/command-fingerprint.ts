import {createHash} from 'node:crypto';
import {canonicalizeJcsData} from '../../src/projects/canonicalize-project';
import type {RequestJson} from '../../src/projects/repository.dto';
/** Test-only v1: full closed DTO, including headers/guards/key, plus authoritative scope.
 * Generated project/revision IDs, time, request IDs and credentials are not request inputs.
 * No TTL for disposable store lifetime. Neither this profile nor retention is production. */
export function commandFingerprint(operation:string,account:string,projectScope:string,request:RequestJson):string {
 const result=canonicalizeJcsData({operation,account,projectScope,request});
 if(result.kind!=='canonicalized')throw Error('TEST_COMMAND_NOT_CANONICAL');
 return createHash('sha256').update('zarya.p03.test-command.jcs/v1\0','utf8').update(result.canonicalText,'utf8').digest('hex');
}
export function receiptChecksum(account:string,scopeProject:string,operation:string,key:string,projectId:string,revisionId:string,fingerprint:string):string {
 const r=canonicalizeJcsData({account,scopeProject,operation,key,projectId,revisionId,fingerprint});
 if(r.kind!=='canonicalized')throw Error('TEST_RECEIPT_NOT_CANONICAL');
 return createHash('sha256').update('zarya.p03.test-receipt.jcs/v1\0').update(r.canonicalText).digest('hex');
}
