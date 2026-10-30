import type { CanvasDocument } from '../canvas/model';
import { migrateScreen, migrateJSON, toCanvasV2, type ScreenDraft } from '../design-system';
import { prepareRender } from './prepare';
function unwrap<T>(result: { valid: true; value: T } | { valid: false; errors: { code: string; path: string; message: string }[] }): T {
  if (!result.valid) throw new Error(result.errors.map(e => `${e.code} ${e.path}: ${e.message}`).join('\n'));
  return result.value;
}
export function screenFromCanvas(document: unknown): ScreenDraft { return unwrap(migrateScreen(document)); }
export function acceptEditorDocument(document: unknown): CanvasDocument { return unwrap(toCanvasV2(screenFromCanvas(document))); }
export function importEditorDocument(raw: string) {
  const migration = migrateJSON(raw), screen = unwrap(migration), bridge = toCanvasV2(screen);
  return { document: unwrap(bridge), warnings: [...migration.warnings, ...bridge.warnings] };
}
export function strictDocument(document: unknown) { return unwrap(prepareRender(screenFromCanvas(document))); }
