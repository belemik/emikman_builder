import {Worker} from 'node:worker_threads';
import {C_TEST_PROFILE as P,CFailure,cRecord,type CJob,type CReply} from './c-test-policy';
function reply(v:unknown):v is CReply {return cRecord(v)&&v.kind==='c-reply'&&typeof v.body==='string'&&Buffer.byteLength(v.body)<=P.internalBytes&&Array.isArray(v.refs)&&v.refs.length<=3&&v.refs.every(r=>cRecord(r)&&['project','revision','receipt'].includes(String(r.kind))&&typeof r.id==='string'&&r.id.length<=128&&(r.projectId===null||typeof r.projectId==='string'));}
export async function runCTestWorker(job:CJob,signal:AbortSignal):Promise<CReply> {
 if(signal.aborted)throw new CFailure(504,'C_TIMEOUT');
 const worker=new Worker(new URL('./c-test-worker-bootstrap.mjs',import.meta.url),{workerData:job,resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:16,stackSizeMb:4}});
 let timer:ReturnType<typeof setTimeout>|undefined,abort:()=>void=()=>{};
 try{return await new Promise<CReply>((resolve,reject)=>{
  abort=()=>reject(new CFailure(504,'C_TIMEOUT'));signal.addEventListener('abort',abort,{once:true});timer=setTimeout(abort,P.workerMs);
  worker.once('message',(m:unknown)=>{if(reply(m))resolve(m);else reject(new CFailure(400,'C_COMMAND'));});worker.once('error',()=>reject(new CFailure(503,'C_WORKER')));worker.once('exit',()=>reject(new CFailure(503,'C_WORKER')));
 });}finally{if(timer)clearTimeout(timer);signal.removeEventListener('abort',abort);await worker.terminate();}
}
