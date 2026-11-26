import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {C_TEST_PROFILE as P,CFailure,cFail,cRecord,isCOperation,isCWrite,type CJob,type CStorageDiagnostic} from './c-test-policy';
import {CTestSessions} from './c-test-sessions';import {readCQuery,CTestPages,type CQuery} from './c-test-query';import {runCTestWorker} from './c-test-worker-client';
import {createBTestVolume,adoptBTestVolume} from './b-test-volume';import {BTestLedger} from './b-test-ledger';import {BTestRepository} from './b-test-repository';
import {createTestPrincipalBoundary} from './verified-principal';import {inspectTestFoundationPolicy,FOUNDATION_TEST_PROFILE} from './server-foundation-policy';import {PROJECT_INGEST_TEST_PROFILE} from './ingest-profile';
import { LIST_WEB_PAGE_DOCUMENTS, READ_WEB_PAGE, SAVE_WEB_PAGE, WEB_PAGE_DOCUMENT_LIMIT } from '../../src/projects/web-page-repository.dto';
import {
 WEB_PAGE_HTTP_SCOPE, WEB_PAGE_WORKSPACE_HTTP_PATH, WEB_PAGE_WORKSPACE_HTTP_SCOPE, WEB_PAGE_WORKSPACE_OUTPUT_BYTES,
 isCWebOperation, isCWebWrite, webDecoder,
} from './c-test-web-page-policy';

export interface CWebAsset {
 readonly mediaType: string;
 readonly body: Buffer;
}

const diagnosticErrorCodes: ReadonlySet<string> = new Set([
 'C_ACCESS', 'C_BODY', 'C_CANCELLED', 'C_CAPACITY', 'C_COMMAND', 'C_INTERNAL', 'C_OUTPUT',
 'C_QUEUE', 'C_RECOVERY', 'C_SESSION', 'C_TIMEOUT', 'C_WORKER', 'D_NOT_READY',
]);

export interface CRequestDiagnostic {
 readonly operation: 'create-project' | 'update-metadata';
 readonly mode: 'command' | 'reconcile';
 readonly httpStatus: number | null;
 readonly errorCode: string | null;
 readonly durationMs: number;
 readonly queueMs: number;
 readonly transactionStage: CStorageDiagnostic['stage'] | 'not-dispatched' | 'worker-dispatched';
 readonly sqlite: CStorageDiagnostic['sqlite'];
 readonly cas: 'not-run' | 'committed' | 'conflict' | 'undetermined';
 readonly reconciliation: 'not-requested' | 'confirmed' | 'not-confirmed';
}
export interface CTestOptions {readonly main?:string;readonly ledger?:string;readonly sessions?:CTestSessions;readonly diagnostics?:{
  readonly onQueued?:()=>void;
  readonly record:(entry:CRequestDiagnostic)=>void;
 };readonly beforeDispatch?:()=>Promise<void>;readonly beforeDelivery?:()=>Promise<void>;readonly fault?:()=>CJob['fault'];readonly dropCommittedOnce?:boolean;readonly webPageProfile?:{readonly assets?:ReadonlyMap<string,CWebAsset>;readonly dropEditResponseOnce?:boolean;readonly port?:number;readonly workspace?:true;readonly browserAccess?:{readonly claim:(code:string)=>string|null;readonly resolve:(handle:string)=>string|null};};}
/** No real auth, API routes or DATA_DIR: explicit disposable TEST bootstrap and loopback only. */
export async function startCTestHttp(options:CTestOptions={}) {
 const web=options.webPageProfile;
 const port=web?.port??0;
 if(port!==0&&(!Number.isInteger(port)||port<1024||port>65535))throw Error('C_LOOPBACK_PORT');
 const workspace=web?.workspace===true;
 const browserAccess=workspace?web?.browserAccess:undefined;
 const profile=workspace?'workspace-v1':web?true:undefined;
 const scope=workspace?WEB_PAGE_WORKSPACE_HTTP_SCOPE:web?WEB_PAGE_HTTP_SCOPE:'C_TEST_ONLY';
 const main=options.main?adoptBTestVolume(options.main):createBTestVolume('main'),volume=options.ledger?adoptBTestVolume(options.ledger):createBTestVolume('ledger'),ledger=new BTestLedger(volume),sessions=options.sessions??new CTestSessions();
 let repository:BTestRepository;const policy=inspectTestFoundationPolicy(FOUNDATION_TEST_PROFILE);if(policy.kind!=='test-policy-ready')throw Error('C_POLICY');
 const auth=createTestPrincipalBoundary(policy.policy,{now:Date.now,resolveSession:k=>sessions.resolve(k),resolveResource:(k,id)=>repository?.ownership(k,id)??null});if(auth.kind!=='test-boundary-ready')throw Error('C_AUTH');const boundary=auth.boundary;repository=new BTestRepository(main,ledger,boundary,Date.now,undefined,{webPageProfile:profile});
 const pages=new CTestPages();let active=0,peakActive=0,peakQueued=0,closed=false,dropped=false,origin='';const controllers=new Set<AbortController>(),tasks=new Set<Promise<void>>();
 type Waiter={grant:()=>void};const queue:Waiter[]=[];
 const release=()=>{active--;queue.shift()?.grant();};
 function acquire(signal:AbortSignal,onQueued?:()=>void):Promise<()=>void>{
  if(signal.aborted||closed)return Promise.reject(new CFailure(503,'C_CANCELLED'));
  if(active<P.active){active++;peakActive=Math.max(peakActive,active);return Promise.resolve(release);}
  if(queue.length>=P.queued)return Promise.reject(new CFailure(503,'C_CAPACITY'));
  return new Promise((resolve,reject)=>{
   const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);};
   const cancel=()=>{cleanup();const i=queue.indexOf(waiter);if(i>=0)queue.splice(i,1);reject(new CFailure(503,'C_QUEUE'));};
   const waiter={grant:()=>{cleanup();active++;peakActive=Math.max(peakActive,active);resolve(release);}};
   const timer=setTimeout(cancel,P.queueMs);
   signal.addEventListener('abort',cancel,{once:true});queue.push(waiter);peakQueued=Math.max(peakQueued,queue.length);
   try{onQueued?.();}catch{/* Observer errors do not reject admission. */}
  });
 }
 async function wait(hook:(()=>Promise<void>)|undefined,signal:AbortSignal){if(signal.aborted)cFail(504,'C_TIMEOUT');if(!hook)return;let abort=()=>{};try{await Promise.race([hook(),new Promise<never>((_,reject)=>{abort=()=>reject(new CFailure(504,'C_TIMEOUT'));signal.addEventListener('abort',abort,{once:true});})]);}finally{signal.removeEventListener('abort',abort);}if(signal.aborted)cFail(504,'C_TIMEOUT');}
 const send=(res:ServerResponse,status:number,body:string)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Connection':'close'});res.end(body);};
 const error=(res:ServerResponse,status:number,code:string)=>send(res,status,JSON.stringify({scope,error:code,outcome:'UNKNOWN_OUTCOME'}));
 async function readBody(req:IncomingMessage,controller:AbortController,limit:number){
  const chunks:Buffer[]=[];let size=0;
  const ingress=setTimeout(()=>{controller.abort();req.destroy();},P.ingressMs);
  try{
   for await(const part of req){
    const chunk=Buffer.from(part);size+=chunk.byteLength;if(size>limit)cFail(413,'C_BODY');chunks.push(chunk);
   }
   return Buffer.concat(chunks,size);
  }finally{clearTimeout(ingress);}
 }
 async function handle(req:IncomingMessage,res:ServerResponse){
  const started=performance.now();
  let diagnosticOperation:CRequestDiagnostic['operation']|undefined;
  let diagnosticMode:CRequestDiagnostic['mode']='command';
  let queuedAt:number|undefined,queueMs=0,httpStatus:number|null=null,errorCode:string|null=null;
  let transactionStage:CRequestDiagnostic['transactionStage']='not-dispatched';
  let sqlite:CRequestDiagnostic['sqlite']=null,cas:CRequestDiagnostic['cas']='not-run';
  let reconciliation:CRequestDiagnostic['reconciliation']='not-requested';
  const controller=new AbortController(),signal=controller.signal;controllers.add(controller);const timer=setTimeout(()=>controller.abort(),P.totalMs);req.pause();req.once('aborted',()=>controller.abort());res.once('close',()=>{if(!res.writableFinished)controller.abort();});let leave:(()=>void)|undefined;
  try{
   const seen=new Set<string>();for(let i=0;i<req.rawHeaders.length;i+=2){const name=req.rawHeaders[i].toLowerCase();if(seen.has(name))cFail(400,'C_HEADER');seen.add(name);}
   if(req.headers.host!==origin.slice(7)||req.headers.forwarded||Object.keys(req.headers).some(k=>k.startsWith('x-forwarded-'))||req.headers.origin&&req.headers.origin!==origin)cFail(403,'C_ORIGIN');
   const target=req.url??'';let query:CQuery|null=null,mode:CJob['mode']='command',operation:CJob['operation'];
   if(browserAccess&&target===WEB_PAGE_WORKSPACE_HTTP_PATH+'/session/claim'){
    if(req.method!=='POST')cFail(405,'C_METHOD');
    if(req.headers.origin!==origin)cFail(403,'C_ORIGIN');
    if(req.headers['content-type']!=='text/plain'||req.headers['content-encoding']||req.headers['transfer-encoding'])cFail(415,'C_MEDIA');
    if(req.headers['content-length']!=='35')cFail(400,'C_CLAIM_LENGTH');
    leave=await acquire(signal);
    const code=(await readBody(req,controller,35)).toString('latin1');
    if(signal.aborted)cFail(504,'C_TIMEOUT');
    if(!/^zc_[0-9a-f]{32}$/.test(code))cFail(401,'C_SESSION');
    const handle=browserAccess.claim(code);
    if(!handle)cFail(401,'C_SESSION');
    send(res,200,JSON.stringify({scope,handle}));return;
   }
   const asset=web&&req.method==='GET'?web.assets?.get(target):undefined;
   if(asset){
    if(req.headers['transfer-encoding']||req.headers['content-length']&&req.headers['content-length']!=='0')cFail(400,'C_GET_BODY');
    res.writeHead(200,{'Content-Type':asset.mediaType,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
     'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; "
      +(browserAccess?"font-src 'self'; ":"")+"connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
     'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Cross-Origin-Resource-Policy':'same-origin','Connection':'close'});
    res.end(asset.body);return;
   }
   if(req.method==='GET'&&!web){query=readCQuery(target);operation=query.operation;mode='read';if(req.headers['transfer-encoding']||req.headers['content-length']&&req.headers['content-length']!=='0')cFail(400,'C_GET_BODY');}
   else if(req.method==='POST'){
    const match=web
     ? (workspace
       ? /^\/c-test\/web-page\/v2\/(commands|status)\/([a-z0-9-]+)$/.exec(target)
       : /^\/c-test\/web-page\/v1\/(commands|status)\/([a-z0-9-]+)$/.exec(target))
     : /^\/c-test\/v1\/(commands|status)\/([a-z-]+)$/.exec(target);
    if(!match)cFail(400,'C_TARGET');
    let decoder:string=PROJECT_INGEST_TEST_PROFILE.id;
    mode=match[1]==='status'?'reconcile':'command';
    if(web){
     if(!isCWebOperation(match[2],workspace))cFail(400,'C_TARGET');
     operation=match[2];if(mode==='reconcile'&&!isCWebWrite(operation))cFail(400,'C_OPERATION');
     decoder=webDecoder(operation)??decoder;
    }else{
     if(!isCOperation(match[2]))cFail(400,'C_TARGET');
     operation=match[2];if(mode==='reconcile'&&!isCWrite(operation))cFail(400,'C_OPERATION');
     if(['read-project','list-projects','list-revisions'].includes(operation))cFail(405,'C_USE_GET');
    }
    if(req.headers.origin!==origin)cFail(403,'C_ORIGIN');if(req.headers['x-test-decoder-profile']!==decoder)cFail(422,'C_PROFILE');if(!['application/json','application/json; charset=utf-8'].includes(String(req.headers['content-type']))||req.headers['content-encoding']&&req.headers['content-encoding']!=='identity')cFail(415,'C_MEDIA');
    const length=req.headers['content-length'];if(length!==undefined&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>P.bodyBytes))cFail(413,'C_BODY');if(req.headers['transfer-encoding']&&req.headers['transfer-encoding']!=='chunked')cFail(400,'C_FRAMING');
   }else cFail(405,'C_METHOD');
   if(options.diagnostics&&!web&&(operation==='create-project'||operation==='update-metadata')){
    diagnosticOperation=operation;
    diagnosticMode=mode==='reconcile'?'reconcile':'command';
    if(diagnosticMode==='reconcile')reconciliation='not-confirmed';
   }
   const bearer=req.headers.authorization;
   const pattern=browserAccess?/^Bearer zb_[0-9a-f]{32}$/:/^Bearer ct_[0-9a-f]{32}$/;
   if(typeof bearer!=='string'||!pattern.test(bearer))cFail(401,'C_SESSION');
   const token=browserAccess?browserAccess.resolve(bearer.slice(7)):bearer.slice(7);
   if(!token)cFail(401,'C_SESSION');
   const lease=sessions.get(token);if(!lease)cFail(401,'C_SESSION');
   const captured=boundary.capture(lease.key);if(captured.kind!=='test-principal-captured')cFail(401,'C_SESSION');
   try{
    leave=await acquire(signal,diagnosticOperation?()=>{
     queuedAt=performance.now();
     options.diagnostics?.onQueued?.();
    }:undefined);
   }finally{if(queuedAt!==undefined)queueMs=Math.round(performance.now()-queuedAt);}
   if(!sessions.current(token,lease))cFail(401,'C_SESSION');
   const bytes=mode==='read'?new Uint8Array(0):await readBody(req,controller,P.bodyBytes);
   await wait(options.beforeDispatch,signal);if(!sessions.current(token,lease))cFail(401,'C_SESSION');if(signal.aborted)cFail(504,'C_TIMEOUT');
   if(web&&(!repository.current()||ledger.meta().mode!=='ACTIVE'))cFail(503,'C_RECOVERY');
   transactionStage='worker-dispatched';
   if(diagnosticOperation==='update-metadata'&&mode==='command')cas='undetermined';
   const reply=await runCTestWorker({main:main.directory,ledger:volume.directory,account:lease.account,expires:lease.expires,state:lease.state,operation,mode,bytes,project:query?.project??null,target:query?.target??'',fault:options.fault?.()??'none',webPageProfile:profile,diagnostic:diagnosticOperation?true:undefined},signal);
   if(reply.diagnostic){transactionStage=reply.diagnostic.stage;sqlite=reply.diagnostic.sqlite;}
   const result:unknown=JSON.parse(reply.body);if(!cRecord(result)||typeof result.kind!=='string')cFail(503,'C_INTERNAL');
   if(diagnosticOperation==='update-metadata'&&mode==='command'){
    if(result.kind==='committed')cas='committed';
    if(result.kind==='conflict'&&result.reason==='EXPECTED_REVISION_MISMATCH')cas='conflict';
   }
   if(result.kind==='denied')cFail(403,'C_ACCESS');
   // A grant and current session key remain local; a B result itself is not delivery authority.
   const delivery=boundary.authorize(captured.principal,operation,reply.refs,'dispatch');if(delivery.kind!=='test-authorized')cFail(401,'C_SESSION');
   const receipt=web&&result.kind==='committed'&&cRecord(result.receipt)?result.receipt:null;
   const resourceDeliveries: (typeof delivery.delivery)[]=[];
   function bindRevision(revision: unknown, projectId: unknown) {
    if(typeof projectId!=='string'||!cRecord(revision)||revision.projectId!==projectId||typeof revision.id!=='string')cFail(503,'C_INTERNAL');
    const grant=boundary.authorize(capturedPrincipal,READ_WEB_PAGE,[
     {kind:'project',id:projectId,projectId:null},{kind:'revision',id:revision.id,projectId},
    ],'dispatch');
    if(grant.kind!=='test-authorized')cFail(401,'C_SESSION');
    resourceDeliveries.push(grant.delivery);
   }
   const capturedPrincipal=captured.principal;
   if(receipt)bindRevision(receipt.revision,receipt.projectId);
   if(operation===LIST_WEB_PAGE_DOCUMENTS&&result.kind==='web-page-list'){
    if(!Array.isArray(result.documents)||result.documents.length>WEB_PAGE_DOCUMENT_LIMIT||typeof result.truncated!=='boolean')cFail(503,'C_OUTPUT');
    for(const value of result.documents){
     if(!cRecord(value)||!cRecord(value.revision))cFail(503,'C_INTERNAL');
     bindRevision(value.revision,value.revision.projectId);
    }
   }
   const canDeliver=()=>sessions.current(token,lease)&&boundary.canDeliver(delivery.delivery,lease.key)
    &&resourceDeliveries.every(grant=>boundary.canDeliver(grant,lease.key));
   await wait(options.beforeDelivery,signal);
   // Recheck before even computing cursor/output diagnostics after an await.
   if(!canDeliver())cFail(401,'C_SESSION');
   if(web&&(!repository.current()||ledger.meta().mode!=='ACTIVE'))cFail(503,'C_RECOVERY');
   const body=query?pages.page(delivery.accountId,query,reply.body,JSON.stringify(ledger.meta())):reply.body;
   const output='{"scope":'+JSON.stringify(scope)+',"result":'+body+'}';if(Buffer.byteLength(output)>(operation===LIST_WEB_PAGE_DOCUMENTS?WEB_PAGE_WORKSPACE_OUTPUT_BYTES:P.outputBytes))cFail(503,'C_OUTPUT');
   if(!canDeliver())cFail(401,'C_SESSION');if(signal.aborted)cFail(504,'C_TIMEOUT');
   const edit=operation===SAVE_WEB_PAGE&&mode==='command'&&receipt?.replayed===false&&reply.webPageEdit===true;
   if(result.kind==='committed'&&(options.dropCommittedOnce||web?.dropEditResponseOnce&&edit)&&!dropped){dropped=true;errorCode='C_REPLY_DROPPED';res.destroy();return;}
   const status=result.kind==='conflict'?409:result.kind==='invalid'?422:result.kind==='unavailable'?503:result.kind==='unknown-outcome'?503:200;
   // No awaits between the final delivery check and res.end.
   if(!res.destroyed&&!res.writableEnded){
    httpStatus=status;
    if(mode==='reconcile'&&result.kind==='committed')reconciliation='confirmed';
   }
   if(result.kind==='conflict'){
    if(result.reason==='EXPECTED_REVISION_MISMATCH'||result.reason==='IDEMPOTENCY_KEY_REUSED')errorCode=result.reason;
   }else if(result.kind==='unknown-outcome')errorCode='B_UNKNOWN_OUTCOME';
   else if(result.kind==='unavailable')errorCode='B_UNAVAILABLE';
   send(res,status,output);
  }catch(e){
   const status=e instanceof CFailure?e.status:503;
   const code=e instanceof CFailure?e.code:'C_INTERNAL';
   errorCode=diagnosticErrorCodes.has(code)?code:'C_INTERNAL';
   if(!res.destroyed&&!res.writableEnded)httpStatus=status;
   error(res,status,code);
  }finally{
   clearTimeout(timer);controller.abort();controllers.delete(controller);leave?.();if(!req.complete)req.destroy();
   if(diagnosticOperation){
    try{
     options.diagnostics?.record({operation:diagnosticOperation,mode:diagnosticMode,httpStatus,errorCode,
      durationMs:Math.round(performance.now()-started),queueMs,transactionStage,sqlite,cas,reconciliation});
    }catch{/* Diagnostics are separate from transport and storage outcomes. */}
   }
  }
 }
 const server=createServer({maxHeaderSize:P.headerBytes,connectionsCheckingInterval:100},(req,res)=>{const task=handle(req,res);tasks.add(task);void task.finally(()=>tasks.delete(task));});server.maxConnections=P.connections;server.headersTimeout=1000;server.requestTimeout=P.totalMs;server.maxRequestsPerSocket=1;
 server.on('clientError',(_e,socket)=>{socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');});
 try {
  await new Promise<void>((resolve,reject)=>{
   server.once('error',reject);
   server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve();});
  });
 } catch (error) {
  repository.close();ledger.close();throw error;
 }
 const addr=server.address();
 if(!addr||typeof addr==='string')throw Error('C_LOOPBACK');
 origin='http://127.0.0.1:'+addr.port;
 return {url:origin,sessions,repository,ledger,main,volume,stats:()=>({active,queued:queue.length,peakActive,peakQueued}),async close(){closed=true;for(const c of controllers)c.abort();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await Promise.allSettled([...tasks]);repository.close();ledger.close();}};
}
