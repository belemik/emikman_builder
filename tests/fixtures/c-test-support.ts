import {startCTestHttp} from '../../server/projects/c-test-http';
import {PROJECT_INGEST_TEST_PROFILE} from '../../server/projects/ingest-profile';
export {createRequest,header} from './p03-support';export {startCTestHttp};
export const A='a'.repeat(32),B='b'.repeat(32);
export type Http=Awaited<ReturnType<typeof startCTestHttp>>;
export function headers(h:Http,token:string){return {Authorization:'Bearer '+token,Origin:h.url,'Content-Type':'application/json','x-test-decoder-profile':PROJECT_INGEST_TEST_PROFILE.id};}
export async function post(h:Http,token:string,op:string,body:object,mode='commands'){const response=await fetch(h.url+'/c-test/v1/'+mode+'/'+op,{method:'POST',headers:headers(h,token),body:JSON.stringify(body)});return {status:response.status,data:await response.json()};}
export async function get(h:Http,token:string,path='/c-test/v1/projects?version=1'){const response=await fetch(h.url+path,{headers:{Authorization:'Bearer '+token}});return {status:response.status,data:await response.json()};}
export function counts(h:Http){return ['projects','revisions','receipts','operation_status','audit'].map(t=>Number(h.repository.database.prepare('SELECT count(*) n FROM '+t).get()?.n));}
export const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
