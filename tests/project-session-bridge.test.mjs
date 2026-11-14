import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

// Child isolates DATA_DIR module state. Static test program never handles real users.
function observe(scenario) {
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--input-type=module','-'],{cwd:process.cwd(),stdio:['pipe','pipe','pipe']});
  let output='',error='';const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('G1A_TEST_TIMEOUT'));},25000);
  child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);
  child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);code===0?resolve(JSON.parse(output)):reject(Error('G1A_TEST_FAILED '+error));});
  child.stdin.end(`
   import assert from 'node:assert/strict';
   import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomBytes} from 'node:crypto';
   const dir=await mkdtemp(join(tmpdir(),'zarya-g1a-auth-'));process.env.DATA_DIR=dir;
   const {addUser}=await import('./server/auth.mjs');const {createApp}=await import('./server/index.mjs');
   const {principalBoundaryFor}=await import('./server/projects/principal-boundary.mjs');
   const password=randomBytes(24).toString('hex');await addUser('g1a-user-a',password);await addUser('g1a-user-b',password);
   const original=await readFile(join(dir,'users.json'));const origin='http://g1a.invalid';let app;
   try {
    app=await createApp({origin,sessionTTL:${scenario==='expiry'?3000:60000}});const requests=[];
    app.server.on('request',req=>requests.push(req));await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
    const base='http://127.0.0.1:'+app.server.address().port,b=principalBoundaryFor(app.server);assert.ok(b);
    const login=async(name,cookie)=>{const r=await fetch(base+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify({username:name,password})});assert.equal(r.status,200);const raw=r.headers.get('set-cookie');assert.match(raw,/HttpOnly/);assert.match(raw,/SameSite=Strict/);assert.match(raw,/wdeaf_session=/);return raw.split(';')[0];};
    const me=async cookie=>{const r=await fetch(base+'/api/me',{headers:{Cookie:cookie}});return {response:r,body:await r.json(),request:requests.at(-1)};};
    const a1=await login('g1a-user-a'),a2=await login('g1a-user-a'),b1=await login('g1a-user-b');assert.equal(new Set([a1,a2,b1]).size,3);
    const x=await me(a1),y=await me(a2),z=await me(b1);assert.equal(x.response.status,200);assert.equal(y.response.status,200);assert.equal(z.response.status,200);
    assert.equal(x.body.id,y.body.id);assert.notEqual(x.body.id,z.body.id);assert.deepEqual(Object.keys(x.body).sort(),['id','username']);
    const p=await b.principalFor(x.request);assert.ok(p);assert.equal(JSON.stringify(p),'{}');
    const grant=await b.authorize(p,'list-projects',[]);assert.equal(grant.kind,'guard-authorized');assert.equal(grant.persistencePermission,'NOT_GRANTED');
    if(${JSON.stringify(scenario)}==='logout') {
     const r=await fetch(base+'/api/logout',{method:'POST',headers:{Origin:origin,Cookie:a1}});assert.equal(r.status,200);
     assert.equal(await b.canDeliver(grant.delivery,x.request),false);assert.equal((await me(a1)).response.status,401);
     assert.equal((await me(a2)).response.status,200);assert.equal((await me(b1)).response.status,200);await login('g1a-user-a');assert.equal((await me(a2)).response.status,200);
    }
    if(${JSON.stringify(scenario)}==='switch') {
     const changed=await login('g1a-user-b',a1);assert.equal(await b.isCurrent(p,x.request),false);assert.equal(await b.canDeliver(grant.delivery,x.request),false);
     assert.equal((await me(changed)).body.id,z.body.id);assert.equal((await me(a2)).body.id,x.body.id);
    }
    if(${JSON.stringify(scenario)}==='expiry') {
     await new Promise(r=>setTimeout(r,3100));assert.equal(await b.isCurrent(p,x.request),false);assert.equal((await me(a1)).response.status,401);
    }
    if(${JSON.stringify(scenario)}==='account-removal') {
     const list=JSON.parse(original);await writeFile(join(dir,'users.json'),JSON.stringify(list.filter(u=>u.id!==x.body.id)));
     assert.equal(await b.canDeliver(grant.delivery,x.request),false);assert.equal((await me(a1)).response.status,401);
    }
    if(${JSON.stringify(scenario)}==='claims') {
     const r=await fetch(base+'/api/me',{headers:{Cookie:'wdeaf_session='+z.body.id,ownerId:x.body.id,accountId:x.body.id,roles:'admin'}});assert.equal(r.status,401);
     for(const id of ['foreign','missing'])assert.equal((await b.authorize(p,'read-project',[{kind:'project',id,projectId:null}])).kind,'denied');
     const bad=await fetch(base+'/api/logout',{method:'POST',headers:{Origin:'https://foreign.invalid',Cookie:a1}});assert.equal(bad.status,403);assert.equal((await me(a1)).response.status,200);
     assert.equal((await fetch(base+'/api/projects',{headers:{Cookie:a1}})).status,404);
     assert.equal((await fetch(base+'/api/principal',{headers:{Cookie:a1}})).status,404);
     assert.equal((await fetch(base+'/server/session-context.mjs',{headers:{Cookie:a1}})).status,404);
    }
    if(${JSON.stringify(scenario)}==='restart') {
     await app.close();assert.equal(await b.isCurrent(p,x.request),false); // Closing the server fences its private bridge; new instance cannot recognize old lease.
     app=await createApp({origin});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
     const r=await fetch('http://127.0.0.1:'+app.server.address().port+'/api/me',{headers:{Cookie:a1}});assert.equal(r.status,401);
     assert.equal(await principalBoundaryFor(app.server).isCurrent(p,x.request),false);
    }
    if(${JSON.stringify(scenario)}!=='account-removal')assert.deepEqual(await readFile(join(dir,'users.json')),original);
    console.log(JSON.stringify({ok:true,scenario:${JSON.stringify(scenario)},privateHandlesInWire:false}));
   } finally {if(app)await app.close();await rm(dir,{recursive:true,force:false});}
  `);
 });
}
for(const scenario of ['logout','switch','expiry','account-removal','claims','restart'])test('G1a actual guard: '+scenario,async()=>{
 const r=await observe(scenario);assert.equal(r.ok,true);assert.equal(r.privateHandlesInWire,false);assert.doesNotMatch(JSON.stringify(r),/password|wdeaf_session|[0-9a-f]{32}/);
});
test('G1a source wiring has no synthetic imports/new API/public principal or client integration',async()=>{
 const s=await readFile('server/index.mjs','utf8');assert.doesNotMatch(s,/verified-principal|server-foundation-policy|e-workspace|\/api\/projects|\/api\/principal/);
 const routes=[...s.matchAll(/path === '(\/api\/[^']+)'/g)].map(x=>x[1]);assert.deepEqual(routes,['/api/login','/api/logout','/api/me']);
 const b=await readFile('server/projects/principal-boundary.mjs','utf8');assert.doesNotMatch(b,/A_TEST|E_TEST|console\.|fetch\(|node:sqlite/);
});
