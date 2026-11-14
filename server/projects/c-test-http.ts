import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {C_TEST_PROFILE as P,CFailure,cFail,cRecord,isCOperation,isCWrite,type CJob} from './c-test-policy';
import {CTestSessions} from './c-test-sessions';import {readCQuery,CTestPages,type CQuery} from './c-test-query';import {runCTestWorker} from './c-test-worker-client';
import {createBTestVolume,adoptBTestVolume} from './b-test-volume';import {BTestLedger} from './b-test-ledger';import {BTestRepository} from './b-test-repository';
import {createTestPrincipalBoundary} from './verified-principal';import {inspectTestFoundationPolicy,FOUNDATION_TEST_PROFILE} from './server-foundation-policy';import {PROJECT_INGEST_TEST_PROFILE} from './ingest-profile';
export interface CTestOptions {readonly main?:string;readonly ledger?:string;readonly sessions?:CTestSessions;readonly beforeDispatch?:()=>Promise<void>;readonly beforeDelivery?:()=>Promise<void>;readonly fault?:()=>CJob['fault'];readonly dropCommittedOnce?:boolean;}
/** No real auth, API routes or DATA_DIR: explicit disposable TEST bootstrap and loopback only. */
export async function startCTestHttp(options:CTestOptions={}) {
 const main=options.main?adoptBTestVolume(options.main):createBTestVolume('main'),volume=options.ledger?adoptBTestVolume(options.ledger):createBTestVolume('ledger'),ledger=new BTestLedger(volume),sessions=options.sessions??new CTestSessions();
 let repository:BTestRepository;const policy=inspectTestFoundationPolicy(FOUNDATION_TEST_PROFILE);if(policy.kind!=='test-policy-ready')throw Error('C_POLICY');
 const auth=createTestPrincipalBoundary(policy.policy,{now:Date.now,resolveSession:k=>sessions.resolve(k),resolveResource:(k,id)=>repository?.ownership(k,id)??null});if(auth.kind!=='test-boundary-ready')throw Error('C_AUTH');const boundary=auth.boundary;repository=new BTestRepository(main,ledger,boundary,Date.now);
 const pages=new CTestPages();let active=0,peakActive=0,peakQueued=0,closed=false,dropped=false,origin='';const controllers=new Set<AbortController>(),tasks=new Set<Promise<void>>();
 type Waiter={grant:()=>void};const queue:Waiter[]=[];
 const release=()=>{active--;queue.shift()?.grant();};
 function acquire(signal:AbortSignal):Promise<()=>void>{
  if(signal.aborted||closed)return Promise.reject(new CFailure(503,'C_CANCELLED'));
  if(active<P.active){active++;peakActive=Math.max(peakActive,active);return Promise.resolve(release);}
  if(queue.length>=P.queued)return Promise.reject(new CFailure(503,'C_CAPACITY'));
  return new Promise((resolve,reject)=>{const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);};const cancel=()=>{cleanup();const i=queue.indexOf(waiter);if(i>=0)queue.splice(i,1);reject(new CFailure(503,'C_QUEUE'));};const waiter={grant:()=>{cleanup();active++;peakActive=Math.max(peakActive,active);resolve(release);}};const timer=setTimeout(cancel,P.queueMs);signal.addEventListener('abort',cancel,{once:true});queue.push(waiter);peakQueued=Math.max(peakQueued,queue.length);});
 }
 async function wait(hook:(()=>Promise<void>)|undefined,signal:AbortSignal){if(signal.aborted)cFail(504,'C_TIMEOUT');if(!hook)return;let abort=()=>{};try{await Promise.race([hook(),new Promise<never>((_,reject)=>{abort=()=>reject(new CFailure(504,'C_TIMEOUT'));signal.addEventListener('abort',abort,{once:true});})]);}finally{signal.removeEventListener('abort',abort);}if(signal.aborted)cFail(504,'C_TIMEOUT');}
 const send=(res:ServerResponse,status:number,body:string)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Connection':'close'});res.end(body);};
 const error=(res:ServerResponse,status:number,code:string)=>send(res,status,JSON.stringify({scope:'C_TEST_ONLY',error:code,outcome:'UNKNOWN_OUTCOME'}));
 async function handle(req:IncomingMessage,res:ServerResponse){
  const controller=new AbortController(),signal=controller.signal;controllers.add(controller);const timer=setTimeout(()=>controller.abort(),P.totalMs);req.pause();req.once('aborted',()=>controller.abort());res.once('close',()=>{if(!res.writableFinished)controller.abort();});let leave:(()=>void)|undefined;
  try{
   const seen=new Set<string>();for(let i=0;i<req.rawHeaders.length;i+=2){const name=req.rawHeaders[i].toLowerCase();if(seen.has(name))cFail(400,'C_HEADER');seen.add(name);}
   if(req.headers.host!==origin.slice(7)||req.headers.forwarded||Object.keys(req.headers).some(k=>k.startsWith('x-forwarded-'))||req.headers.origin&&req.headers.origin!==origin)cFail(403,'C_ORIGIN');
   const target=req.url??'';let query:CQuery|null=null,mode:CJob['mode']='command',operation:CJob['operation'];
   if(req.method==='GET'){query=readCQuery(target);operation=query.operation;mode='read';if(req.headers['transfer-encoding']||req.headers['content-length']&&req.headers['content-length']!=='0')cFail(400,'C_GET_BODY');}
   else if(req.method==='POST'){
    const match=/^\/c-test\/v1\/(commands|status)\/([a-z-]+)$/.exec(target);if(!match||!isCOperation(match[2]))cFail(400,'C_TARGET');operation=match[2];mode=match[1]==='status'?'reconcile':'command';if(mode==='reconcile'&&!isCWrite(operation))cFail(400,'C_OPERATION');if(['read-project','list-projects','list-revisions'].includes(operation))cFail(405,'C_USE_GET');
    if(req.headers.origin!==origin)cFail(403,'C_ORIGIN');if(req.headers['x-test-decoder-profile']!==PROJECT_INGEST_TEST_PROFILE.id)cFail(422,'C_PROFILE');if(!['application/json','application/json; charset=utf-8'].includes(String(req.headers['content-type']))||req.headers['content-encoding']&&req.headers['content-encoding']!=='identity')cFail(415,'C_MEDIA');
    const length=req.headers['content-length'];if(length!==undefined&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>P.bodyBytes))cFail(413,'C_BODY');if(req.headers['transfer-encoding']&&req.headers['transfer-encoding']!=='chunked')cFail(400,'C_FRAMING');
   }else cFail(405,'C_METHOD');
   const bearer=req.headers.authorization;if(typeof bearer!=='string'||!/^Bearer ct_[0-9a-f]{32}$/.test(bearer))cFail(401,'C_SESSION');const token=bearer.slice(7),lease=sessions.get(token);if(!lease)cFail(401,'C_SESSION');const captured=boundary.capture(lease.key);if(captured.kind!=='test-principal-captured')cFail(401,'C_SESSION');
   leave=await acquire(signal);if(!sessions.current(token,lease))cFail(401,'C_SESSION');
   let bytes=new Uint8Array(0);
   if(mode!=='read'){const chunks:Buffer[]=[];let size=0;const ingress=setTimeout(()=>{controller.abort();req.destroy();},P.ingressMs);try{for await(const part of req){const chunk=Buffer.from(part);size+=chunk.byteLength;if(size>P.bodyBytes)cFail(413,'C_BODY');chunks.push(chunk);}bytes=Buffer.concat(chunks,size);}finally{clearTimeout(ingress);}}
   await wait(options.beforeDispatch,signal);if(!sessions.current(token,lease))cFail(401,'C_SESSION');if(signal.aborted)cFail(504,'C_TIMEOUT');
   const reply=await runCTestWorker({main:main.directory,ledger:volume.directory,account:lease.account,expires:lease.expires,state:lease.state,operation,mode,bytes,project:query?.project??null,target:query?.target??'',fault:options.fault?.()??'none'},signal);
   const result:unknown=JSON.parse(reply.body);if(!cRecord(result)||typeof result.kind!=='string')cFail(503,'C_INTERNAL');
   if(result.kind==='denied')cFail(403,'C_ACCESS');
   // A grant and current session key remain local; a B result itself is not delivery authority.
   const delivery=boundary.authorize(captured.principal,operation,reply.refs,'dispatch');if(delivery.kind!=='test-authorized')cFail(401,'C_SESSION');
   await wait(options.beforeDelivery,signal);
   // Recheck before even computing cursor/output diagnostics after an await.
   if(!sessions.current(token,lease)||!boundary.canDeliver(delivery.delivery,sessions.get(token)?.key))cFail(401,'C_SESSION');
   const body=query?pages.page(delivery.accountId,query,reply.body,JSON.stringify(ledger.meta())):reply.body;
   const output='{"scope":"C_TEST_ONLY","result":'+body+'}';if(Buffer.byteLength(output)>P.outputBytes)cFail(503,'C_OUTPUT');
   if(!sessions.current(token,lease)||!boundary.canDeliver(delivery.delivery,sessions.get(token)?.key))cFail(401,'C_SESSION');if(signal.aborted)cFail(504,'C_TIMEOUT');
   if(result.kind==='committed'&&options.dropCommittedOnce&&!dropped){dropped=true;res.destroy();return;}
   const status=result.kind==='conflict'?409:result.kind==='invalid'?422:result.kind==='unavailable'?503:result.kind==='unknown-outcome'?503:200;
   // No awaits between the final delivery check and res.end.
   send(res,status,output);
  }catch(e){error(res,e instanceof CFailure?e.status:503,e instanceof CFailure?e.code:'C_INTERNAL');}
  finally{clearTimeout(timer);controller.abort();controllers.delete(controller);leave?.();if(!req.complete)req.destroy();}
 }
 const server=createServer({maxHeaderSize:P.headerBytes,connectionsCheckingInterval:100},(req,res)=>{const task=handle(req,res);tasks.add(task);void task.finally(()=>tasks.delete(task));});server.maxConnections=P.connections;server.headersTimeout=1000;server.requestTimeout=P.totalMs;server.maxRequestsPerSocket=1;
 server.on('clientError',(_e,socket)=>{socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');});
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const addr=server.address();if(!addr||typeof addr==='string')throw Error('C_LOOPBACK');origin='http://127.0.0.1:'+addr.port;
 return {url:origin,sessions,repository,ledger,main,volume,stats:()=>({active,queued:queue.length,peakActive,peakQueued}),async close(){closed=true;for(const c of controllers)c.abort();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await Promise.allSettled([...tasks]);repository.close();ledger.close();}};
}
