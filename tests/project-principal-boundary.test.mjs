import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createSessionContext } from '../server/session-context.mjs';
import { installPrincipalBoundary, principalBoundaryFor } from '../server/projects/principal-boundary.mjs';

function fixture() {
  const server=createServer(),request={},identity={},account='a'.repeat(32);
  let live={identity,accountId:account,expiresAt:Date.now()+60000},hook=async()=>{};
  const context=createSessionContext(async()=>{await hook();return live;});
  context.bind(request,{key:'private-server-hash',...live});
  const resources=new Map([['own',{accountId:account,projectId:null}],['other',{accountId:'b'.repeat(32),projectId:null}],
    ['revision',{accountId:account,projectId:'own'}],['receipt',{accountId:account,projectId:'own'}]]);
  const boundary=installPrincipalBoundary(server,context,async ref=>resources.get(ref.id)??null);
  return {server,request,context,boundary,resources,setLive:v=>{live=v;},live:()=>live,setHook:f=>{hook=f;}};
}
const own=()=>[{kind:'project',id:'own',projectId:null}];
const principal=async f=>{const p=await f.boundary.principalFor(f.request);assert.ok(p);return p;};
test('G1a server registry has consumer only; install once; other server has no authority',()=>{
 const f=fixture();assert.equal(principalBoundaryFor(f.server),f.boundary);assert.equal(principalBoundaryFor(createServer()),null);
 assert.deepEqual(Object.keys(f.boundary).sort(),['authorize','canDeliver','isCurrent','principalFor']);
 assert.throws(()=>installPrincipalBoundary(f.server,f.context),/G1A_INSTALL_DENIED/);
});
for(const value of [{},Object.freeze({kind:'principal',accountId:'a'.repeat(32)}),null,'token'])
 test('G1a forged principal denied '+JSON.stringify(value),async()=>{const f=fixture();assert.equal((await f.boundary.authorize(value,'read-project',own())).kind,'denied');});
test('G1a independent instance cannot recognize another issuer principal',async()=>{
 const f=fixture(),other=fixture(),p=await principal(f);assert.equal((await other.boundary.authorize(p,'read-project',own())).kind,'denied');
});
test('G1a principal and lease expose no account/session fields or wire authority',async()=>{
 const f=fixture(),p=await principal(f),grant=await f.boundary.authorize(p,'read-project',own());
 assert.equal(JSON.stringify(p),'{}');assert.equal(Object.getPrototypeOf(p),null);assert.ok(Object.isFrozen(p));
 assert.equal(grant.kind,'guard-authorized');assert.equal(JSON.stringify(grant.delivery),'{}');
 assert.equal(grant.persistencePermission,'NOT_GRANTED');assert.equal(grant.executionPermission,'NOT_GRANTED');
 assert.equal(await f.boundary.canDeliver(grant.delivery,f.request),true);assert.equal(await f.boundary.canDeliver({},f.request),false);
});
for(const name of ['other','missing'])test('G1a resource '+name+' returns identical safe denial',async()=>{
 const f=fixture(),p=await principal(f);const a=await f.boundary.authorize(p,'read-project',[{kind:'project',id:name,projectId:null}]);
 assert.deepEqual(a,{kind:'denied',persistencePermission:'NOT_GRANTED',executionPermission:'NOT_GRANTED',trustedAdmission:'NOT_IMPLEMENTED',productionReadiness:'NOT_APPROVED'});
});
for(const change of ['revoke','identity','account','expiry','expiry-extension'])test('G1a '+change+' after await invalidates principal and delivery',async()=>{
 const f=fixture(),p=await principal(f),grant=await f.boundary.authorize(p,'read-project',own());assert.equal(grant.kind,'guard-authorized');
 f.setHook(async()=>{const old=f.live();f.setLive(change==='revoke'?null:change==='identity'?{...old,identity:{}}:change==='account'?{...old,accountId:'b'.repeat(32)}:change==='expiry'?{...old,expiresAt:0}:{...old,expiresAt:old.expiresAt+1});});
 assert.equal(await f.boundary.isCurrent(p,f.request),false);assert.equal(await f.boundary.canDeliver(grant.delivery,f.request),false);
 assert.equal((await f.boundary.authorize(p,'read-project',own())).kind,'denied');
});
test('G1a request identity bound even with same account and session values',async()=>{
 const f=fixture(),p=await principal(f),g=await f.boundary.authorize(p,'read-project',own());assert.equal(await f.boundary.canDeliver(g.delivery,{}),false);
});
test('G1a copied refs survive caller mutation during async authorization',async()=>{
 const f=fixture(),p=await principal(f),refs=own();let once=true;f.setHook(async()=>{if(once){once=false;refs[0].id='other';}});
 const g=await f.boundary.authorize(p,'read-project',refs);assert.equal(g.kind,'guard-authorized');assert.equal(await f.boundary.canDeliver(g.delivery,f.request),true);
 f.resources.set('own',{accountId:'b'.repeat(32),projectId:null});assert.equal(await f.boundary.canDeliver(g.delivery,f.request),false);
});
test('G1a revoked while resource lookup awaits denies after lookup',async()=>{
 const request={},session={},expiresAt=Date.now()+60000;let live={identity:session,accountId:'a'.repeat(32),expiresAt};
 const ctx=createSessionContext(async()=>live);ctx.bind(request,{key:'hash',...live});
 const b=installPrincipalBoundary(createServer(),ctx,async()=>{await Promise.resolve();live=null;return {accountId:'a'.repeat(32),projectId:null};});
 const p=await b.principalFor(request);assert.equal((await b.authorize(p,'read-project',own())).kind,'denied');
});
test('G1a Proxy/getters/unknown claims denied without invoking hostile code',async()=>{
 const f=fixture(),p=await principal(f);let calls=0;const getter={get kind(){calls++;throw Error('secret');},id:'own',projectId:null};
 const proxy=new Proxy({}, {get(){calls++;throw Error('secret');},ownKeys(){calls++;throw Error('secret');}});
 for(const refs of [[getter],[proxy],[{...own()[0],ownerId:'a'.repeat(32)}],proxy])assert.equal((await f.boundary.authorize(p,'read-project',refs)).kind,'denied');
 assert.equal(calls,0);
});
test('G1a unsupported operation/phase and inconsistent child refs fail closed',async()=>{
 const f=fixture(),p=await principal(f);
 for(const args of [['apply',own()],['read-project',own(),'replay'],['restore-project',[...own(),{kind:'revision',id:'revision',projectId:'other'}]],['update-metadata',[]],['read-project',own(),'unknown']])assert.equal((await f.boundary.authorize(p,...args)).kind,'denied');
});
test('G1a replay rechecks ownership and exact resource-reference relation, not receipt semantics',async()=>{
 const f=fixture(),p=await principal(f),refs=[...own(),{kind:'receipt',id:'receipt',projectId:'own'}];
 const g=await f.boundary.authorize(p,'update-metadata',refs,'replay');assert.equal(g.kind,'guard-authorized');
 f.resources.delete('receipt');assert.equal(await f.boundary.canDeliver(g.delivery,f.request),false);
});
test('G1a missing repository resolver never authorizes owned/foreign resource claims',async()=>{
 const request={},live={identity:{},accountId:'a'.repeat(32),expiresAt:Date.now()+60000};const ctx=createSessionContext(async()=>live);ctx.bind(request,{key:'hash',...live});
 const b=installPrincipalBoundary(createServer(),ctx),p=await b.principalFor(request);assert.ok(p);assert.equal((await b.authorize(p,'read-project',own())).kind,'denied');
});
test('G1a resolver errors return no raw private diagnostic',async()=>{
 const f=fixture(),p=await principal(f);f.setHook(async()=>{throw Error('private-cookie-password');});assert.equal(await f.boundary.principalFor(f.request),null);assert.equal(await f.boundary.isCurrent(p,f.request),false);
});
