import test from 'node:test';import assert from 'node:assert/strict';
import type {CRequestDiagnostic} from '../server/projects/c-test-http';
import {eHost,createRequest,dCounts,A} from './fixtures/e-test-support';
test('E full metadata lifecycle uses actual A/B/C/D HTTP, immutable revisions and existing soft-delete only',async()=>{const h=await eHost({admit:true});try{const c=h.client(),m=createRequest().metadata,cmd=c.prepareCreate(m,'e-create');const created=await c.send(cmd);assert.equal(created.phase,'COMMITTED');assert.ok(created.receipt);assert.equal(created.project,null);const id=created.receipt.projectId;assert.match(id,/^prj_/);let list=await c.list();assert.equal(list.phase,'READY');assert.equal(list.projects?.length,1);let opened=await c.open(id);assert.equal(opened.project?.metadata.name,m.name);assert.equal(opened.project?.metadata.defaultProductRef,null);const first=opened.project?.revision;const update=c.prepareUpdate({...m,name:'E server update'},'e-update');const changed=await c.send(update);assert.equal(changed.phase,'COMMITTED');assert.notEqual(changed.receipt?.revision.id,first?.id);opened=await c.open(id);assert.equal(opened.project?.metadata.name,'E server update');const history=await c.history(id);assert.equal(history.phase,'READY');assert.equal(history.revisions?.length,2);assert.equal(history.revisions?.[0].metadata.name,m.name);await c.open(id);const deleted=await c.send(c.prepareArchive('e-delete'));assert.equal(deleted.phase,'COMMITTED');list=await c.list();assert.deepEqual(list.projects,[]);opened=await c.open(id);assert.equal(opened.project?.lifecycle,'soft-deleted');assert.throws(()=>c.prepareUpdate(m,'cannot-update-deleted'));assert.deepEqual(dCounts(h.env),[1,3,3,3,3]);assert.equal(created.productionAuthority,'NOT_GRANTED');assert.equal(created.applyPermission,'NOT_GRANTED');assert.equal(Object.hasOwn(created,'checked'),false);}finally{await h.close();}});
test('E immutable prepared bytes preserve CR/LF, Unicode and exact key against caller mutation',async()=>{const h=await eHost({admit:true});try{const c=h.client(),m={name:'Before',description:'CR\r\n NFC é NFD e\u0301',defaultProductRef:null};const handle=c.prepareCreate(m,' exact key ');m.name='Changed after prepare';m.description='caller edit';const r=await c.send(handle);assert.equal(r.phase,'COMMITTED');assert.equal(r.receipt?.idempotencyKey,' exact key ');assert.ok(r.receipt);const p=await c.open(r.receipt.projectId);assert.equal(p.project?.metadata.name,'Before');assert.equal(p.project?.metadata.description,'CR\r\n NFC é NFD e\u0301');assert.ok(Object.isFrozen(p.project?.metadata));assert.deepEqual(dCounts(h.env),[1,1,1,1,1]);}finally{await h.close();}});
test('E explicit same-key replay/different-body conflict does not create a second project',async()=>{const h=await eHost({admit:true});try{const c=h.client(),cmd=c.prepareCreate(createRequest().metadata,'e-same');const first=await c.send(cmd),replayed=await c.send(cmd);assert.equal(replayed.phase,'COMMITTED');assert.equal(replayed.receipt?.replayed,true);assert.equal(replayed.receipt?.revision.id,first.receipt?.revision.id);const conflict=await c.send(c.prepareCreate({...createRequest().metadata,name:'Different body'},'e-same'));assert.equal(conflict.phase,'CONFLICT');assert.equal(conflict.project,null);assert.equal(conflict.receipt,null);assert.deepEqual(dCounts(h.env),[1,1,1,1,1]);}finally{await h.close();}});
test('E real scoped pages use exact cursor and no silent restart on invalidation',async()=>{const h=await eHost({admit:true});try{const c=h.client();for(let i=0;i<5;i++)assert.equal((await c.send(c.prepareCreate({...createRequest().metadata,name:'Project '+i},'e-page-'+i))).phase,'COMMITTED');const ids:string[]=[];let cursor:string|null=null;do{const page=await c.list(cursor,2);assert.equal(page.phase,'READY');assert.ok(page.projects);ids.push(...page.projects.map(p=>p.projectId));cursor=page.cursor;}while(cursor);assert.equal(new Set(ids).size,5);assert.deepEqual(ids,[...ids].sort());const first=await c.list(null,1);assert.ok(first.cursor);await c.send(c.prepareCreate(createRequest().metadata,'e-concurrent-insert'));const stale=await c.list(first.cursor,1);assert.equal(stale.phase,'LIST_INVALIDATED');assert.equal(stale.projects,null);assert.equal(stale.cursor,null);assert.equal((await c.list(null,4)).projects?.length,4);}finally{await h.close();}});
test('E three synthetic same-account sessions see own shared projects; no browser/DB integration inferred',async()=>{const h=await eHost({admit:true});try{const a=h.client(),b=h.client(h.env.sessions.issue(A)),c=h.client(h.env.sessions.issue(A));const first=await a.send(a.prepareCreate(createRequest().metadata,'e-a'));assert.ok(first.receipt);assert.equal((await b.open(first.receipt.projectId)).phase,'READY');assert.equal((await c.list()).projects?.length,1);h.env.sessions.revoke(h.env.token);assert.equal(a.view().phase,'AUTH_REQUIRED');assert.equal((await b.list()).phase,'READY');assert.equal((await c.list()).phase,'READY');}finally{await h.close();}});

async function casPair(h: Awaited<ReturnType<typeof eHost>>) {
  const winner = h.client(), contender = h.client(h.env.sessions.issue(A));
  const metadata = createRequest().metadata;
  const seed = await winner.send(winner.prepareCreate(metadata, 'e-cas-seed'));
  assert.ok(seed.receipt);
  const id = seed.receipt.projectId;
  const first = await winner.open(id), second = await contender.open(id);
  assert.ok(first.project);
  assert.deepEqual(second.project?.revision, first.project.revision);
  return { winner, contender, id,
    firstCommand: winner.prepareUpdate({ ...metadata, name: 'A change' }, 'e-cas-a'),
    secondCommand: contender.prepareUpdate({ ...metadata, name: 'B change' }, 'e-cas-b') };
}

function signal() {
  let resolve = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test('E concurrent admitted sessions use the same expectedRevision: one commit and one CAS conflict', async t => {
  const atDelivery = signal(), nextQueued = signal();
  const trace: CRequestDiagnostic[] = [];
  let hold = false;
  const h = await eHost({ admit: true, http: {
    diagnostics: { record: entry => { trace.push(entry); }, onQueued: nextQueued.resolve },
    beforeDelivery: async () => {
      if (!hold) return;
      hold = false;
      atDelivery.resolve();
      await nextQueued.promise;
    },
  } });
  try {
    const { winner, contender, id, firstCommand, secondCommand } = await casPair(h);
    hold = true;
    const first = winner.send(firstCommand);
    // The first transaction has committed. Keep the two HTTP requests in
    // flight together and release the slot as soon as the contender queues.
    // Queue expiry has its own test. Both commands still pin the old head.
    assert.ok(await Promise.race([atDelivery.promise.then(() => true), first.then(() => false)]),
      'First request must reach delivery with the worker finished');
    const [committed, conflict] = await Promise.all([first, contender.send(secondCommand)]);
    assert.deepEqual([committed.phase, conflict.phase], ['COMMITTED', 'CONFLICT']);
    assert.equal(contender.view().project, null);
    assert.deepEqual(dCounts(h.env), [1, 2, 2, 2, 2]);
    assert.equal((await contender.open(id)).project?.revision.id, committed.receipt?.revision.id);
    assert.deepEqual(dCounts(h.env), [1, 2, 2, 2, 2]);
    assert.equal(h.http.stats().peakQueued, 1);
    const cas = trace.filter(entry => entry.operation === 'update-metadata');
    assert.deepEqual(cas.map(entry => [entry.httpStatus, entry.cas]), [[200, 'committed'], [409, 'conflict']]);
  } finally {
    nextQueued.resolve();
    await h.close();
    t.diagnostic(JSON.stringify(trace));
  }
});

test('E queue expiry before storage leaves only the admitted CAS write and uses explicit receipt checks', async t => {
  const atDispatch = signal(), release = signal();
  const trace: CRequestDiagnostic[] = [];
  let hold = false;
  const h = await eHost({ admit: true, http: {
    diagnostics: { record: entry => { trace.push(entry); } },
    beforeDispatch: async () => {
      if (!hold) return;
      hold = false;
      atDispatch.resolve();
      await release.promise;
    },
  } });
  try {
    const { winner, contender, id, firstCommand, secondCommand } = await casPair(h);
    hold = true;
    const first = winner.send(firstCommand);
    assert.ok(await Promise.race([atDispatch.promise.then(() => true), first.then(() => false)]),
      'First request must occupy the HTTP slot');
    const expired = await contender.send(secondCommand);
    assert.equal(expired.phase, 'UNKNOWN_OUTCOME');
    assert.equal(expired.receipt, null);
    assert.deepEqual(dCounts(h.env), [1, 1, 1, 1, 1]);
    const failure = trace.find(entry => entry.errorCode === 'C_QUEUE');
    assert.equal(failure?.httpStatus, 503);
    assert.equal(failure.transactionStage, 'not-dispatched');
    assert.equal(failure.cas, 'not-run');
    release.resolve();
    const committed = await first;
    assert.equal(committed.phase, 'COMMITTED');
    assert.ok(committed.receipt);
    assert.equal((await contender.send(secondCommand)).phase, 'UNKNOWN_OUTCOME');
    assert.equal(trace.filter(entry => entry.operation === 'update-metadata' && entry.mode === 'command').length, 2);
    assert.equal((await contender.reconcile(secondCommand)).phase, 'UNKNOWN_OUTCOME');
    const recovered = await winner.reconcile(firstCommand);
    assert.equal(recovered.receipt?.revision.id, committed.receipt.revision.id);
    assert.equal((await contender.open(id)).project?.revision.id, committed.receipt.revision.id);
    assert.deepEqual(dCounts(h.env), [1, 2, 2, 2, 2]);
    assert.equal(h.env.ledger.database.prepare('SELECT count(*) n FROM intents').get()?.n, 2);
  } finally {
    release.resolve();
    await h.close();
    t.diagnostic(JSON.stringify(trace));
  }
});
