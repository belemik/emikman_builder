import type { CapabilityAction, CapabilityDeclaration, DefinitionDescriptor, DefinitionKind,
  GoalTuple, ProjectDefinitionRegistryV1 } from './envelope.types';

export const MODEL_ID = 'zarya.project-envelope';
export const MODEL_VERSION = '1.0.0';
export const REGISTRY_ID = 'zarya.project-definitions';
export const REGISTRY_VERSION = '1.1.0-draft.1';
export const BASE_DEFINITION_VERSION = '1.0.0';
export const CREATIVE_DEFINITION_VERSION = '1.0.0-draft.1';
export const CAPABILITY_ACTIONS: readonly CapabilityAction[] = Object.freeze([
  'preview', 'render', 'validate', 'export', 'apply', 'analyze', 'generate', 'edit',
]);
const projectCapabilities: readonly CapabilityDeclaration[] = Object.freeze(
  CAPABILITY_ACTIONS.map(action => Object.freeze({ action, scope: 'project' as const,
    availability: 'unsupported' as const, evidenceRef: null,
    reason: 'P01 describes metadata only; no Project execution capability is implemented.',
  })),
);
const source = 'https://github.com/belemik/emikman_builder/blob/3d5a64f1c6cfb5b5582d06d581ca612d37bd2bc4/';
const legacyCapabilities: readonly CapabilityDeclaration[] = Object.freeze([
  ['preview', 'src/main.tsx', 'Existing laboratory editor preview; approximate subset only.'],
  ['render', 'src/renderer/prepare.ts', 'Existing strict WDeaf renderer; verified subset only, not CR3.'],
  ['validate', 'src/design-system/validator.ts', 'DS Contract 1.3.0 structural checks, not visual or universal validation.'],
  ['export', 'src/renderer/boundary.ts', 'Existing laboratory JSON export gates, not app/code/native export.'],
].map(([action, path, reason]) => Object.freeze({
  action: action as CapabilityAction, scope: 'legacy-laboratory' as const,
  availability: 'partial' as const, evidenceRef: source + path, reason,
})));
const noCapabilities: readonly CapabilityDeclaration[] = Object.freeze([]);
function descriptor(kind: DefinitionKind, name: string, label: string, creative = false,
  role: DefinitionDescriptor['role'] = null): DefinitionDescriptor {
  return Object.freeze({ kind, id: `${kind}:${name}`,
    definitionVersion: creative ? CREATIVE_DEFINITION_VERSION : BASE_DEFINITION_VERSION,
    label, role, placeholder: kind === 'format' && name !== 'wdeaf-screen-v3',
    capabilities: kind !== 'format' ? noCapabilities : name === 'wdeaf-screen-v3'
      ? Object.freeze([...projectCapabilities, ...legacyCapabilities]) : projectCapabilities,
  });
}
const products = Object.freeze([
  descriptor('product', 'web-application', 'Web Application'),
  descriptor('product', 'landing-page', 'Landing Page'),
  descriptor('product', 'mobile-app', 'Mobile App'),
  descriptor('product', 'presentation', 'Presentation'),
  descriptor('product', 'interactive-terminal', 'Interactive Terminal'),
  descriptor('product', 'image-creative', 'Image Creative', true),
  descriptor('product', 'video-animation', 'Video / Animation', true),
  descriptor('product', 'print-layout', 'Print Layout', true),
  descriptor('product', 'marketplace-card', 'Marketplace Card', true),
]);
const targets = Object.freeze([
  descriptor('target', 'web-browser', 'Web Browser'),
  descriptor('target', 'android', 'Android'),
  descriptor('target', 'ios', 'iOS'),
  descriptor('target', 'unspecified', 'Unspecified'),
  descriptor('target', 'terminal-runtime-unresolved', 'Terminal Runtime Unresolved'),
  descriptor('target', 'digital-canvas', 'Digital Canvas', true),
  descriptor('target', 'print-output', 'Print Output', true),
  descriptor('target', 'marketplace', 'Marketplace', true),
]);
const formats = Object.freeze([
  descriptor('format', 'wdeaf-screen-v3', 'WDeaf Screen v3', false, 'goal'),
  descriptor('format', 'web-product-placeholder', 'Web Product (placeholder)', false, 'goal'),
  descriptor('format', 'android-project-placeholder', 'Android Project (placeholder)', false, 'goal'),
  descriptor('format', 'ios-project-placeholder', 'iOS Project (placeholder)', false, 'goal'),
  descriptor('format', 'presentation-deck-placeholder', 'Presentation Deck (placeholder)', false, 'goal'),
  descriptor('format', 'terminal-package-placeholder', 'Terminal Package (placeholder)', false, 'goal'),
  descriptor('format', 'raster-image-placeholder', 'Raster Image (placeholder)', true, 'goal'),
  descriptor('format', 'vector-layout-placeholder', 'Vector Layout (placeholder)', true, 'goal'),
  descriptor('format', 'video-animation-placeholder', 'Video / Animation (placeholder)', true, 'goal'),
  descriptor('format', 'print-layout-placeholder', 'Print Layout (placeholder)', true, 'goal'),
  descriptor('format', 'analysis-report-placeholder', 'Analysis Report (placeholder)', true, 'derived-report'),
  descriptor('format', 'knowledge-reference-placeholder', 'Knowledge Reference (placeholder)', true, 'reference'),
]);
const tuples: readonly (readonly [string, string, string])[] = [
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
const goalTuples: readonly GoalTuple[] = Object.freeze(tuples.map(([product, target, format]) =>
  Object.freeze({ productId: `product:${product}`, targetId: `target:${target}`, formatId: `format:${format}` })));
/** Closed, immutable approved metadata snapshot. No imports/providers or registration API. */
export const PROJECT_DEFINITIONS: ProjectDefinitionRegistryV1 = Object.freeze({
  id: REGISTRY_ID, version: REGISTRY_VERSION, products, targets, formats, goalTuples,
});
