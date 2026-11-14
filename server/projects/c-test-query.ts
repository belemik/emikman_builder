import {createHmac,createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {C_TEST_PROFILE as P,cFail,cRecord} from './c-test-policy';
export interface CQuery {readonly operation:'list-projects'|'read-project'|'list-revisions';readonly project:string|null;readonly target:string;readonly limit:number;readonly cursor:string|null;}
export function readCQuery(raw:string):CQuery {
 if(raw.length>P.targetBytes||!/^[\x21-\x7e]+$/.test(raw)||/[#\\+]/.test(raw)||raw.split('?').length!==2)cFail(400,'C_TARGET');
 const [path,query]=raw.split('?');if(path.includes('%')||query.length>P.queryBytes)cFail(400,'C_TARGET');
 const params=new Map<string,string>();
 for(const part of query.split('&')){const pair=part.split('=');if(pair.length!==2)cFail(400,'C_QUERY');let key:string,value:string;try{key=decodeURIComponent(pair[0]);value=decodeURIComponent(pair[1]);}catch{cFail(400,'C_ENCODING');}if(params.has(key)||!['version','limit','cursor'].includes(key))cFail(400,'C_QUERY');params.set(key,value);}
 if(params.get('version')!=='1')cFail(400,'C_VERSION');
 const match=/^\/c-test\/v1\/projects\/(prj_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(\/history)?$/.exec(path);
 const operation=path==='/c-test/v1/projects'?'list-projects':match?.[2]?'list-revisions':match?'read-project':null;if(!operation)cFail(400,'C_TARGET');
 if(operation==='read-project'&&params.size!==1)cFail(400,'C_QUERY');
 const limit=params.get('limit')??String(P.pageDefault);if(!/^[1-4]$/.test(limit))cFail(400,'C_LIMIT');const cursor=params.get('cursor')??null;
 if(cursor!==null&&(cursor.length>256||!/^v1\.[0-9a-f]{32}\.[1-9][0-9]{0,3}\.[0-9a-f]{64}$/.test(cursor)))cFail(400,'C_CURSOR');
 const project=match?.[1]??null,target=operation==='list-projects'?'/test/v0/projects':`/test/v0/projects/${project}${operation==='list-revisions'?'/history':''}`;
 return {operation,project,target,limit:Number(limit),cursor};
}
interface Entry {account:string;scope:string;limit:number;expires:number;digest:string;count:number;}
/** Bounded, restart-invalidated TEST cursors. Any observed list change => explicit restart. */
export class CTestPages {
 #secret=randomBytes(32);#entries=new Map<string,Entry>();
 constructor(private readonly now:()=>number=Date.now){}
 private mac(id:string,offset:number,e:Entry){return createHmac('sha256',this.#secret).update(JSON.stringify([P.id,id,offset,e.account,e.scope,e.limit,e.expires,e.digest,e.count])).digest('hex');}
 page(account:string,q:CQuery,body:string,binding:string):string {
  // This is owned output of our isolated worker, never an untrusted request decoder or cast.
  const result:unknown=JSON.parse(body);if(!cRecord(result))cFail(503,'C_INTERNAL');
  if(q.operation==='read-project')return body;
  const field=q.operation==='list-projects'?'projects':'revisions',rows=result[field];
  if(!Array.isArray(rows))return body;
  const order=(v:unknown):[number,string]=>{if(!cRecord(v))cFail(503,'C_INTERNAL');if(field==='projects'){if(typeof v.projectId!=='string')cFail(503,'C_INTERNAL');return [0,v.projectId];}if(typeof v.sequence!=='number'||!cRecord(v.revision)||typeof v.revision.id!=='string')cFail(503,'C_INTERNAL');return [v.sequence,v.revision.id];};
  const ordered=rows.slice().sort((a:unknown,b:unknown)=>{const x=order(a),y=order(b);return x[0]-y[0]||(x[1]<y[1]?-1:x[1]>y[1]?1:0);});
  const scope=q.operation+':'+(q.project??''),digest=createHash('sha256').update(binding).update(body).digest('hex');let offset=0,id='',entry:Entry;
  for(const [k,v] of this.#entries)if(this.now()>=v.expires)this.#entries.delete(k);
  if(q.cursor){const parts=q.cursor.split('.');id=parts[1];offset=Number(parts[2]);const e=this.#entries.get(id);if(!e||this.now()>=e.expires)cFail(400,'C_CURSOR');const expected=this.mac(id,offset,e);if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(parts[3],'hex'))||e.account!==account||e.scope!==scope||e.limit!==q.limit||offset>=e.count||offset%e.limit!==0)cFail(400,'C_CURSOR');if(e.digest!==digest)cFail(409,'C_LIST_CHANGED');entry=e;
  }else{if(this.#entries.size>=P.cursors)cFail(503,'C_CURSOR_CAPACITY');id=randomBytes(16).toString('hex');entry={account,scope,limit:q.limit,expires:this.now()+P.cursorMs,digest,count:rows.length};if(rows.length>q.limit)this.#entries.set(id,entry);}
  const end=Math.min(offset+q.limit,rows.length),nextCursor=end<rows.length?`v1.${id}.${end}.${this.mac(id,end,entry)}`:null;
  return JSON.stringify({...result,[field]:ordered.slice(offset,end),nextCursor,paginationProfile:'zarya.p04.c.cursor.test/v1'});
 }
}
