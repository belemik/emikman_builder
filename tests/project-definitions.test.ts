import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { CAPABILITY_ACTIONS, MODEL_ID, MODEL_VERSION, PROJECT_DEFINITIONS as registry,
  REGISTRY_ID, REGISTRY_VERSION } from '../src/projects/definitions';

const expectedTuples = [
  ['web-application', 'web-browser', 'wdeaf-screen-v3'],
  ['web-application', 'web-browser', 'web-product-placeholder'],
  ['landing-page', 'web-browser', 'wdeaf-screen-v3'],
  ['landing-page', 'web-browser', 'web-product-placeholder'],
  ['mobile-app', 'android', 'android-project-placeholder'],
  ['mobile-app', 'ios', 'ios-project-placeholder'],
  ['presentation', 'unspecified', 'presentation-deck-placeholder'],
  ['interactive-terminal', 'terminal-runtime-unresolved', 'terminal-package-placeholder'],
  ['image-creative', 'digital-canvas', 'raster-image-placeholder'],
  ['image-creative', 'digital-canvas', 'vector-layout-placeholder'],
  ['video-animation', 'digital-canvas', 'video-animation-placeholder'],
  ['print-layout', 'print-output', 'print-layout-placeholder'],
  ['marketplace-card', 'marketplace', 'raster-image-placeholder'],
];
test('P01 exact model and registry versions remain independent of Screen v3', () => {
  assert.equal(MODEL_ID, 'zarya.project-envelope'); assert.equal(MODEL_VERSION, '1.0.0');
  assert.equal(REGISTRY_ID, 'zarya.project-definitions'); assert.equal(REGISTRY_VERSION, '1.1.0-draft.1');
  assert.equal(registry.id, REGISTRY_ID); assert.equal(registry.version, REGISTRY_VERSION);
});
test('P01 approved descriptor identities, counts and mixed versions are exact', () => {
  const productNames = ['web-application', 'landing-page', 'mobile-app', 'presentation', 'interactive-terminal', 'image-creative', 'video-animation', 'print-layout', 'marketplace-card'];
  const targetNames = ['web-browser', 'android', 'ios', 'unspecified', 'terminal-runtime-unresolved', 'digital-canvas', 'print-output', 'marketplace'];
  const formatNames = ['wdeaf-screen-v3', 'web-product-placeholder', 'android-project-placeholder', 'ios-project-placeholder', 'presentation-deck-placeholder', 'terminal-package-placeholder', 'raster-image-placeholder', 'vector-layout-placeholder', 'video-animation-placeholder', 'print-layout-placeholder', 'analysis-report-placeholder', 'knowledge-reference-placeholder'];
  for (const [list, names, kind, baseCount] of [
    [registry.products, productNames, 'product', 5], [registry.targets, targetNames, 'target', 5],
    [registry.formats, formatNames, 'format', 6],
  ] as const) {
    assert.deepEqual(list.map(d => d.id), names.map(n => `${kind}:${n}`));
    assert.equal(new Set(list.map(d => d.id)).size, list.length);
    list.forEach((d, i) => { assert.equal(d.kind, kind); assert.equal(d.definitionVersion, i < baseCount ? '1.0.0' : '1.0.0-draft.1'); });
  }
});
test('P01 goal tuples are the thirteen approved triples, not a Cartesian product', () => {
  assert.deepEqual(registry.goalTuples, expectedTuples.map(([p, t, f]) => ({ productId: `product:${p}`, targetId: `target:${t}`, formatId: `format:${f}` })));
  for (const tuple of registry.goalTuples) {
    assert.ok(registry.products.some(d => d.id === tuple.productId));
    assert.ok(registry.targets.some(d => d.id === tuple.targetId));
    assert.ok(registry.formats.some(d => d.id === tuple.formatId && d.role === 'goal'));
  }
});
test('P01 derived reports and knowledge references are descriptors, not goal formats', () => {
  assert.equal(registry.formats.find(d => d.id === 'format:analysis-report-placeholder')?.role, 'derived-report');
  assert.equal(registry.formats.find(d => d.id === 'format:knowledge-reference-placeholder')?.role, 'reference');
  assert.equal(registry.goalTuples.some(t => /analysis-report|knowledge-reference/.test(t.formatId)), false);
  assert.equal(registry.formats.filter(d => !d.placeholder).length, 1);
});
test('P01 every project action is unsupported, independently from laboratory evidence', () => {
  assert.deepEqual(CAPABILITY_ACTIONS, ['preview', 'render', 'validate', 'export', 'apply', 'analyze', 'generate', 'edit']);
  for (const d of registry.formats) {
    const project = d.capabilities.filter(c => c.scope === 'project');
    assert.deepEqual(project.map(c => c.action), CAPABILITY_ACTIONS);
    assert.ok(project.every(c => c.availability === 'unsupported' && c.evidenceRef === null && c.reason.length > 0));
    const legacy = d.capabilities.filter(c => c.scope === 'legacy-laboratory');
    if (d.id === 'format:wdeaf-screen-v3') {
      assert.deepEqual(legacy.map(c => c.action), ['preview', 'render', 'validate', 'export']);
      assert.ok(legacy.every(c => c.availability === 'partial' && c.evidenceRef?.includes('/3d5a64f1c6cfb5b5582d06d581ca612d37bd2bc4/')));
    } else assert.equal(legacy.length, 0);
  }
});
test('P01 registry, nested declarations and tuples are immutable data', () => {
  const visit = (value: unknown) => {
    assert.notEqual(typeof value, 'function');
    if (value !== null && typeof value === 'object') {
      assert.equal(Object.isFrozen(value), true);
      for (const child of Object.values(value)) visit(child);
    }
  };
  visit(registry); visit(CAPABILITY_ACTIONS);
  assert.equal(Reflect.set(registry.formats[0], 'placeholder', true), false);
  assert.equal(Reflect.set(registry.goalTuples[0], 'formatId', 'format:invented'), false);
});
test('P01 modules have no execution/storage/provider dependencies or app integration', () => {
  for (const file of ['envelope.types', 'definitions', 'compatibility']) {
    const text = readFileSync(new URL(`../src/projects/${file}.ts`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /\b(?:fetch|eval|setTimeout|setInterval|require)\s*\(|\bimport\s*\(|JSON\.parse|\b(?:localStorage|indexedDB|XMLHttpRequest|process|window)\b/);
    assert.doesNotMatch(text, /from ['"](?:node:|https?:|\.\.\/)/);
  }
  for (const file of ['../src/main.tsx', '../src/application/ApplicationShell.tsx']) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), 'utf8'), /projects\/(?:definitions|compatibility|envelope)/);
  }
});
