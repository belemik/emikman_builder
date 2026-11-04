import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import example from '../design-system/examples/screen.v3.json';
import { catalog, tokens } from '../src/design-system/catalog.generated';
import { registry } from '../src/registry';
import { createElement } from '../src/canvas/model';
import { libraryNode } from '../src/renderer/library-capabilities';
import { verifiedTokens } from '../src/tokens';
import librarySeed from '../tokens.sprint05.seed.json';
import rendererSeed from '../tokens.renderer.seed.json';
import { parseDocument } from '../src/storage';
import { validateComponent, validateToken, validateScreen, parseScreen, migrateScreen, migrateJSON, toCanvasV2 } from '../src/design-system';
const screen = () => structuredClone(example);
function valid<T>(r: { valid: true; value: T } | { valid: false }): T { assert.equal(r.valid, true, JSON.stringify(r)); if (!r.valid) throw new Error('Invalid'); return r.value; }

test('contract catalog exactly matches current Canvas registry and all verified tokens', () => {
  assert.deepEqual(catalog, registry); assert.deepEqual(tokens, { ...verifiedTokens, ...rendererSeed.tokens, ...librarySeed.tokens });
  assert.ok(Object.isFrozen(catalog)); assert.ok(Object.isFrozen(catalog[0].variantProps.size.values)); assert.ok(Object.isFrozen(tokens['surface/primary/default']));
  assert.equal(catalog.length, 15); assert.equal(Object.keys(tokens).length, 57);
  valid(validateScreen(screen()));
});
test('all reviewed prop values pass component metadata validation', () => {
  for (const c of catalog.filter(c=>['button','input','select','checkbox','table'].includes(c.id))) {
    const baseline = example.elements.find(e => e.component === c.id)!;
    valid(validateComponent(baseline));
    for (const [key, prop] of Object.entries(c.variantProps)) {
      for (const value of prop.type === 'enum' ? prop.values : [false, true]) {
        valid(validateComponent({ ...baseline, variantProps: { ...baseline.variantProps, [key]: value } }));
      }
    }
  }
});
test('unknown components, variants, props, styles, children and HTML extensions fail closed', () => {
  const base = example.elements[0];
  for (const element of [
    { ...base, component: 'avatar' }, { ...base, component: 'div' },
    { ...base, variantProps: { ...base.variantProps, size: 'xxl' } },
    { ...base, variantProps: { ...base.variantProps, style: { color: 'red' } } },
    { ...base, editorProps: { label: 'OK', html: '<img>' } },
    { ...base, style: {} }, { ...base, className: 'custom' }, { ...base, children: [] },
    { ...example.elements[4], variantProps: { 'cell-type': 'cell-text' } },
  ]) assert.equal(validateComponent(element).valid, false);
  assert.equal(validateScreen({ ...screen(), css: 'body{}' }).valid, false);
  assert.equal(validateScreen({ ...screen(), platform: 'ios' }).valid, false);
  assert.equal(validateScreen({ ...screen(), schemaVersion: 99 }).valid, false);
});
test('tokens require exact reviewed names, types and values; raw CSS is never a reference', () => {
  for (const [name, t] of Object.entries(tokens)) valid(validateToken(name, { type: t.type, value: t.value }));
  for (const name of ['color/brand/new', '#0055ff', 'constructor', '__proto__', { value: '#0055ff' }, null]) assert.equal(validateToken(name).valid, false);
  assert.equal(validateToken('surface/primary/default', { value: '#ff0000' }).valid, false);
  assert.equal(validateToken('surface/primary/default', { type: 'dimension' }).valid, false);
  assert.equal(validateScreen({ ...screen(), tokenReferences: ['spacing/radius/radius-8'] }).valid, false);
  assert.equal(validateScreen({ ...screen(), tokenReferences: ['text/default/body', 'text/default/body'] }).valid, false);
});
test('strict DS and legacy compatibility are different; overrides are never silently erased', () => {
  for (const overrides of [{ radiusPx: 4 }, { primaryColor: '#0055ff' }, { fontFamily: 'Manrope' }]) {
    const draft = { ...screen(), themeOverrides: overrides };
    assert.equal(validateScreen(draft).valid, false);
    const r = validateScreen(draft, { mode: 'compatible' }); valid(r);
    assert.ok(r.warnings.some(e => e.code === 'UNVERIFIED_STYLE'));
    assert.deepEqual(valid(r).themeOverrides, overrides);
  }
  const mixed = screen(); mixed.elements[3].variantProps = { size: 's', state: 'default', checked: false, indeterminate: true } as typeof mixed.elements[3]['variantProps'];
  assert.equal(validateScreen(mixed).valid, false);
  assert.ok(validateScreen(mixed, { mode: 'compatible' }).warnings.some(e => e.code === 'UNVERIFIED_COMBINATION'));
});
test('v1/v2 migration preserves IDs, content, order and styles; explicit bridge works with existing importer', () => {
  const v2 = { schemaVersion: 2, platform: 'web', elements: screen().elements, themeOverrides: { primaryColor: '#aabbcc', radiusPx: 14, fontFamily: 'Arial' } };
  const original = structuredClone(v2), migrated = valid(migrateScreen(v2));
  assert.deepEqual(v2, original); assert.deepEqual(migrated.elements, v2.elements);
  assert.deepEqual(valid(toCanvasV2(migrated)), v2);
  assert.deepEqual(parseDocument(JSON.stringify(valid(toCanvasV2(migrated)))), migrated);
  assert.deepEqual(valid(migrateScreen(migrated)), migrated);
  const { themeOverrides, ...rest } = v2;
  const v1 = { ...rest, schemaVersion: 1, theme: { primaryColor: themeOverrides.primaryColor, radius: 48, fontFamily: themeOverrides.fontFamily } };
  const result = migrateScreen(v1); assert.equal(valid(result).themeOverrides.radiusPx, 32);
  assert.equal(v1.theme.radius, 48); assert.ok(result.warnings.some(e => e.code === 'RADIUS_CLAMPED'));
  assert.deepEqual(parseDocument(JSON.stringify(v1)), valid(result));
  assert.equal(toCanvasV2(screen()).valid, false);
});
test('malformed structures, duplicate IDs, invalid overrides and oversize JSON fail without mutation', () => {
  for (const input of [null, [], {}, { ...screen(), elements: [example.elements[0], example.elements[0]] }, { ...screen(), elements: Array(501).fill(example.elements[0]) }, { ...screen(), themeOverrides: { radiusPx: NaN } }, { ...screen(), themeOverrides: { fontFamily: '' } }, { ...screen(), elements: [{ ...example.elements[0], editorProps: { label: 'x'.repeat(2001) } }] }]) assert.equal(validateScreen(input).valid, false);
  assert.equal(parseScreen('{').valid, false); assert.equal(migrateJSON('{').valid, false);
  assert.equal(parseScreen('я'.repeat(1_000_001)).valid, false);
  assert.equal(migrateJSON('я'.repeat(1_000_001)).valid, false);
  assert.equal(migrateScreen({ ...screen(), schemaVersion: '2' }).valid, false);
  assert.equal(migrateScreen({ ...screen(), schemaVersion: { toString: null, valueOf: null } }).valid, false);
  const unknown = JSON.parse(JSON.stringify(screen()).replace('"themeOverrides":{}', '"themeOverrides":{"__proto__":{}}'));
  assert.equal(validateScreen(unknown).valid, false);
  const input = screen(), output = valid(validateScreen(input)); output.elements[0].id = 'changed';
  assert.notEqual(input.elements[0].id, output.elements[0].id);
});
test('CLI returns nonzero for invalid files; compatibility must be explicitly requested', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wdeaf-contract-'));
  const run = (args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/ds-validate.ts', ...args], { encoding: 'utf8' });
  try {
    const path = join(dir, 'project.json'); writeFileSync(path, JSON.stringify(screen()));
    assert.equal(run([path]).status, 0);
    writeFileSync(path, JSON.stringify({ ...screen(), tokenReferences: ['unknown'] })); assert.equal(run([path]).status, 1);
    writeFileSync(path, JSON.stringify({ ...screen(), themeOverrides: { radiusPx: 8 } }));
    assert.equal(run([path]).status, 1); assert.equal(run(['--compatible', path]).status, 0);
    assert.equal(run(['--unknown']).status, 2);
    assert.equal(run([join(dir, 'missing.json')]).status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('prototype component names return structured errors at roots and nested slots', () => {
  for (const name of ['__proto__', 'constructor', 'toString']) {
    const bad = { ...example.elements[0], component: name, slots: { [name]: [] } };
    assert.equal(libraryNode(bad as never), null);
    const before = JSON.stringify(bad);
    const component = validateComponent(bad);
    assert.equal(component.valid, false);
    assert.ok(component.errors.some(e => e.code === 'COMPONENT'));
    assert.equal(validateScreen({ ...screen(), elements: [bad] }).valid, false);
    const input = { ...example.elements[1], slots: { hint: [bad] } };
    const nested = validateComponent(input);
    assert.equal(nested.valid, false);
    assert.ok(nested.errors.some(e => e.code === 'COMPONENT' && e.path.includes('/slots/hint/0')));
    assert.equal(migrateJSON(JSON.stringify({ ...screen(), elements: [bad] })).valid, false);
    assert.equal(JSON.stringify(bad), before);
  }
});
test('v2 export refuses v3-only content without mutating or dropping data', () => {
  const base = { ...screen(), tokenReferences: [] };
  for (const document of [
    screen(),
    { ...base, elements: [createElement('chip')] },
    { ...base, elements: [{ ...base.elements[0], slots: {} }] },
    { ...base, elements: [{ ...base.elements[2], interactionState: { selectedValue: null } }] },
  ]) {
    const before = JSON.stringify(document), result = toCanvasV2(document);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'V2_UNSUPPORTED'));
    assert.equal(JSON.stringify(document), before);
  }
});
