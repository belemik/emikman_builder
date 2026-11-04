import { fields, isObject, validateOverrides, validateScreen } from './validator';
import { MAX_BYTES, type Issue, type Result, type ScreenDraft, type CanvasV2 } from './schema';

/** Never mutate the source; never erase editor styles to make a project pass strict validation. */
export function migrateScreen(input: unknown): Result<ScreenDraft> {
  if (isObject(input) && input.schemaVersion === 3) return validateScreen(input, { mode: 'compatible' });
  const errors: Issue[] = [], warnings: Issue[] = [];
  if (!isObject(input) || typeof input.schemaVersion !== 'number' || ![1, 2].includes(input.schemaVersion)) return { valid: false, errors: [{ code: 'VERSION', path: '/schemaVersion', message: 'Supported versions: 1, 2, 3.' }], warnings };
  const legacy = input.schemaVersion === 1;
  if (!fields(input, ['schemaVersion', 'platform', 'elements', legacy ? 'theme' : 'themeOverrides'], '', errors)) return { valid: false, errors, warnings };
  validateOverrides(input[legacy ? 'theme' : 'themeOverrides'], legacy ? '/theme' : '/themeOverrides', errors, legacy);
  if (errors.length) return { valid: false, errors, warnings };
  const theme = input.theme as { primaryColor: string; radius: number; fontFamily: string };
  if (legacy && theme.radius > 32) warnings.push({ code: 'RADIUS_CLAMPED', path: '/theme/radius', message: `Legacy radius ${theme.radius} becomes 32, matching the existing Canvas importer. Keep the original JSON for lossless recovery.` });
  const result = validateScreen({ schemaVersion: 3, platform: input.platform, elements: input.elements, themeOverrides: legacy ? { primaryColor: theme.primaryColor, radiusPx: Math.min(theme.radius, 32), fontFamily: theme.fontFamily } : input.themeOverrides, tokenReferences: [] }, { mode: 'compatible' });
  result.warnings.unshift(...warnings);
  return result;
}
export function migrateJSON(raw: string): Result<ScreenDraft> {
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) return { valid: false, errors: [{ code: 'SIZE', path: '', message: 'Document exceeds 2 MB.' }], warnings: [] };
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return { valid: false, errors: [{ code: 'JSON', path: '', message: 'Invalid JSON.' }], warnings: [] }; }
  return migrateScreen(input);
}
/** Legacy export only for flat Sprint 02 documents. No silent loss of v3 data. */
export function toCanvasV2(input: unknown): Result<CanvasV2> {
  const r = validateScreen(input, { mode: 'compatible' });
  if (!r.valid) return r;
  const { tokenReferences, ...screen } = r.value;
  const errors: Issue[] = [];
  if (tokenReferences.length) errors.push({ code: 'V2_UNSUPPORTED', path: '/tokenReferences', message: 'Canvas v2 cannot preserve tokenReferences. Export v3 instead.' });
  screen.elements.forEach((element, index) => {
    if (!['button', 'input', 'select', 'checkbox', 'table'].includes(element.component) || Object.hasOwn(element, 'slots') || Object.hasOwn(element, 'interactionState')) errors.push({ code: 'V2_UNSUPPORTED', path: `/elements/${index}`, message: 'Canvas v2 supports only flat Sprint 02 elements without slots or interactionState. Export v3 instead.' });
  });
  if (errors.length) return { valid: false, errors, warnings: r.warnings };
  return { valid: true, value: { ...screen, schemaVersion: 2 }, warnings: r.warnings };
}
