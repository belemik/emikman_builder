import type { CanvasDocument } from '../canvas/model';
import { migrateScreen, migrateJSON, type ScreenDraft } from '../design-system';
import { prepareRender } from './prepare';
function unwrap<T>(result: { valid: true; value: T } | { valid: false; errors: { code: string; path: string; message: string }[] }): T {
  if (!result.valid) throw new Error(result.errors.map(e => `${e.code} ${e.path}: ${e.message}`).join('\n'));
  return result.value;
}
export function screenFromCanvas(document: unknown): ScreenDraft { return unwrap(migrateScreen(document)); }
export function acceptEditorDocument(document: unknown): CanvasDocument { return screenFromCanvas(document); }
export function importEditorDocument(raw: string) {
  const migration = migrateJSON(raw);
  return { document: unwrap(migration), warnings: migration.warnings };
}
export function strictDocument(document: unknown) { return unwrap(prepareRender(screenFromCanvas(document))); }
