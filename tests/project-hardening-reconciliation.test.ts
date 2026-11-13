import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixtureStatus} from './fixtures/hardening-contracts';
import {testEnvironment,createRequest,candidate,header} from './fixtures/p04-support';
import {snapshotDisposableStore,restoreDisposableSnapshot} from '../server/projects/store-backup';
import {createDisposableVolume} from '../server/projects/disposable-volume';
const status={authorized:true,currentEpoch:'new',operationEpoch:'new',fingerprint:'fp',receiptFingerprint:'fp',now:1,expires:10};
test('H4 reconciliation candidate: denial/TTL/missing receipts never authorize a new write',()=>{
 assert.equal(fixtureStatus(status),'REPLAY');assert.equal(fixtureStatus({...status,authorized:false}),'DENIED');
 assert.equal(fixtureStatus({...status,receiptFingerprint:'other'}),'KEY_CONFLICT');
 for(const patch of [{now:10},{receiptFingerprint:null},{currentEpoch:'restored'}])assert.equal(fixtureStatus({...status,...patch}),'UNKNOWN_OUTCOME');
});
test('H4 old backup without new receipt: recovery epoch refuses automatic duplicate write',async()=>{
 const e=testEnvironment(),token=e.sessions.issue('fixture-account-A'),snap=createDisposableVolume(),target=createDisposableVolume();
 try {
 await snapshotDisposableStore(e.store,snap);
 const body=createRequest('committed-after-backup'),r=await e.repository.execute(token,candidate('create-project',body));assert.equal(r.kind,'committed');
 await restoreDisposableSnapshot(snap,target,e.store.limits);
 const recovered=testEnvironment({directory:target.directory});try {
 assert.equal(recovered.store.database.prepare('SELECT count(*) n FROM receipts').get()?.n,0);
 const decision=fixtureStatus({...status,currentEpoch:'after-restore',operationEpoch:'before-restore',receiptFingerprint:null});
 assert.equal(decision,'UNKNOWN_OUTCOME');assert.notEqual(decision,'REPLAY');
 // This read-only contract intentionally never dispatches the old command on a new epoch.
 assert.equal(recovered.store.database.prepare('SELECT count(*) n FROM revisions').get()?.n,0);
 recovered.repository.verify();
 }finally{recovered.store.close();}
 }finally{e.store.close();}
});
test('H4 one CAS winner, exact replay, conflicting body and revoked replay preserve atomic counts',async()=>{
 const e=testEnvironment(),token=e.sessions.issue('fixture-account-A');try {
 const first=await e.repository.execute(token,candidate('create-project',createRequest()));assert.equal(first.kind,'committed');if(first.kind!=='committed')throw Error();
 const body={...header,projectId:first.receipt.projectId,expectedRevision:first.receipt.revision,idempotencyKey:'h4-write',metadata:createRequest('unused','winner').metadata};
 const [a,b]=await Promise.all([e.repository.execute(token,candidate('update-metadata',body)),e.repository.execute(token,candidate('update-metadata',{...body,idempotencyKey:'competitor'}))]);
 assert.equal(a.kind,'committed');assert.equal(b.kind,'conflict');
 const replay=await e.repository.execute(token,candidate('update-metadata',body));assert.equal(replay.kind,'committed');if(replay.kind==='committed')assert.equal(replay.receipt.replayed,true);
 assert.equal((await e.repository.execute(token,candidate('update-metadata',{...body,metadata:createRequest('unused','different').metadata}))).kind,'conflict');
 e.sessions.revoke(token);const revoked=await e.repository.execute(token,candidate('update-metadata',body));assert.equal(revoked.kind,'test-denied');
 assert.deepEqual({...e.store.database.prepare('SELECT (SELECT count(*) FROM revisions) r,(SELECT count(*) FROM receipts) c,(SELECT count(*) FROM audit) a').get()},{r:2,c:2,a:2});e.repository.verify();
 }finally{e.store.close();}
});
