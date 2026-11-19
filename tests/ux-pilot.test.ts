import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changePilot, exportPilot, initialDocument, initialHistory, moveMenu, validatePilot } from '../src/ux-pilot/model';

test('pilot preserves locales and stable IDs across undo, redo and a new branch of history', () => {
  const renamed = { ...initialDocument, hero: { ...initialDocument.hero, en: 'Edited Hero' } };
  const ordered = { ...renamed, menu: moveMenu(renamed.menu, 'nav-contact', -1) };
  const first = changePilot(initialHistory, { type: 'commit', document: renamed });
  const second = changePilot(first, { type: 'commit', document: ordered });
  const undo = changePilot(second, { type: 'undo' });
  assert.deepEqual(undo.present, renamed);
  assert.deepEqual(changePilot(undo, { type: 'redo' }).present.menu.map(item => item.id), ['nav-contact', 'nav-hero']);
  const branch = changePilot(undo, { type: 'commit', document: { ...renamed, menu: [] } });
  assert.deepEqual(branch.future, []);
  assert.equal(branch.present.hero.ru, initialDocument.hero.ru);
  assert.equal(changePilot(branch, { type: 'commit', document: branch.present }), branch);
});

test('pilot export rejects unsafe destinations, duplicate IDs, and unknown metadata', () => {
  assert.deepEqual(JSON.parse(exportPilot(initialDocument)), initialDocument);
  const item = initialDocument.menu[0];
  for (const invalid of [
    { ...initialDocument, menu: [{ ...item, target: 'https://example.invalid/' }] },
    { ...initialDocument, menu: [item, item] },
    { ...initialDocument, comments: [] },
    { ...initialDocument, hero: { en: 'Hero', ru: ' ' } },
    { ...initialDocument, menu: Object.assign([item], { toJSON: () => [] }) },
  ]) {
    assert.equal(validatePilot(invalid), false);
    assert.throws(() => exportPilot(invalid), /не прошёл проверку/);
  }
});
