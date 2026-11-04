import { migrateJSON } from '../design-system';
import { emptyDocument, type CanvasDocument } from '../canvas/model';
export const STORAGE_KEY = 'wdeaf.canvas.v1';
export function parseDocument(raw: string): CanvasDocument {
  const result = migrateJSON(raw);
  if (!result.valid) throw new Error(result.errors.map(e => `${e.code} ${e.path}: ${e.message}`).join('\n'));
  return result.value;
}
export function loadDocument(key = STORAGE_KEY, migrateLegacy = false): { document: CanvasDocument; error?: string; warning?: string; recoveryRaw?: string } {
  let raw: string | null = null;
  try { raw = (localStorage.getItem(key) ?? (migrateLegacy ? localStorage.getItem(STORAGE_KEY) : null)); return { document: raw ? parseDocument(raw) : emptyDocument(), warning: raw ? migrationWarning(raw) : undefined }; }
  catch (error) { return { document: emptyDocument(), recoveryRaw: raw ?? undefined, error: `Сохранённый проект не загружен. Автосохранение приостановлено; исходный JSON сохранён без изменений. ${error instanceof Error ? error.message : 'Ошибка чтения.'}` }; }
}
export function migrationWarning(raw: string): string | undefined {
  try { const data = JSON.parse(raw); if (data.schemaVersion === 1 && data.theme?.radius > 32) return 'Документ v1 восстановлен. Радиус ограничен 32 px по правилам Sprint 02; исходные данные не изменены в файле импорта, а прежнее локальное сохранение резервируется отдельно.'; } catch { /* parseDocument reports malformed JSON. */ }
}
export function saveDocument(document: CanvasDocument, key = STORAGE_KEY) {
  parseDocument(JSON.stringify(document));
  const old = localStorage.getItem(key);
  let isLegacy = false;
  try { isLegacy = old !== null && [1, 2].includes(JSON.parse(old).schemaVersion); } catch { /* User may explicitly resume after a damaged save. */ }
  if (old && isLegacy && localStorage.getItem(key + '.pre-v3-backup') === null) localStorage.setItem(key + '.pre-v3-backup', old);
  localStorage.setItem(key, JSON.stringify(document));
}
export function exportDocument(document: CanvasDocument | import('../design-system').ScreenSchema) {
  parseDocument(JSON.stringify(document));
  exportRawDocument(JSON.stringify(document, null, 2));
}
export function exportRawDocument(raw: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const link = window.document.createElement('a'); link.href = url; link.download = 'wdeaf-canvas.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
