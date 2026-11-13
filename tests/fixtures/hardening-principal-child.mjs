// Disposable actual-auth probe. No source modifications, Project routes or production authority.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
process.env.DATA_DIR=await mkdtemp(join(tmpdir(),'zarya-h2-auth-'));
const {addUser}=await import('../../server/auth.mjs');
const {createApp}=await import('../../server/index.mjs');
const password=randomBytes(24).toString('hex');
await addUser('h2-fixture-a',password);await addUser('h2-fixture-b',password);
const origin='http://h2-fixture.invalid';
async function start(ttl=60000) {
 const app=await createApp({origin,sessionTTL:ttl});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.server.address().port;
 const login=async(user)=>{const r=await fetch(base+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:user,password})});assert.equal(r.status,200);const h=r.headers.get('set-cookie');assert.ok(h);return h.split(';')[0];};
 const me=c=>fetch(base+'/api/me',{headers:{Cookie:c}});
 return {app,base,login,me};
}
let e=await start();const tokens=[];
try {
 for(let i=0;i<3;i++)tokens.push(await e.login('h2-fixture-a'));
 const users=await Promise.all(tokens.map(async c=>{const r=await e.me(c);assert.equal(r.status,200);return r.json();}));
 assert.equal(new Set(users.map(u=>u.id)).size,1);assert.equal(new Set(tokens).size,3);
 const otherCookie=await e.login('h2-fixture-b'),other=await (await e.me(otherCookie)).json();assert.notEqual(other.id,users[0].id);
 // Disposable bridge contract: ownership determined from authoritative /api/me observation;
 // no integration with P03 and no claim this is an in-server production principal constructor.
 const bridgeRead=(observed,owner)=>observed.id===owner?{kind:'found'}:{kind:'not-found'};
 assert.deepEqual(bridgeRead(users[0],other.id),{kind:'not-found'});assert.deepEqual(bridgeRead(users[1],users[0].id),{kind:'found'});
 const out=await fetch(e.base+'/api/logout',{method:'POST',headers:{Origin:origin,Cookie:tokens[0]}});assert.equal(out.status,200);
 assert.equal((await e.me(tokens[0])).status,401);for(const c of tokens.slice(1))assert.equal((await e.me(c)).status,200);
 await e.login('h2-fixture-a');for(const c of tokens.slice(1))assert.equal((await e.me(c)).status,200);
 assert.equal((await fetch(e.base+'/api/projects',{headers:{Cookie:tokens[1]}})).status,404);
} finally {await e.app.close();}
e=await start();try {for(const c of tokens)assert.equal((await e.me(c)).status,401);}finally{await e.app.close();}
e=await start(1);try {const c=await e.login('h2-fixture-a');await new Promise(r=>setTimeout(r,20));assert.equal((await e.me(c)).status,401);}finally{await e.app.close();}
// Deliberately report booleans only: no account IDs, cookies, hashes or passwords in evidence.
console.log(JSON.stringify({scope:'DISPOSABLE_ACTUAL_AUTH_OBSERVATION',threeSessions:true,logoutIndependent:true,reloginIndependent:true,crossAccountBridgeDenied:true,restartInvalidates:true,expiry:true,noProjectRoute:true,productionPrincipal:false}));
