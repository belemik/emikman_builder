import { Server } from 'node:http';
import { types } from 'node:util';

/** @typedef {ReturnType<import('../session-context.mjs').createSessionContext>} Context */
/** @typedef {{kind:'project'|'revision'|'receipt',id:string,projectId:string|null}} Reference */
/** @typedef {{kind:'denied',persistencePermission:string,executionPermission:string,trustedAdmission:string,productionReadiness:string}|{kind:'guard-authorized',delivery:object,persistencePermission:string,executionPermission:string,trustedAdmission:string,productionReadiness:string}} Authorization */
/** @typedef {{principalFor:(request:object)=>Promise<object|null>,isCurrent:(principal:object,request:object)=>Promise<boolean>,authorize:(principal:object,operation:unknown,references:unknown,phase?:unknown)=>Promise<Authorization>,canDeliver:(delivery:object,request:object)=>Promise<boolean>}} Boundary */
/** @type {WeakMap<Server,Boundary>} */ const installed = new WeakMap();
const operations = new Set(['create-project','read-project','list-projects','update-metadata',
  'list-revisions','read-revision','create-revision','restore-project','soft-delete-project']);
const restrictions = Object.freeze({persistencePermission:'NOT_GRANTED',executionPermission:'NOT_GRANTED',
  trustedAdmission:'NOT_IMPLEMENTED',productionReadiness:'NOT_APPROVED'});
const denied = () => Object.freeze({kind:'denied',...restrictions});
/** No getters/Proxy/claims. Caller-owned reference data is copied BEFORE any await.
 * @param {unknown} value @returns {readonly Reference[]|null} */
function refs(value) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype || value.length > 3 ||
      Reflect.ownKeys(value).length !== value.length+1) return null;
  /** @type {Reference[]} */ const result=[];
  for(let i=0;i<value.length;i++) {
    const element=Object.getOwnPropertyDescriptor(value,String(i));
    if(!element || !('value' in element))return null;
    const v=element.value;
    if(!v || typeof v!=='object' || types.isProxy(v) ||
      ![Object.prototype,null].includes(Object.getPrototypeOf(v)))return null;
    const d=Object.getOwnPropertyDescriptors(v);
    if(Reflect.ownKeys(d).length!==3 || !['kind','id','projectId'].every(k=>d[k] && 'value' in d[k]))return null;
    const kind=d.kind.value,id=d.id.value,projectId=d.projectId.value;
    if(!['project','revision','receipt'].includes(kind) || typeof id!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id) ||
      projectId!==null && (typeof projectId!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(projectId)))return null;
    result.push(Object.freeze({kind,id,projectId}));
  }
  return Object.freeze(result);
}
/** Install once during trusted createApp bootstrap, before exposing/listening server.
 * Public consumer has no bind/resolver/issuer factory. Same-realm malicious bootstrap
 * controlling the server process is outside this boundary; no synthetic module imported.
 * @param {Server} server @param {Context} context
 * @param {(ref:Reference)=>Promise<{accountId:string,projectId:string|null}|null>} [resource]
 * Default absence of repository denies ALL resource references (no Project adapter).
 */
export function installPrincipalBoundary(server, context, resource=async()=>null) {
  if(!(server instanceof Server) || installed.has(server))throw Error('G1A_INSTALL_DENIED');
  /** @type {WeakMap<object,{lease:object,request:object,accountId:string}>} */ const principals=new WeakMap();
  /** @type {WeakMap<object,{principal:object,refs:readonly Reference[]}>} */ const deliveries=new WeakMap();
  /** @param {object} principal @param {object} request */
  async function current(principal,request) {
    const p=principals.get(principal);
    return !!p && p.request===request && await context.current(p.lease,request)===p.accountId;
  }
  /** @param {object} principal @param {readonly Reference[]} references */
  async function allowed(principal,references) {
    const p=principals.get(principal);if(!p || !await current(principal,p.request))return false;
    try {
      for(const ref of references) {
        const owner=await resource(ref);
        if(!owner || owner.accountId!==p.accountId || owner.projectId!==ref.projectId)return false;
      }
      return await current(principal,p.request);
    } catch { return false; }
  }
  /** @type {Boundary} */ const boundary=Object.freeze({
    async principalFor(request) {
      const lease=context.lease(request);if(!lease)return null;
      const accountId=await context.current(lease,request);if(!accountId)return null;
      const principal=Object.freeze(Object.create(null));principals.set(principal,{lease,request,accountId});return principal;
    },
    isCurrent:current,
    async authorize(principal,operation,references,phase='dispatch') {
      const copy=refs(references);
      if(typeof operation!=='string' || !operations.has(operation) || !copy ||
          (phase!=='dispatch' && phase!=='replay'))return denied();
      const isWrite=['create-project','update-metadata','create-revision','restore-project','soft-delete-project'].includes(operation);
      if(phase==='replay'&&!isWrite)return denied();
      if(operation==='create-project') {
        if(phase==='dispatch'?copy.length!==0:copy.length!==1||copy[0].kind!=='receipt'||copy[0].projectId!==null)return denied();
      } else if(operation==='list-projects') {if(copy.length)return denied();}
      else {
        const revision=operation==='read-revision'||operation==='restore-project';
        if(copy.length!==1+Number(revision)+Number(phase==='replay') || copy[0]?.kind!=='project' || copy[0].projectId!==null)return denied();
        if(revision && (copy[1].kind!=='revision'||copy[1].projectId!==copy[0].id))return denied();
        if(phase==='replay' && (copy.at(-1)?.kind!=='receipt'||copy.at(-1)?.projectId!==copy[0].id))return denied();
      }
      if(!await allowed(principal,copy))return denied();
      const delivery=Object.freeze(Object.create(null));deliveries.set(delivery,{principal,refs:copy});
      return Object.freeze({kind:'guard-authorized',delivery,...restrictions});
    },
    async canDeliver(delivery,request) {
      const d=deliveries.get(delivery);
      return !!d && await current(d.principal,request) && await allowed(d.principal,d.refs) && await current(d.principal,request);
    },
  });
  installed.set(server,boundary);return boundary;
}
/** Server-only consumer. Possessing the server is not permission to mint a lease.
 * @param {Server} server */
export function principalBoundaryFor(server) { return installed.get(server) ?? null; }
