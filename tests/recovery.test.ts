import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDocument } from '../src/canvas/model';
import { listRecoveryBackups, preserveRejectedDocument, loadDocument, saveDocument } from '../src/storage';

function withStorage(run: (values: Map<string, string>, fail: (value: boolean) => void) => void) {
  const values = new Map<string, string>(); let broken = false;
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, raw: string) => { if (broken) throw new Error('QuotaExceededError'); values.set(key, raw); },
  } });
  try { run(values, value => { broken = value; }); }
  finally { if (prior) Object.defineProperty(globalThis, 'localStorage', prior); else Reflect.deleteProperty(globalThis, 'localStorage'); }
}
test('sequential recoveries retain all exact sources, legacy backup and account isolation', () => withStorage(values => {
  values.set('a.rejected-backup', 'legacy source');
  for (const raw of ['{ first invalid JSON', '{ second invalid JSON', '{ third invalid JSON']) {
    values.set('a', raw);
    const rejected = loadDocument('a'); assert.equal(rejected.recoveryRaw, raw);
    const key = preserveRejectedDocument(rejected.recoveryRaw!, 'a');
    assert.equal(preserveRejectedDocument(raw, 'a'), key);
    saveDocument(emptyDocument(), 'a');
    assert.equal(values.get(key), raw);
    assert.equal(loadDocument('a').error, undefined);
  }
  assert.deepEqual(new Set(listRecoveryBackups('a').map(b => b.raw)), new Set(['legacy source', '{ first invalid JSON', '{ second invalid JSON', '{ third invalid JSON']));
  assert.deepEqual(listRecoveryBackups('b'), []);
  const current = values.get('a'); preserveRejectedDocument('another raw source', 'a'); assert.equal(values.get('a'), current);
}));
test('failed backup or project write preserves previous copies and current source', () => withStorage((values, fail) => {
  preserveRejectedDocument('old source', 'a'); values.set('a', 'new source');
  const before = new Map(values); fail(true);
  assert.throws(() => preserveRejectedDocument('new source', 'a'), /Quota/);
  assert.deepEqual(values, before);
  assert.throws(() => saveDocument(emptyDocument(), 'a'), /Quota/);
  assert.deepEqual(values, before);
  fail(false); preserveRejectedDocument('new source', 'a');
  assert.equal(listRecoveryBackups('a').length, 2);
  assert.equal(values.get('a'), 'new source');
}));
