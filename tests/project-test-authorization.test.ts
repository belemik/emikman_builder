import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TestSessionAuthority} from '../server/projects/test-session-authority';
test('R3 only synthetic fixture issuer creates valid session contexts',()=>{
 const a=new TestSessionAuthority(['fixture-account-A','fixture-account-B']);
 assert.equal(a.resolve('forged','create-project').kind,'unauthenticated');assert.throws(()=>a.issue('real-account'));
 const token=a.issue('fixture-account-A'),result=a.resolve(token,'create-project');assert.equal(result.kind,'authorized');
 if(result.kind!=='authorized')throw Error();assert.equal(result.context.principal.accountId,'fixture-account-A');
 const backend=a.repositoryAuthorityTestOnly();assert.equal(backend.authorize(result.context),'fixture-account-A');
 assert.equal(backend.authorize({...result.context}),null);assert.equal(backend.authorize({principal:{accountId:'fixture-account-B'},requestId:'fake'} as never),null);
});
test('R3 shared account three sessions and per-session revocation/permission checks',()=>{
 const a=new TestSessionAuthority(['fixture-account-A']),tokens=Array.from({length:3},()=>a.issue('fixture-account-A'));
 a.revoke(tokens[0]);assert.equal(a.resolve(tokens[0],'read-project').kind,'unauthenticated');
 for(const t of tokens.slice(1))assert.equal(a.resolve(t,'read-project').kind,'authorized');
 a.denyOperation(tokens[1],'create-project');assert.equal(a.resolve(tokens[1],'create-project').kind,'forbidden');
 assert.equal(a.resolve(tokens[2],'create-project').kind,'authorized');a.disableAccount('fixture-account-A');
 for(const t of tokens)assert.equal(a.resolve(t,'read-project').kind,'unauthenticated');
});
test('R3 bounded fixture sessions and fresh factory does not trust old token',()=>{
 const a=new TestSessionAuthority(['fixture-account-A']);for(let n=0;n<64;n++)a.issue('fixture-account-A');assert.throws(()=>a.issue('fixture-account-A'));
 assert.equal(new TestSessionAuthority(['fixture-account-A']).resolve('old-token','read-project').kind,'unauthenticated');
});
