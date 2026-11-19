import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { createElement } from '../src/canvas/model';
import { prepareButtonExample } from '../src/component-studio/button-example';

test('studio builds a typed JSX example from a verified Button without mutating its input', () => {
  const element = createElement('button');
  const label = 'Demo "Button" {literal} <preview>\\\u2028';
  element.editorProps.label = label;
  const original = structuredClone(element);
  const example = prepareButtonExample(element);
  assert.ok(example.valid);
  assert.equal(example.value.elements[0].editorProps.label, label);
  assert.equal(example.value.elements[0].id, 'button-example');
  assert.equal(example.code.includes(element.id), false);
  assert.equal(example.code.includes('<preview>'), false);
  const start = 'return <DSRenderer screen={';
  const end = '} />;';
  const json = example.code.slice(example.code.indexOf(start) + start.length, example.code.lastIndexOf(end));
  assert.deepEqual(JSON.parse(json), example.value);
  assert.deepEqual(ts.transpileModule(example.code, {
    fileName: 'ButtonExample.tsx',
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  }).diagnostics, []);
  assert.deepEqual(element, original);
});

test('studio withholds code for unimplemented variants and unknown properties', () => {
  const element = createElement('button');
  const unsupported = prepareButtonExample({ ...element, variantProps: { ...element.variantProps, size: 'xl' } });
  assert.ok(!unsupported.valid);
  assert.ok(unsupported.errors.some(error => error.code === 'RENDERER_UNSUPPORTED'));
  assert.equal('code' in unsupported, false);
  const unknown = prepareButtonExample({ ...element, editorProps: { ...element.editorProps, captionColor: 'red' } });
  assert.ok(!unknown.valid);
  assert.ok(unknown.errors.some(error => error.code === 'UNKNOWN_FIELD' && error.path.endsWith('/captionColor')));
  assert.equal('code' in unknown, false);
});
