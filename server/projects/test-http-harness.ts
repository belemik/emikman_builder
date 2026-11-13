import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {Buffer} from 'node:buffer';
import {createTestCommandCandidate,createTestReadCandidate} from './test-command-candidate';
import {PROJECT_INGEST_TEST_PROFILE} from './ingest-profile';
import {TestSessionAuthority} from './test-session-authority';
import {TestCommandRepository,type TestRepositoryResult} from './test-command-repository';
import type {RepositoryOperation} from '../../src/projects/repository.dto';
export const TEST_HTTP_PROFILE=Object.freeze({id:'zarya.p04.r5.http.test/v0',targetBytes:2048,queryBytes:512,
 bodyBytes:262144,responseBytes:262144,maxActive:1,maxQueued:2,queueTimeoutMs:1000,ingressTimeoutMs:2000,
 maxConnections:16,maxHeaderBytes:8192});
const operations=new Set(['create-project','read-project','list-projects','update-metadata','list-revisions','read-revision','create-revision','restore-project','soft-delete-project']);
function isOperation(op:string):op is RepositoryOperation {return operations.has(op);}
class HttpFailure extends Error {constructor(readonly status:number,readonly code:string){super(code);}}
function fail(status:number,code:string):never {throw new HttpFailure(status,code);}
function token(req:IncomingMessage):string {
 const value=req.headers.authorization;return typeof value==='string'&&/^Bearer test-session-[0-9a-f-]{36}$/.test(value)?value.slice(7):'';
}
function readTarget(target:string):{operation:'list-projects'|'read-project'|'list-revisions';projectId:string|null} {
 const [path,query]=target.split('?');
 if(target.length>TEST_HTTP_PROFILE.targetBytes||!/^[\x21-\x7e]+$/.test(target)||target.includes('#')||target.includes('\\')||target.split('?').length>2||path.includes('%')||path.includes('..'))fail(400,'TEST_TARGET');
 if(query!==undefined&&query!=='') {
  if(query.length>TEST_HTTP_PROFILE.queryBytes)fail(400,'TEST_QUERY');const seen=new Set<string>();
  for(const item of query.split('&')) {
   const pair=item.split('=');if(pair.length!==2)fail(400,'TEST_QUERY');let key:string;
   try{key=decodeURIComponent(pair[0]);decodeURIComponent(pair[1]);}catch{fail(400,'TEST_QUERY_ENCODING');}
   if(seen.has(key)||!['cursor','limit'].includes(key))fail(400,'TEST_QUERY');seen.add(key);
  }
  fail(422,'TEST_PAGINATION_UNSUPPORTED');
 }
 if(path==='/test/v0/projects')return {operation:'list-projects',projectId:null};
 const match=/^\/test\/v0\/projects\/(prj_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(\/history)?$/.exec(path);
 if(!match)fail(400,'TEST_TARGET');
 return {operation:match[2]?'list-revisions':'read-project',projectId:match[1]};
}
/** Loopback/disposable harness ONLY. No imports from real server/auth/AccountGate. */
export async function startTestHttpHarness(repository:TestCommandRepository,sessions:TestSessionAuthority,
 options:{dropFirstCommittedResponse?:boolean;beforeDispatch?:()=>Promise<void>}={}) {
 let active=0,peakActive=0,peakQueued=0,rejected=0,dropped=0,cancelled=0,closed=false;
 type Waiter={grant:()=>void;cancel:()=>void};const queue:Waiter[]=[];
 const release=()=>{active--;const next=queue.shift();next?.grant();};
 function acquire(res:ServerResponse):Promise<(()=>void)|null> {
  if(closed)return Promise.resolve(null);
  if(active<TEST_HTTP_PROFILE.maxActive){active++;peakActive=Math.max(peakActive,active);return Promise.resolve(release);}
  if(queue.length>=TEST_HTTP_PROFILE.maxQueued){rejected++;return Promise.resolve(null);}
  return new Promise(resolve=>{
   const cleanup=()=>{clearTimeout(timer);res.off('close',waiter.cancel);};
   const waiter:Waiter={grant:()=>{cleanup();active++;peakActive=Math.max(peakActive,active);resolve(release);},
    cancel:()=>{cleanup();const i=queue.indexOf(waiter);if(i>=0)queue.splice(i,1);rejected++;resolve(null);}};
   const timer=setTimeout(waiter.cancel,TEST_HTTP_PROFILE.queueTimeoutMs);res.once('close',waiter.cancel);
   queue.push(waiter);peakQueued=Math.max(peakQueued,queue.length);
  });
 }
 let origin='';
 const server=createServer({maxHeaderSize:TEST_HTTP_PROFILE.maxHeaderBytes,connectionsCheckingInterval:100},(req,res)=>{
  res.once('close',()=>{if(!res.writableFinished)cancelled++;});
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(status:number,body:object)=>{
   if(res.destroyed||res.writableEnded)return;
   let data=JSON.stringify({scope:'P04_TEST_ONLY',...body});
   if(Buffer.byteLength(data)>TEST_HTTP_PROFILE.responseBytes){status=503;data='{"scope":"P04_TEST_ONLY","error":"TEST_RESPONSE_BUDGET"}';}
   res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Connection':'close'});
   res.end(data);res.once('finish',()=>{if(!req.complete)req.destroy();});
  };
  void(async()=>{
   let leave:(()=>void)|null=null;
   try {
    const target=req.url??'';let op:RepositoryOperation,read:ReturnType<typeof readTarget>|null=null;
    if(req.method==='GET') {
     read=readTarget(target);op=read.operation;
     if(req.headers['transfer-encoding']||req.headers['content-length']&&req.headers['content-length']!=='0')fail(400,'TEST_GET_BODY');
    } else if(req.method==='POST') {
     const match=/^\/test\/v0\/commands\/([a-z-]+)$/.exec(target);if(!match||!isOperation(match[1]))fail(400,'TEST_TARGET');op=match[1];
     if(req.headers.origin!==origin)fail(403,'TEST_ORIGIN');
     if(req.headers['x-test-decoder-profile']!==PROJECT_INGEST_TEST_PROFILE.id)fail(422,'TEST_PROFILE');
     if(!['application/json','application/json; charset=utf-8'].includes(String(req.headers['content-type']))||req.headers['content-encoding']&&req.headers['content-encoding']!=='identity')fail(415,'TEST_MEDIA');
    } else fail(405,'TEST_METHOD');
    const session=token(req),auth=sessions.resolve(session,op);
    if(auth.kind!=='authorized')fail(auth.kind==='forbidden'?403:401,'TEST_SESSION');
    leave=await acquire(res);if(!leave){send(503,{error:'TEST_CAPACITY'});return;}
    if(req.aborted||res.destroyed||closed)fail(503,'TEST_CANCELLED');
    let handle:object;
    if(read)handle=createTestReadCandidate(read.operation,read.projectId,target);
    else {
     const chunks:Buffer[]=[];let size=0;
     const timer=setTimeout(()=>req.destroy(),TEST_HTTP_PROFILE.ingressTimeoutMs);
     try {
      for await(const chunk of req){size+=chunk.length;if(size>TEST_HTTP_PROFILE.bodyBytes)fail(413,'TEST_BODY_SIZE');chunks.push(chunk);}
     }finally{clearTimeout(timer);}
     const inspected=createTestCommandCandidate(op,Buffer.concat(chunks,size));
     if(inspected.kind!=='candidate') {
      const code=inspected.report.diagnostics[0]?.code;
      const resource=['R1_SIZE','R1_DEPTH','R1_NODES','R1_PROPERTIES','R1_ARRAY_ITEMS','R1_KEY_SCALARS','R1_STRING_SCALARS','R1_RAW_STRING_BYTES','R1_NUMERIC_BYTES'].includes(code??'');
      fail(inspected.missingGuard?428:resource?413:['R1_UTF8','R1_SYNTAX'].includes(code??'')?400:422,'TEST_COMMAND_REJECTED');
     }
     handle=inspected.candidate;
    }
    await options.beforeDispatch?.();
    if(req.aborted||res.destroyed||closed)fail(503,'TEST_CANCELLED');
    const result=await repository.execute(session,handle); // recheck auth after queue/body, before receipt/write.
    if(result.kind==='committed'&&options.dropFirstCommittedResponse&&dropped===0){dropped++;res.destroy();return;}
    respond(result);
   }catch(error){send(error instanceof HttpFailure?error.status:503,{error:error instanceof HttpFailure?error.code:'TEST_UNAVAILABLE'});}
   finally{leave?.();}
  })();
  function respond(result:TestRepositoryResult):void {
   if(result.kind==='test-denied'){send(result.status,{error:result.code});return;}
   if(result.kind==='not-found'){send(404,{error:'TEST_NOT_FOUND'});return;}
   if(result.kind==='forbidden'){send(403,{error:'TEST_AUTHORIZATION'});return;}
   if(result.kind==='unavailable'){send(503,{error:'TEST_UNAVAILABLE'});return;}
   if(result.kind==='validation-error'){send(422,{error:'TEST_VALIDATION'});return;}
   if(result.kind==='conflict'){send(409,{error:result.reason});return;}
   send(200,{result,...(result.kind==='project-page'||result.kind==='revision-page'?{pagination:'BOUNDED_NO_PAGINATION_TEST_ONLY'}:{})});
  }
 });
 server.maxConnections=TEST_HTTP_PROFILE.maxConnections;server.headersTimeout=1000;server.requestTimeout=3000;
 server.on('clientError',(_error,socket)=>{socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');});
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
 const address=server.address();if(!address||typeof address==='string')throw Error('TEST_LOOPBACK_BIND');origin=`http://127.0.0.1:${address.port}`;
 return {url:origin,metrics:()=>Object.freeze({active,queued:queue.length,peakActive,peakQueued,rejected,dropped,cancelled}),
  close:async()=>{closed=true;for(const pending of [...queue])pending.cancel();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
