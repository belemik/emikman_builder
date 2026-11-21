import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discardInspectorDraft, discardLayerDrafts, editInspectorDraft, emptyInspectorDrafts, getDirtyInspectorDrafts, hasLayerDrafts,
  readInspectorDraft, type InspectorValue } from '../src/ux-pilot/inspector-drafts';
import { initialDocument } from '../src/ux-pilot/model';

test('Inspector draft changes are isolated by stable layer ID and locale', () => {
  const committed: InspectorValue = { text: 'Исходный', target: '#hero' };
  const ru = editInspectorDraft(emptyInspectorDrafts, 'nav-a', 'ru', { ...committed, text: 'Черновик' }, committed);
  const en = editInspectorDraft(ru, 'nav-a', 'en', { text: 'Draft', target: '#contact' }, committed);
  const both = editInspectorDraft(en, 'nav-b', 'ru', { ...committed, text: 'Другой' }, committed);
  assert.deepEqual(readInspectorDraft(both, 'nav-a', 'ru'), { text: 'Черновик' });
  assert.deepEqual(readInspectorDraft(both, 'nav-a', 'en'), { text: 'Draft', target: '#contact' });
  assert.equal(readInspectorDraft(both, 'nav-b', 'en'), undefined);
  assert.equal(emptyInspectorDrafts.size, 0);
  const cleared = discardInspectorDraft(both, 'nav-a', 'ru');
  assert.equal(hasLayerDrafts(cleared, 'nav-a'), true);
  assert.equal(readInspectorDraft(cleared, 'nav-a', 'ru'), undefined);
  const removed = discardLayerDrafts(cleared, ['nav-a']);
  assert.equal(hasLayerDrafts(removed, 'nav-a'), false);
  assert.equal(readInspectorDraft(removed, 'nav-b', 'ru')?.text, 'Другой');
  assert.equal(editInspectorDraft(both, 'nav-b', 'ru', committed, committed).size, 2);
});

test('history equality is derived per field, layer and locale without destroying drafts', () => {
  const item = initialDocument.menu[0];
  const base = { text: item.label.ru, target: item.target };
  const target = item.target === '#contact' ? '#hero' : '#contact';
  const draft = editInspectorDraft(emptyInspectorDrafts, item.id, 'ru', { text: 'Черновик', target }, base);
  const english = editInspectorDraft(draft, item.id, 'en', { text: 'Independent draft' }, { ...base, text: item.label.en });
  const history = {
    ...initialDocument,
    menu: [{ ...item, label: { ...item.label, ru: 'Черновик' }, target }, ...initialDocument.menu.slice(1)],
  };
  const matching = getDirtyInspectorDrafts(english, history);
  assert.equal(readInspectorDraft(matching, item.id, 'ru'), undefined);
  assert.deepEqual(readInspectorDraft(matching, item.id, 'en'), { text: 'Independent draft' });
  assert.deepEqual(readInspectorDraft(getDirtyInspectorDrafts(english, initialDocument), item.id, 'ru'), { text: 'Черновик', target });

  const editText = editInspectorDraft(english, item.id, 'ru', { text: 'Новый текст' }, { text: 'Черновик', target });
  const active = getDirtyInspectorDrafts(editText, history);
  assert.deepEqual(readInspectorDraft(active, item.id, 'ru'), { text: 'Новый текст' });
  assert.deepEqual(readInspectorDraft(getDirtyInspectorDrafts(editText, initialDocument), item.id, 'ru'), { text: 'Новый текст', target });
  const removed = { ...history, menu: history.menu.slice(1) };
  assert.equal(getDirtyInspectorDrafts(editText, removed).size, 0);
});
