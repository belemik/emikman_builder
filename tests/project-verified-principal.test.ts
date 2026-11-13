import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FOUNDATION_TEST_PROFILE,inspectTestFoundationPolicy} from '../server/projects/server-foundation-policy';
import {createTestPrincipalBoundary,type TestBoundaryPorts,type TestResourceReference} from '../server/projects/verified-principal';
import type {RepositoryOperation} from '../src/projects/repository.dto';
const A='a'.repeat(32),B='b'.repeat(32);
function fixture() {
  let now=0;
  const sessions=new Map<object,{identity:object;accountId:string;generation:number;expiresAt:number}>();
  const owners=new Map<string,{accountId:string;projectId:string|null}>();
  const ports:TestBoundaryPorts={now:()=>now,resolveSession:k=>sessions.get(k)??null,resolveResource:(kind,id)=>owners.get(kind+':'+id)??null};
  const config=inspectTestFoundationPolicy(FOUNDATION_TEST_PROFILE);if(config.kind!=='test-policy-ready')throw Error();
  const result=createTestPrincipalBoundary(config.policy,ports);if(result.kind!=='test-boundary-ready')throw Error();
  const boundary=result.boundary;
  function login(accountId=A) {const key=Object.freeze({});sessions.set(key,{identity:Object.freeze({}),accountId,generation:1,expiresAt:100});return key;}
  function capture(key:object){const r=boundary.capture(key);assert.equal(r.kind,'test-principal-captured');if(r.kind!=='test-principal-captured')throw Error();return r.principal;}
  function resource(kind:'project'|'revision'|'receipt',id:string,owner=A,projectId:string|null=null):TestResourceReference {
    owners.set(kind+':'+id,{accountId:owner,projectId});return {kind,id,projectId};
  }
  return {boundary,ports,config:config.policy,sessions,owners,login,capture,resource,tick:(t:number)=>{now=t;}};
}
const ops:readonly RepositoryOperation[]=['create-project','read-project','list-projects','update-metadata','list-revisions','read-revision','create-revision','restore-project','soft-delete-project'];
function refs(f:ReturnType<typeof fixture>,op:RepositoryOperation,owner=A):TestResourceReference[] {
 if(op==='create-project'||op==='list-projects')return [];
 const p=f.resource('project','p',owner),list=[p];
 if(op==='read-revision'||op==='restore-project')list.push(f.resource('revision','r',owner,'p'));
 return list;
}
for(const op of ops)test('A dispatch '+op+' rechecks account/session on every call',()=>{
 const f=fixture(),key=f.login(),p=f.capture(key),resources=refs(f,op);
 assert.equal(f.boundary.authorize(p,op,resources,'dispatch').kind,'test-authorized');f.sessions.delete(key);
 assert.equal(f.boundary.authorize(p,op,resources,'dispatch').kind,'test-denied');
});
for(const op of ops.filter(o=>o!=='create-project'&&o!=='list-projects'))test('A foreign '+op+' project/child refs are denied without identifiers',()=>{
 const f=fixture(),p=f.capture(f.login());const r=f.boundary.authorize(p,op,refs(f,op,B),'dispatch');
 assert.equal(r.kind,'test-denied');assert.doesNotMatch(JSON.stringify(r),/accountId|projectId|receipt|"p"|"r"/);
});
for(const op of ['create-project','update-metadata','create-revision','restore-project','soft-delete-project'] as const)test('A replay '+op+' requires live session and owned receipt',()=>{
 const f=fixture(),key=f.login(),p=f.capture(key),resources=refs(f,op);resources.push(f.resource('receipt','receipt',A,op==='create-project'?null:'p'));
 assert.equal(f.boundary.authorize(p,op,resources,'replay').kind,'test-authorized');
 f.owners.set('receipt:receipt',{accountId:B,projectId:op==='create-project'?null:'p'});assert.equal(f.boundary.authorize(p,op,resources,'replay').kind,'test-denied');
 f.sessions.delete(key);assert.equal(f.boundary.authorize(p,op,resources,'replay').kind,'test-denied');
});
test('A three independent same-account sessions: logout/relogin does not revoke others',()=>{
 const f=fixture(),keys=[f.login(),f.login(),f.login()],principals=keys.map(k=>f.capture(k));
 f.sessions.delete(keys[0]);assert.equal(f.boundary.authorize(principals[0],'list-projects',[],'dispatch').kind,'test-denied');
 for(const p of principals.slice(1))assert.equal(f.boundary.authorize(p,'list-projects',[],'dispatch').kind,'test-authorized');
 const next=f.capture(f.login());assert.equal(f.boundary.authorize(next,'list-projects',[],'dispatch').kind,'test-authorized');
});
test('A expiry is inclusive and a renewed session cannot extend an old captured lifetime',()=>{
 const f=fixture(),key=f.login(),p=f.capture(key);f.tick(99);assert.equal(f.boundary.authorize(p,'list-projects',[],'dispatch').kind,'test-authorized');
 const s=f.sessions.get(key);assert.ok(s);s.expiresAt=200;f.tick(100);assert.equal(f.boundary.authorize(p,'list-projects',[],'dispatch').kind,'test-denied');
 assert.equal(f.boundary.authorize(f.capture(key),'list-projects',[],'dispatch').kind,'test-authorized');
});
test('A restart, generation/account/identity changes invalidate old principals',()=>{
 for(const change of ['restart','generation','account','identity']) {
 const f=fixture(),key=f.login(),p=f.capture(key),s=f.sessions.get(key);assert.ok(s);
 if(change==='restart')f.sessions.clear();if(change==='generation')s.generation++;if(change==='account')s.accountId=B;if(change==='identity')s.identity={};
 assert.equal(f.boundary.authorize(p,'list-projects',[],'dispatch').kind,'test-denied');
 }
});
test('A revocation after queue admission requires fresh dispatch check',async()=>{
 const f=fixture(),key=f.login(),p=f.capture(key);assert.equal(f.boundary.authorize(p,'list-projects',[],'dispatch').kind,'test-authorized');
 await Promise.resolve();f.sessions.delete(key);let calls=0;
 const checked=f.boundary.authorize(p,'list-projects',[],'dispatch');if(checked.kind==='test-authorized')calls++;
 assert.equal(calls,0);assert.equal(checked.kind,'test-denied');
});
test('A late delivery rejects account switch, other same-account session, logout and foreign resource change',()=>{
 const f=fixture(),key=f.login(),p=f.capture(key),resource=f.resource('project','p');
 const r=f.boundary.authorize(p,'read-project',[resource],'dispatch');assert.equal(r.kind,'test-authorized');if(r.kind!=='test-authorized')throw Error();
 assert.equal(f.boundary.canDeliver(r.delivery,key),true);assert.equal(f.boundary.canDeliver(r.delivery,f.login(B)),false);assert.equal(f.boundary.canDeliver(r.delivery,f.login()),false);
 f.owners.set('project:p',{accountId:B,projectId:null});assert.equal(f.boundary.canDeliver(r.delivery,key),false);f.sessions.delete(key);assert.equal(f.boundary.canDeliver(r.delivery,key),false);
});
test('A literal/JSON/cast/structuredClone/proxy cannot forge principal or IPC delivery',()=>{
 const f=fixture(),key=f.login(),p=f.capture(key),foreign=fixture();
 for(const fake of [{kind:'test-principal-handle'},JSON.parse(JSON.stringify(p)),structuredClone(p),new Proxy(p,{}),foreign.capture(foreign.login()),null,'owner-admin'])
  assert.equal(f.boundary.authorize(fake,'list-projects',[],'dispatch').kind,'test-denied');
 const r=f.boundary.authorize(p,'list-projects',[],'dispatch');if(r.kind!=='test-authorized')throw Error();
 assert.equal(f.boundary.canDeliver(structuredClone(r.delivery),key),false);assert.equal(f.boundary.capture({accountId:A,role:'admin'}).kind,'test-denied');
});
test('A forged owner/role, getters, proxy, missing/misbound child refs and unknown operation fail closed',()=>{
 const f=fixture(),p=f.capture(f.login()),project=f.resource('project','p'),revision=f.resource('revision','r',A,'other');let touched=0;
 const getter={kind:'project',id:'p',get projectId(){touched++;return null;}};
 for(const list of [[{...project,owner:A,role:'admin'}],[getter],new Proxy([project],{}),[project,revision],[],[project,project]])
  assert.equal(f.boundary.authorize(p,'read-revision',list,'dispatch').kind,'test-denied');
 assert.equal(touched,0);assert.equal(f.boundary.authorize(p,'APPLY',[],'dispatch').kind,'test-denied');assert.equal(f.boundary.authorize(p,'list-projects',[],'unknown').kind,'test-denied');
});
test('A missing/revoked resource and resolver errors deny; bootstrap functions are captured',()=>{
 const f=fixture(),key=f.login(),p=f.capture(key),r=f.resource('project','p');
 Reflect.set(f.ports,'resolveSession',()=>({identity:{},accountId:B,generation:1,expiresAt:100}));
 assert.equal(f.boundary.authorize(p,'read-project',[r],'dispatch').kind,'test-authorized');f.owners.delete('project:p');assert.equal(f.boundary.authorize(p,'read-project',[r],'dispatch').kind,'test-denied');
 const result=createTestPrincipalBoundary(f.config,{now:()=>0,resolveSession:()=>{throw Error('secret');},resolveResource:()=>null});if(result.kind!=='test-boundary-ready')throw Error();
 assert.equal(result.boundary.capture(key).kind,'test-denied');
});
test('A re-entrant resource lookup revocation is denied and reference snapshots are caller independent',()=>{
 let active=true;const key={},identity={},config=inspectTestFoundationPolicy(FOUNDATION_TEST_PROFILE);if(config.kind!=='test-policy-ready')throw Error();
 const made=createTestPrincipalBoundary(config.policy,{now:()=>0,resolveSession:k=>active&&k===key?{identity,accountId:A,generation:1,expiresAt:100}:null,resolveResource:()=>{active=false;return {accountId:A,projectId:null};}});if(made.kind!=='test-boundary-ready')throw Error();
 const c=made.boundary.capture(key);if(c.kind!=='test-principal-captured')throw Error();assert.equal(made.boundary.authorize(c.principal,'read-project',[{kind:'project',id:'p',projectId:null}],'dispatch').kind,'test-denied');
 const f=fixture(),k=f.login(),p=f.capture(k),r=f.resource('project','p');const a=f.boundary.authorize(p,'read-project',[r],'dispatch');if(a.kind!=='test-authorized')throw Error();Reflect.set(r,'id','foreign');assert.equal(f.boundary.canDeliver(a.delivery,k),true);
});
test('A successful handles/config/results are immutable TEST_ONLY, never P02 persistence/execution principals',()=>{
 const f=fixture(),key=f.login(),p=f.capture(key),r=f.boundary.authorize(p,'list-projects',[],'dispatch');
 assert.ok(Object.isFrozen(p)&&Object.isFrozen(f.config)&&Object.isFrozen(r));assert.equal(r.persistencePermission,'NOT_GRANTED');assert.equal(r.executionPermission,'NOT_GRANTED');assert.equal(r.productionPrincipal,'NOT_IMPLEMENTED');assert.equal(r.trustedAdmission,'NOT_IMPLEMENTED');
 assert.equal('accountId'in p,false);assert.equal('role'in p,false);
});
test('A unknown foundation profile/literal policy/unsafe setup refuses without input property traversal',()=>{
 let touched=0;for(const input of ['production',FOUNDATION_TEST_PROFILE+' ',null,{get profile(){touched++;return FOUNDATION_TEST_PROFILE;}},new Proxy({},{get(){throw Error();}})])assert.equal(inspectTestFoundationPolicy(input).kind,'test-policy-rejected');
 const f=fixture();assert.equal(createTestPrincipalBoundary({kind:'test-foundation-policy'},f.ports).kind,'test-boundary-rejected');assert.equal(createTestPrincipalBoundary(structuredClone(f.config),f.ports).kind,'test-boundary-rejected');assert.equal(touched,0);
});

for(const op of ['read-revision','restore-project'] as const)test('A foreign revision under owned project '+op+' is denied',()=>{
 const f=fixture(),p=f.capture(f.login()),project=f.resource('project','p'),revision=f.resource('revision','r',B,'p');
 assert.equal(f.boundary.authorize(p,op,[project,revision],'dispatch').kind,'test-denied');
});
