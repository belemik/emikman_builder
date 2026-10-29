import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as reactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import oldSeed from '../components.seed.json';
import newSeed from '../components.sprint02.seed.json';
import { registry, defaults } from '../src/registry';
import { createElement, emptyDocument } from '../src/canvas/model';
import { parseDocument, loadDocument, saveDocument, migrationWarning } from '../src/storage';
import { generatePrompt } from '../src/prompt';
import { verifiedTokens } from '../src/tokens';
import { themeStyle, resolveTheme, editorDefaults } from '../src/theme/model';
import { Preview } from '../src/canvas/Preview';

function legacy(radius = 14) {
  return { schemaVersion: 1, platform: 'web', elements: oldSeed.components.map((entry, index) => ({ id: `old-${index}`, component: entry.id, variantProps: defaults(entry.variantProps as any), editorProps: defaults(entry.editorProps as any) })), theme: { primaryColor: '#123456', radius, fontFamily: 'Arial' } };
}
test('v1 migrates keeping ids, content, order, colour and font; v2 round trip', () => {
  const old = legacy(); const doc = parseDocument(JSON.stringify(old));
  assert.equal(doc.schemaVersion, 2); assert.deepEqual(doc.elements, old.elements);
  assert.deepEqual(doc.themeOverrides, { primaryColor: '#123456', radiusPx: 14, fontFamily: 'Arial' });
  assert.deepEqual(parseDocument(JSON.stringify(doc)), doc);
  assert.equal(parseDocument(JSON.stringify(legacy(48))).themeOverrides.radiusPx, 32);
  assert.match(migrationWarning(JSON.stringify(legacy(48)))!, /32 px/);
});
test('registry contains exactly five components and preserves original Button/Input schemas', () => {
  assert.deepEqual(registry.map(e => e.id), ['button', 'input', 'select', 'checkbox', 'table']);
  assert.deepEqual(registry.slice(0, 2), oldSeed.components);
  assert.deepEqual(registry.find(e => e.id === 'table')!.variantProps, {});
  assert.equal(registry.find(e => e.id === 'table')!.childComponentMetadata!.variantProps['cell-type'].values.length, 14);
  assert.deepEqual(registry.slice(2), newSeed.components.slice(2));
});
test('all five components survive round trip; prompt separates tokens, overrides and child metadata', () => {
  const doc = emptyDocument(); doc.elements = registry.map(e => createElement(e.id));
  doc.themeOverrides = { primaryColor: '#112233', radiusPx: 12, fontFamily: 'Arial' };
  assert.deepEqual(parseDocument(JSON.stringify(doc)), doc);
  const prompt = generatePrompt(doc);
  for (const element of doc.elements) assert.ok(prompt.includes(element.id) && prompt.includes(`component: ${element.component}`));
  assert.match(prompt, /Figma verified/); assert.match(prompt, /Editor override — themeOverrides/);
  assert.match(prompt, /cell-divider/); assert.match(prompt, /PETROL/); assert.match(prompt, /spacing\/radius\/radius-4/);
});
test('theme is scoped and tokens are immutable; WDeaf restore differs from editor reset', () => {
  const baseline = JSON.stringify(verifiedTokens);
  const changed = themeStyle({ primaryColor: '#abcdef', radiusPx: 0, fontFamily: 'Arial' }) as Record<string, unknown>;
  assert.equal(changed['--preview-accent'], '#abcdef'); assert.equal(changed['--preview-radius'], '0px');
  assert.equal(resolveTheme({}).primaryColor, '#0055ff'); assert.equal(resolveTheme({}).radiusPx, undefined);
  assert.equal(resolveTheme(editorDefaults).radiusPx, 8);
  assert.ok(!('appAppearance' in changed)); assert.equal(JSON.stringify(verifiedTokens), baseline);
  assert.ok(Object.isFrozen(verifiedTokens) && Object.isFrozen(verifiedTokens['surface/primary/default']));
});
test('invalid overrides, boolean variants, table root props and oversized content are rejected', () => {
  for (const overrides of [{ radiusPx: 33 }, { radiusPx: -1 }, { primaryColor: 'red' }, { fontFamily: '' }, { appAppearance: 'dark' }]) {
    assert.throws(() => parseDocument(JSON.stringify({ ...emptyDocument(), themeOverrides: overrides })));
  }
  const doc = emptyDocument(); doc.elements = [createElement('select')];
  doc.elements[0].variantProps.label = 'true'; assert.throws(() => parseDocument(JSON.stringify(doc)));
  doc.elements = [createElement('table')]; doc.elements[0].variantProps['cell-type'] = 'cell-text'; assert.throws(() => parseDocument(JSON.stringify(doc)));
  doc.elements = [createElement('select')]; doc.elements[0].editorProps.optionsText = 'x'.repeat(2001); assert.throws(() => parseDocument(JSON.stringify(doc)));
});
test('preview renders each component; imported text is escaped, checkbox exposes mixed and disabled', () => {
  for (const entry of registry) assert.ok(renderToStaticMarkup(reactElement(Preview, { element: createElement(entry.id) })).length > 0);
  const checkbox = createElement('checkbox'); checkbox.variantProps.indeterminate = true; checkbox.variantProps.state = 'disabled';
  const html = renderToStaticMarkup(reactElement(Preview, { element: checkbox }));
  assert.match(html, /aria-checked="mixed"/); assert.match(html, /disabled/);
  const table = createElement('table'); table.editorProps.title = '<script>alert(1)</script>';
  const tableHtml = renderToStaticMarkup(reactElement(Preview, { element: table }));
  assert.ok(tableHtml.includes('&lt;script&gt;') && !tableHtml.includes('<script>'));
  assert.equal((tableHtml.match(/<tr>/g) || []).length, 4);
});
test('local migration backs up raw v1 before write and keeps account storage isolated', () => {
  const data = new Map<string,string>(); const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string,value: string) => data.set(key,value) } });
  try {
    const raw = JSON.stringify(legacy()); data.set('account-a', raw);
    const loaded = loadDocument('account-a'); saveDocument(loaded.document, 'account-a');
    assert.equal(data.get('account-a.sprint01-backup'), raw);
    assert.equal(JSON.parse(data.get('account-a')!).schemaVersion, 2);
    assert.equal(loadDocument('account-b').document.elements.length, 0);
    saveDocument(emptyDocument(), 'account-a'); assert.equal(data.get('account-a.sprint01-backup'), raw);
  } finally { if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage); else Reflect.deleteProperty(globalThis, 'localStorage'); }
});
