import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DemoGate } from '../src/demo';
import { DEMO_STORAGE_KEY, assetUrl } from '../src/runtime';
import { emptyDocument, createElement } from '../src/canvas/model';
import { exportDocument, parseDocument, STORAGE_KEY } from '../src/storage';

test('demo starts with an explicit public welcome; storage is separate from authenticated and legacy documents', () => {
  const html = renderToStaticMarkup(h(DemoGate, { children: () => h('div', {}, 'CANVAS') }));
  assert.match(html, /Публичная демоверсия/);
  assert.doesNotMatch(html, /CANVAS|type="password"/);
  assert.notEqual(DEMO_STORAGE_KEY, STORAGE_KEY);
  assert.ok(!DEMO_STORAGE_KEY.startsWith(STORAGE_KEY + '.'));
  assert.equal(assetUrl('/icons/plus.svg'), '/icons/plus.svg');
});

test('JSON download contains the actual document and preserves props and theme', async () => {
  const doc = emptyDocument(); doc.elements.push(createElement('button'));
  doc.elements[0].editorProps.label = 'Pages export';
  doc.themeOverrides = { primaryColor: '#8833aa' };
  let blob: Blob | undefined;
  let clicked = false;
  const link = { href: '', download: '', click: () => { clicked = true; } };
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const oldCreate = URL.createObjectURL;
  URL.createObjectURL = value => { blob = value as Blob; return 'blob:demo-test'; };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { document: { createElement: () => link } } });
  try {
    exportDocument(doc);
    assert.equal(clicked, true); assert.equal(link.download, 'wdeaf-canvas.json');
    assert.equal(blob!.type, 'application/json');
    assert.deepEqual(parseDocument(await blob!.text()), doc);
  } finally {
    URL.createObjectURL = oldCreate;
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
