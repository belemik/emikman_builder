import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, emptyDocument, moveElement } from '../src/canvas/model';
import { parseDocument } from '../src/storage';
import { generatePrompt } from '../src/prompt';
import { registry } from '../src/registry';

function populated() {
  const document = emptyDocument();
  document.elements = [createElement('button'), createElement('input')];
  return document;
}
test('JSON round-trip preserves order, separate placeholder props, content and theme', () => {
  const document = populated();
  document.elements[1].variantProps.placeholder = true;
  document.elements[1].editorProps.placeholderText = 'Ваш адрес';
  document.elements[0].variantProps.state = 'pressed';
  document.elements = moveElement(document.elements, document.elements[1].id, -1);
  document.themeOverrides = { primaryColor: '#123456', radiusPx: 14, fontFamily: 'Arial' };
  assert.deepEqual(parseDocument(JSON.stringify(document)), document);
  const prompt = generatePrompt(document);
  assert.ok(prompt.indexOf('1. Input') < prompt.indexOf('2. Button'));
  assert.match(prompt, /Ваш адрес/); assert.match(prompt, /#123456/); assert.match(prompt, /"radiusPx": 14/); assert.match(prompt, /"fontFamily": "Arial"/); assert.match(prompt, /Платформа: web/);
});
test('every variant in the registry remains importable without renaming', () => {
  for (const entry of registry) for (const [key, prop] of Object.entries(entry.variantProps)) {
    for (const value of prop.type === 'enum' ? prop.values : prop.type === 'boolean' ? [true, false] : [prop.default]) {
      const document = emptyDocument(); const element = createElement(entry.id);
      element.variantProps[key] = value; document.elements = [element];
      assert.deepEqual(parseDocument(JSON.stringify(document)), document);
    }
  }
});
test('rejects malformed JSON, schema, platform, theme and component props', () => {
  assert.throws(() => parseDocument('{'));
  const mutations: ((document: any) => void)[] = [
    d => d.schemaVersion = 99, d => d.platform = 'ios', d => d.themeOverrides.radiusPx = -1,
    d => d.themeOverrides.primaryColor = 'red', d => d.themeOverrides.fontFamily = '',
    d => d.elements[0].component = 'card', d => d.elements[0].variantProps.size = 'xxl',
    d => d.elements[0].editorProps.extra = 'unknown', d => delete d.elements[0].variantProps.state,
    d => d.elements[1].variantProps.placeholder = 'true', d => d.elements[1].id = d.elements[0].id,
    d => d.elements = null, d => d.extra = true,
  ];
  for (const mutate of mutations) { const document = populated(); mutate(document); assert.throws(() => parseDocument(JSON.stringify(document))); }
});
test('reordering preserves elements and respects boundaries', () => {
  const { elements } = populated();
  assert.deepEqual(moveElement(elements, elements[0].id, -1), elements);
  assert.deepEqual(moveElement(elements, elements[1].id, 1), elements);
  assert.deepEqual(moveElement(elements, 'missing', 1), elements);
  assert.deepEqual(moveElement(elements, elements[0].id, 1), [elements[1], elements[0]]);
});
