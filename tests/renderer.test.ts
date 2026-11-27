import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import fixture from '../design-system/examples/renderer.v3.json';
import { DSRenderer } from '../src/renderer/DSRenderer';
import { prepareRender, sourceNode } from '../src/renderer/prepare';
import { acceptEditorDocument, importEditorDocument, strictDocument } from '../src/renderer/boundary';
import { generatePrompt, generateRendererPrompt } from '../src/prompt';
import { validateScreen } from '../src/design-system';
const render = (screen: unknown) => renderToStaticMarkup(createElement(DSRenderer, { screen }));

test('ButtonIcon admits only the verified m/secondary/neutral states and the pinned icon', () => {
  const button = { id: 'review-icon', component: 'button-icon',
    variantProps: { size: 'm', variant: 'secondary', colorScheme: 'neutral', state: 'default' },
    editorProps: { icon: 'dots-vertical', labelText: 'Открыть действия' },
  };
  for (const [state, node] of [['default', '109:7632'], ['hover', '109:7644'], ['pressed', '109:7659'], ['disabled', '109:7736']]) {
    const screen = { ...fixture, elements: [{ ...button, variantProps: { ...button.variantProps, state } }] };
    const result = prepareRender(screen);
    assert.ok(result.valid);
    assert.equal(sourceNode(result.value.elements[0]), node);
    const markup = render(screen);
    assert.match(markup, /aria-label="Открыть действия"/);
    assert.match(markup, /data-figma-icon="15:18364"/);
    assert.equal(markup.includes(' disabled=""'), state === 'disabled');
  }
  for (const [group, additions] of [
    ['variantProps', { size: 'l' }], ['variantProps', { variant: 'primary' }],
    ['variantProps', { colorScheme: 'danger' }], ['variantProps', { state: 'active' }],
    ['editorProps', { icon: '<svg/>' }], ['editorProps', { onClick: 'run()' }],
  ] as const) {
    const screen = { ...fixture, elements: [{ ...button, [group]: { ...button[group], ...additions } }] };
    assert.equal(prepareRender(screen).valid, false);
  }
});

test('TextArea maps only the two verified m variants and binds a visible description', () => {
  const textarea = {
    id: 'review-textarea', component: 'textarea',
    variantProps: { size: 'm', state: 'default', placeholder: true, label: true, hint: true },
    editorProps: { labelText: 'Описание', placeholderText: 'Введите текст', hintText: 'Добавьте подробности',
      errorText: 'Уточните описание.', value: 'Первая строка\nВторая строка' },
  };
  for (const [state, node] of [['default', '189:16397'], ['error', '189:16725']]) {
    const screen = { ...fixture, elements: [{ ...textarea, variantProps: { ...textarea.variantProps, state } }] };
    const result = prepareRender(screen);
    assert.ok(result.valid);
    assert.equal(sourceNode(result.value.elements[0]), node);
    const markup = render(screen);
    assert.match(markup, /<label for="([^"]+)">Описание<\/label><textarea id="\1" aria-describedby="([^"]+)"/);
    assert.match(markup, /Первая строка\nВторая строка/);
    assert.equal(markup.includes('aria-invalid="true"'), state === 'error');
    if (state === 'error') assert.match(markup, /Ошибка: Уточните описание./);
  }
  for (const change of [{ size: 'l' }, { state: 'disabled' }, { label: false }, { placeholder: false }, { hint: false }]) {
    const result = prepareRender({ ...fixture, elements: [{ ...textarea, variantProps: { ...textarea.variantProps, ...change } }] });
    assert.equal(result.valid, false);
    if (!result.valid) assert.ok(result.errors.some(error => error.code === 'UNVERIFIED_COMBINATION'));
  }
});

test('29 reviewed Figma variants have schema + renderer coverage and real semantic controls', () => {
  const prepared = prepareRender(fixture); assert.equal(prepared.valid, true); if (!prepared.valid) return;
  assert.equal(prepared.value.elements.length, 29);
  for (const element of prepared.value.elements) assert.ok(sourceNode(element));
  const html = render(fixture);
  assert.equal((html.match(/data-ds-component="button"/g) || []).length, 4);
  assert.equal((html.match(/data-ds-component="input"/g) || []).length, 13);
  assert.equal((html.match(/data-ds-component="checkbox"/g) || []).length, 12);
  assert.match(html, /aria-invalid="true"/); assert.match(html, /aria-checked="mixed"/);
  assert.match(html, /disabled=""/); assert.match(html, /font-family:Manrope/);
  assert.match(html, /#3377ff/); assert.match(html, /#f51743/);
});
test('renderer fails the entire screen closed for unknown or unsupported content and styles', () => {
  for (const bad of [
    { ...fixture, themeOverrides: { primaryColor: '#0055ff' } },
    { ...fixture, style: { color: 'red' } },
    { ...fixture, tokenReferences: ['unknown'] },
    { ...fixture, elements: [{ ...fixture.elements[0], component: 'div' }] },
    { ...fixture, elements: [{ ...fixture.elements[0], variantProps: { ...fixture.elements[0].variantProps, size: 'xl' } }] },
    { ...fixture, elements: [...fixture.elements, { id: 'select', component: 'select', variantProps: { size: 'l', state: 'default', placeholder: true, label: true, foldDirection: 'up' }, editorProps: { labelText: 'A', placeholderText: 'B', optionsText: 'C' } }] },
  ]) { const html = render(bad); assert.match(html, /data-renderer-valid="false"/); assert.doesNotMatch(html, /data-ds-component=/); }
});
test('renderer revalidates each call and does not trust a formerly validated object', () => {
  const screen = structuredClone(fixture); assert.equal(prepareRender(screen).valid, true);
  screen.elements[0].component = 'iframe'; assert.equal(prepareRender(screen).valid, false);
  const label = structuredClone(fixture); label.elements[0].editorProps.label = '<img src=x onerror=alert(1)>';
  assert.match(render(label), /&lt;img/); assert.doesNotMatch(render(label), /<img src="x"/);
});
test('import, edits, prompt and strict export use DS validator; v2 editor overrides are retained', () => {
  const imported = importEditorDocument(JSON.stringify(fixture));
  assert.equal(imported.document.schemaVersion, 3);
  assert.deepEqual(imported.document.tokenReferences, fixture.tokenReferences);
  assert.ok(!imported.warnings.some(w => w.code === 'TOKEN_MANIFEST_OMITTED'));
  assert.equal(strictDocument(imported.document).schemaVersion, 3);
  assert.equal(validateScreen(strictDocument(imported.document)).valid, true);
  const custom = { ...imported.document, themeOverrides: { radiusPx: 8 } };
  assert.equal(acceptEditorDocument(custom).themeOverrides.radiusPx, 8);
  assert.throws(() => strictDocument(custom), /UNVERIFIED_STYLE/);
  assert.throws(() => generateRendererPrompt(custom), /UNVERIFIED_STYLE/);
  const bad = { ...imported.document, elements: [{ ...imported.document.elements[0], style: {} }] };
  assert.throws(() => acceptEditorDocument(bad), /UNKNOWN_FIELD/);
  assert.throws(() => importEditorDocument(JSON.stringify(bad)), /UNKNOWN_FIELD/);
  assert.throws(() => generatePrompt(bad), /UNKNOWN_FIELD/);
  assert.match(generateRendererPrompt(imported.document), /Screen Schema v3/);
});
test('original checkbox SVG assets are nonempty and keep 20x20 root geometry', () => {
  for (let i = 0; i < 8; i++) {
    const svg = readFileSync(`public/ds-renderer/checkbox-${i}.svg`, 'utf8');
    assert.match(svg.slice(0, svg.indexOf('>') + 1), /width="20"/); assert.match(svg.slice(0, svg.indexOf('>') + 1), /height="20"/);
    assert.ok(svg.length > 100);
  }
});
