import {randomUUID} from 'node:crypto';
import {TestFixtureAuthority} from './test-authority';
import type {RepositoryContext} from '../../src/projects/repository.port';
import type {RepositoryOperation} from '../../src/projects/repository.dto';
const operations:readonly RepositoryOperation[]=['create-project','read-project','list-projects','update-metadata',
 'list-revisions','read-revision','create-revision','restore-project','soft-delete-project'];
type Session={account:string;active:boolean;operations:Set<RepositoryOperation>};
/** Synthetic authority ONLY. Fixture setup, not HTTP/client input, can issue sessions.
 * Reuses P03 fixture-context registry in a private bridge. No real cookie/user/session policy.
 * Explicit max64 sessions, no automaticTTL; revocation is checked on EVERY dispatch/retry.
 */
export class TestSessionAuthority {
 #sessions=new Map<string,Session>();#accounts:ReadonlySet<string>;#disabled=new Set<string>();
 #fixture:TestFixtureAuthority;
 constructor(accounts:readonly string[]) {this.#accounts=new Set(accounts);this.#fixture=new TestFixtureAuthority(accounts);}
 issue(account:string):string {
  if(!this.#accounts.has(account)||this.#disabled.has(account)||this.#sessions.size>=64)throw Error('TEST_SESSION_ISSUANCE_REFUSED');
  const token='test-session-'+randomUUID();this.#sessions.set(token,{account,active:true,operations:new Set(operations)});return token;
 }
 revoke(token:string):void {this.#sessions.delete(token);}
 disableAccount(account:string):void {this.#disabled.add(account);this.#fixture.revoke(account);}
 denyOperation(token:string,operation:RepositoryOperation):void {this.#sessions.get(token)?.operations.delete(operation);}
 resolve(token:string,operation:RepositoryOperation):
  |{kind:'authorized';account:string;context:RepositoryContext}|{kind:'unauthenticated'}|{kind:'forbidden'} {
  const session=this.#sessions.get(token);
  if(!session?.active||this.#disabled.has(session.account))return {kind:'unauthenticated'};
  if(!session.operations.has(operation))return {kind:'forbidden'};
  return {kind:'authorized',account:session.account,context:this.#fixture.context(session.account)};
 }
 /** Internal fixture bridge consumed by private repository adapter, not exposed over HTTP. */
 repositoryAuthorityTestOnly():TestFixtureAuthority {return this.#fixture;}
}
