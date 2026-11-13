/** H0-H6 synthetic contracts ONLY. No production principal, API, cursor or receipt authority. */
import { randomUUID } from 'node:crypto';
export type FixtureRow = Readonly<{ id:string; account:string; name:string; deleted:boolean }>;
export type FixtureScope = Readonly<{ account:string; collection:string; epoch:number; includeDeleted:boolean }>;
const scopeKey=(s:FixtureScope)=>JSON.stringify([s.account,s.collection,s.epoch,s.includeDeleted]);
/** Synthetic opaque cursor registry; bounded lifetime/size, not a wire codec or production service. */
export class FixturePages {
  #cursors=new Map<string,{scope:string;last:string;expires:number;limit:number}>();
  constructor(readonly ttlMs:number) {if(!Number.isSafeInteger(ttlMs)||ttlMs<1)throw Error('TEST_TTL');}
  page(rows:readonly FixtureRow[],scope:FixtureScope,limit:number,now:number,cursor:string|null=null) {
    if(!Number.isSafeInteger(limit)||limit<1||limit>4||rows.length>64||!Number.isSafeInteger(now)||now<0)throw Error('TEST_BUDGET');
    // Bounded owned synthetic rows, never arbitrary unknown data or unbounded JSON.stringify.
    if(rows.some(r=>r.id.length>64||r.account.length>64||Buffer.byteLength(r.name)>128))throw Error('TEST_ROW_BUDGET');
    if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('TEST_DUPLICATE_ID');
    const key=scopeKey(scope);let last='';
    if(cursor!==null) {
      const c=this.#cursors.get(cursor);
      if(!c||c.scope!==key||now>=c.expires||c.limit!==limit)throw Error('TEST_CURSOR');
      last=c.last;
    }
    const visible=rows.filter(r=>r.account===scope.account&&(scope.includeDeleted||!r.deleted)&&r.id>last).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
    const items=visible.slice(0,limit).map(r=>Object.freeze({id:r.id,name:r.name}));let nextCursor:string|null=null;
    if(visible.length>limit) {
      for(const [token,c] of this.#cursors)if(now>=c.expires)this.#cursors.delete(token);
      if(this.#cursors.size>=64)throw Error('TEST_CURSOR_CAPACITY');
      nextCursor='fixture-cursor-'+randomUUID();
      this.#cursors.set(nextCursor,{scope:key,last:items[items.length-1].id,expires:now+this.ttlMs,limit});
    }
    return Object.freeze({items:Object.freeze(items),nextCursor,scope:'H3_SYNTHETIC_CONTRACT_ONLY' as const});
  }
}
export type ReconciliationInput=Readonly<{authorized:boolean;currentEpoch:string;operationEpoch:string;
 fingerprint:string;receiptFingerprint:string|null;now:number;expires:number}>;
/** Read-only reconciliation candidate. NEVER authorizes a new write, including absent/expired receipts. */
export function fixtureStatus(i:ReconciliationInput):'DENIED'|'UNKNOWN_OUTCOME'|'KEY_CONFLICT'|'REPLAY' {
  if(!i.authorized)return 'DENIED';
  if(i.currentEpoch!==i.operationEpoch||i.now>=i.expires||i.receiptFingerprint===null)return 'UNKNOWN_OUTCOME';
  return i.fingerprint===i.receiptFingerprint?'REPLAY':'KEY_CONFLICT';
}
/** Discard late UI results after account/session generation changes; no UI/session integration. */
export function fixtureMayPublish(start:Readonly<{account:string;generation:number}>,current:Readonly<{account:string;generation:number}>):boolean {
  return start.account===current.account&&start.generation===current.generation;
}
