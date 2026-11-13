import {randomBytes} from 'node:crypto';
export interface CLease {readonly key:object;readonly identity:object;readonly account:string;readonly expires:number;readonly state:SharedArrayBuffer;}
/** Synthetic fixture bootstrap only. No cookie/login API and no real server session imports. */
export class CTestSessions {
 #tokens=new Map<string,CLease>();
 issue(account:string,ttl=60000):string {
  if(!/^[ab]{32}$/.test(account)||new Set(account).size!==1||!Number.isSafeInteger(ttl)||ttl<1||ttl>60000||this.#tokens.size>=64)throw Error('C_FIXTURE_SESSION');
  const token='ct_'+randomBytes(16).toString('hex');this.#tokens.set(token,this.make(account,ttl));return token;
 }
 private make(account:string,ttl:number):CLease {const state=new SharedArrayBuffer(4);Atomics.store(new Int32Array(state),0,1);return Object.freeze({key:Object.freeze({}),identity:Object.freeze({}),account,expires:Date.now()+ttl,state});}
 get(token:string):CLease|null {const v=this.#tokens.get(token);return v&&this.current(token,v)?v:null;}
 current(token:string,lease:CLease):boolean {return this.#tokens.get(token)===lease&&Atomics.load(new Int32Array(lease.state),0)===1&&Date.now()<lease.expires;}
 resolve(key:object){for(const lease of this.#tokens.values())if(lease.key===key&&Atomics.load(new Int32Array(lease.state),0)===1&&Date.now()<lease.expires)return {identity:lease.identity,accountId:lease.account,generation:1,expiresAt:lease.expires};return null;}
 revoke(token:string):void {const v=this.#tokens.get(token);if(v)Atomics.store(new Int32Array(v.state),0,0);}
 /** Explicit identity-switch fixture, not a production auth API. Old lease is revoked. */
 switchAccount(token:string,account:string):void {if(account!=='a'.repeat(32)&&account!=='b'.repeat(32))throw Error('C_FIXTURE_ACCOUNT');this.revoke(token);this.#tokens.set(token,this.make(account,60000));}
}
