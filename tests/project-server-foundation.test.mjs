import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
// Inline child is static trusted test code. No arbitrary input is executed or used as principal data.
function disposableObservation() {
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--import','tsx','--input-type=module','-'],{cwd:process.cwd(),stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('A_DISPOSABLE_TIMEOUT'));},20000);
  child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(Error('A_DISPOSABLE_FAILED '+stderr));else resolve(stdout);});
  child.stdin.end(`
   import assert from 'node:assert/strict';
   import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomBytes} from 'node:crypto';
   const data=await mkdtemp(join(tmpdir(),'zarya-a-auth-'));process.env.DATA_DIR=data;
   const {addUser}=await import('./server/auth.mjs');const {createApp}=await import('./server/index.mjs');
   const password=randomBytes(24).toString('hex');await addUser('a-fixture',password);await addUser('b-fixture',password);
   const origin='http://a-fixture.invalid';
   async function start(ttl=60000){const app=await createApp({origin,sessionTTL:ttl});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;return {app,base};}
   let e=await start();
   const login=async name=>{const r=await fetch(e.base+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:name,password})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
   const me=c=>fetch(e.base+'/api/me',{headers:{Cookie:c}});
   let cookies=[];
   try {
    cookies=await Promise.all([login('a-fixture'),login('a-fixture'),login('a-fixture')]);assert.equal(new Set(cookies).size,3);
    const users=await Promise.all(cookies.map(async c=>{const r=await me(c);assert.equal(r.status,200);return r.json();}));assert.equal(new Set(users.map(u=>u.id)).size,1);
    const other=await (await me(await login('b-fixture'))).json();assert.notEqual(users[0].id,other.id);
    const logout=await fetch(e.base+'/api/logout',{method:'POST',headers:{Origin:origin,Cookie:cookies[0]}});assert.equal(logout.status,200);assert.equal((await me(cookies[0])).status,401);
    for(const c of cookies.slice(1))assert.equal((await me(c)).status,200);await login('a-fixture');for(const c of cookies.slice(1))assert.equal((await me(c)).status,200);
    assert.equal((await fetch(e.base+'/api/projects',{headers:{Cookie:cookies[1]}})).status,404);
   }finally{await e.app.close();}
   e=await start();try{for(const c of cookies)assert.equal((await me(c)).status,401);}finally{await e.app.close();}
   e=await start(1);try{const c=await login('a-fixture');await new Promise(r=>setTimeout(r,20));assert.equal((await me(c)).status,401);}finally{await e.app.close();}
   // Only this newly created owned fixture directory; no historical H2 temp folders or user data.
   await rm(data,{recursive:true,force:false});
   console.log(JSON.stringify({threeSessions:true,twoAccounts:true,logout:true,relogin:true,restart:true,expiry:true,noProjectApi:true,guardHandoff:'NOT_IMPLEMENTED'}));
  `);
 });
}
test('A foundation unchanged actual server observations use only disposable sessions, not a real handoff',async()=>{
 const stdout=await disposableObservation();const r=JSON.parse(stdout);
 for(const name of ['threeSessions','twoAccounts','logout','relogin','restart','expiry','noProjectApi'])assert.equal(r[name],true);
 assert.equal(r.guardHandoff,'NOT_IMPLEMENTED');assert.doesNotMatch(stdout,/cookie|password|[0-9a-f]{32}/i);
});
test('A foundation actual server has no principal imports/routes; policy has no production profile',async()=>{
 const server=await readFile(new URL('../server/index.mjs',import.meta.url),'utf8');assert.doesNotMatch(server,/verified-principal|server-foundation-policy|\/api\/projects/);
 const {inspectTestFoundationPolicy}=await import('../server/projects/server-foundation-policy.ts');
 assert.equal(inspectTestFoundationPolicy('production').kind,'test-policy-rejected');
});
