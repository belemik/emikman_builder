import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { fixtureMayPublish } from './fixtures/hardening-contracts';
test('H2 actual unchanged auth: three disposable sessions/logout/relogin/restart/expiry and scoped bridge',async()=>{
 const {stdout}=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('./fixtures/hardening-principal-child.mjs',import.meta.url))],{timeout:20000});
 const evidence=JSON.parse(stdout);assert.equal(evidence.threeSessions,true);assert.equal(evidence.logoutIndependent,true);assert.equal(evidence.reloginIndependent,true);assert.equal(evidence.crossAccountBridgeDenied,true);assert.equal(evidence.restartInvalidates,true);assert.equal(evidence.expiry,true);assert.equal(evidence.noProjectRoute,true);assert.equal(evidence.productionPrincipal,false);
 assert.doesNotMatch(stdout,/password|cookie|[0-9a-f]{32}/i);
});
test('H2 late response candidate: account switch, logout generation and same-account relogin discard',()=>{
 const start={account:'fixture-A',generation:1};assert.equal(fixtureMayPublish(start,start),true);
 assert.equal(fixtureMayPublish(start,{account:'fixture-B',generation:1}),false);
 assert.equal(fixtureMayPublish(start,{account:'fixture-A',generation:2}),false);
});
