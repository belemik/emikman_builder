import { types } from 'node:util';
import type { RepositoryOperation } from '../../src/projects/repository.dto';
import { A_TEST_RESTRICTIONS,isTestFoundationPolicy } from './server-foundation-policy';

/** Trusted synchronous fixture bootstrap ports. NOT a real guard, network DTO or production issuer API.
 * A caller controlling bootstrap can create its own TEST instance, never another instance's handles
 * or a P02 ServerVerifiedPrincipal. Production handoff/IPC requires a separately reviewed issuer. */
export interface TestBoundaryPorts {
  readonly now:()=>number;
  readonly resolveSession:(key:object)=>Readonly<{identity:object;accountId:string;generation:number;expiresAt:number}>|null;
  readonly resolveResource:(kind:'project'|'revision'|'receipt',id:string)=>Readonly<{accountId:string;projectId:string|null}>|null;
}
export type TestPrincipalHandle=Readonly<{kind:'test-principal-handle'}>;
export type TestDeliveryHandle=Readonly<{kind:'test-delivery-handle'}>;
export type TestResourceReference=Readonly<{kind:'project'|'revision'|'receipt';id:string;projectId:string|null}>;
type Phase='dispatch'|'replay';
type Restrictions=typeof A_TEST_RESTRICTIONS;
type Denied=Readonly<Restrictions&{kind:'test-denied'}>;
export type TestAuthorization=Denied|Readonly<Restrictions&{kind:'test-authorized';accountId:string;delivery:TestDeliveryHandle}>;
export interface TestPrincipalBoundary {
  capture(sessionKey:unknown):Denied|Readonly<Restrictions&{kind:'test-principal-captured';principal:TestPrincipalHandle}>;
  authorize(principal:unknown,operation:unknown,resources:unknown,phase:unknown):TestAuthorization;
  canDeliver(delivery:unknown,currentSessionKey:unknown):boolean;
}
const operations:readonly RepositoryOperation[]=['create-project','read-project','list-projects','update-metadata',
  'list-revisions','read-revision','create-revision','restore-project','soft-delete-project'];
const opSet=new Set<string>(operations);
function isOperation(value:unknown):value is RepositoryOperation {return typeof value==='string'&&opSet.has(value);}
function object(value:unknown):value is object {return typeof value==='object'&&value!==null&&!types.isProxy(value);}
/** Limited same-realm defensive inspection, not a JSON decoder or sandbox for hostile intrinsics. */
function record(value:unknown,keys:readonly string[]):Record<string,unknown>|null {
  if(!object(value))return null;
  const proto=Object.getPrototypeOf(value);if(proto!==Object.prototype&&proto!==null)return null;
  const descriptors=Object.getOwnPropertyDescriptors(value),names=Reflect.ownKeys(descriptors);
  if(names.length!==keys.length||keys.some(k=>!Object.hasOwn(descriptors,k)))return null;
  const result:Record<string,unknown>=Object.create(null);
  for(const key of keys){const d=descriptors[key];if(!('value'in d))return null;result[key]=d.value;}
  return result;
}
const account=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{32}$/.test(v);
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
function references(value:unknown):readonly TestResourceReference[]|null {
  if(!object(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)return null;
  const length=Object.getOwnPropertyDescriptor(value,'length')?.value;
  if(!integer(length)||length>3||Reflect.ownKeys(value).length!==length+1)return null;
  const result:TestResourceReference[]=[];
  for(let i=0;i<length;i++) {
    const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!('value'in d))return null;
    const r=record(d.value,['kind','id','projectId']);if(!r||!id(r.id)||r.projectId!==null&&!id(r.projectId))return null;
    const kind=r.kind;if(kind!=='project'&&kind!=='revision'&&kind!=='receipt')return null;
    result.push(Object.freeze({kind,id:r.id,projectId:r.projectId}));
  }
  return Object.freeze(result);
}
function shape(op:RepositoryOperation,refs:readonly TestResourceReference[],phase:Phase):boolean {
  const write=['create-project','update-metadata','create-revision','restore-project','soft-delete-project'].includes(op);
  if(phase==='replay'&&!write)return false;
  if(op==='create-project')return phase==='dispatch'?refs.length===0:refs.length===1&&refs[0].kind==='receipt'&&refs[0].projectId===null;
  if(op==='list-projects')return refs.length===0;
  const project=refs[0];if(!project||project.kind!=='project'||project.projectId!==null)return false;
  const needsRevision=op==='read-revision'||op==='restore-project';
  const expected=1+(needsRevision?1:0)+(phase==='replay'?1:0);if(refs.length!==expected)return false;
  if(needsRevision&&(refs[1].kind!=='revision'||refs[1].projectId!==project.id))return false;
  return phase!=='replay'||refs[refs.length-1].kind==='receipt'&&refs[refs.length-1].projectId===project.id;
}
const deny=():Denied=>Object.freeze({...A_TEST_RESTRICTIONS,kind:'test-denied'});
/** No account/role/principal constructor is exposed. capture resolves an opaque server-fixture key.
 * Every authorization and delivery re-resolves live session/resource state, with no cached grant.
 * All successful results remain TEST ONLY and grant no P02 persistence/execution authority. */
export function createTestPrincipalBoundary(policy:unknown,ports:TestBoundaryPorts):
  | Readonly<Restrictions&{kind:'test-boundary-rejected'}>
  | Readonly<Restrictions&{kind:'test-boundary-ready';boundary:TestPrincipalBoundary}> {
  const p=record(ports,['now','resolveSession','resolveResource']);
  if(!isTestFoundationPolicy(policy)||!p||typeof p.now!=='function'||typeof p.resolveSession!=='function'||typeof p.resolveResource!=='function')
    return Object.freeze({...A_TEST_RESTRICTIONS,kind:'test-boundary-rejected'});
  // Capture bootstrap functions once; later replacement of caller's port properties has no effect.
  const now=p.now,resolveSession=p.resolveSession,resolveResource=p.resolveResource;
  type Session={key:object;identity:object;accountId:string;generation:number;expiresAt:number};
  type Delivery={session:Session;op:RepositoryOperation;refs:readonly TestResourceReference[];phase:Phase};
  const principals=new WeakMap<object,Session>(),deliveries=new WeakMap<object,Delivery>();
  function session(key:unknown):Session|null {
    if(!object(key))return null;
    try {
      const s=record(resolveSession(key),['identity','accountId','generation','expiresAt']),time=now();
      if(!s||!object(s.identity)||!account(s.accountId)||!integer(s.generation)||!integer(s.expiresAt)||!integer(time)||time>=s.expiresAt)return null;
      return Object.freeze({key,identity:s.identity,accountId:s.accountId,generation:s.generation,expiresAt:s.expiresAt});
    }catch{return null;}
  }
  function live(saved:Session):boolean {
    const current=session(saved.key);
    try{return current!==null&&current.identity===saved.identity&&current.accountId===saved.accountId&&current.generation===saved.generation&&now()<saved.expiresAt;}catch{return false;}
  }
  function check(saved:Session,op:RepositoryOperation,refs:readonly TestResourceReference[],phase:Phase):boolean {
    if(!live(saved)||!shape(op,refs,phase))return false;
    try {
      for(const ref of refs) {
        const owner=record(resolveResource(ref.kind,ref.id),['accountId','projectId']);
        if(!owner||owner.accountId!==saved.accountId||owner.projectId!==ref.projectId)return false;
      }
      return live(saved); // Also catch revocation/re-entry during a trusted resource lookup.
    }catch{return false;}
  }
  const boundary:TestPrincipalBoundary=Object.freeze({
    capture(key:unknown) {
      const s=session(key);if(!s)return deny();
      const principal:TestPrincipalHandle=Object.freeze({kind:'test-principal-handle'});principals.set(principal,s);
      return Object.freeze({...A_TEST_RESTRICTIONS,kind:'test-principal-captured',principal});
    },
    authorize(principal:unknown,operation:unknown,resources:unknown,phase:unknown):TestAuthorization {
      if(!object(principal)||!isOperation(operation)||(phase!=='dispatch'&&phase!=='replay'))return deny();
      const saved=principals.get(principal),refs=references(resources);
      if(!saved||!refs||!check(saved,operation,refs,phase))return deny();
      const delivery:TestDeliveryHandle=Object.freeze({kind:'test-delivery-handle'});
      deliveries.set(delivery,Object.freeze({session:saved,op:operation,refs,phase}));
      return Object.freeze({...A_TEST_RESTRICTIONS,kind:'test-authorized',accountId:saved.accountId,delivery});
    },
    canDeliver(delivery:unknown,currentKey:unknown):boolean {
      if(!object(delivery))return false;const saved=deliveries.get(delivery);
      return saved!==undefined&&currentKey===saved.session.key&&check(saved.session,saved.op,saved.refs,saved.phase);
    },
  });
  return Object.freeze({...A_TEST_RESTRICTIONS,kind:'test-boundary-ready',boundary});
}
