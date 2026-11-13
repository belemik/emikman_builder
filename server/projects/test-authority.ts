import { randomUUID } from 'node:crypto';
import type { RepositoryContext, ServerVerifiedPrincipal } from '../../src/projects/repository.port';
/** Synthetic fixture authority ONLY. It never reads sessions/users or creates server accounts.
 * Full context identity in a private WeakMap, not accountId/brands, is the authority. */
export class TestFixtureAuthority {
 #contexts=new WeakMap<object,string>();#revoked=new Set<string>();
 constructor(private readonly accounts:readonly string[]) {
  if(!accounts.length||new Set(accounts).size!==accounts.length||accounts.some(a=>!/^fixture-account-[A-Z]$/.test(a)))throw Error('FIXTURE_ACCOUNTS_REQUIRED');
  this.accounts=Object.freeze([...accounts]);
 }
 context(account:string):RepositoryContext {
  if(!this.accounts.includes(account)||this.#revoked.has(account))throw Error('FIXTURE_PRINCIPAL_UNAVAILABLE');
  // Narrow nominal bridge for a newly minted, frozen INTERNAL principal only. This assertion
  // is not a security test: no client object is cast, and authorize ignores brands/claims.
  const principal=Object.freeze({accountId:account}) as ServerVerifiedPrincipal;
  const context=Object.freeze({principal,requestId:'test-request-'+randomUUID()});
  this.#contexts.set(context,account);return context;
 }
 authorize(context:RepositoryContext):string|null {
  const account=this.#contexts.get(context);return account&&!this.#revoked.has(account)?account:null;
 }
 revoke(account:string):void {this.#revoked.add(account);}
}
