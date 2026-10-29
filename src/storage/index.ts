import { definition, type PropDefinition } from '../registry';
import { emptyDocument, type CanvasDocument } from '../canvas/model';
export const STORAGE_KEY = 'wdeaf.canvas.v1';
function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ожидался JSON-объект.');
}
function keys(value: Record<string, unknown>, expected: string[]) {
  if (Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) throw new Error(`Неверные поля: ожидаются ${expected.join(', ')}.`);
}
function props(value: unknown, schema: Record<string, PropDefinition>) {
  object(value); keys(value, Object.keys(schema));
  for (const [key, prop] of Object.entries(schema)) {
    const current = value[key];
    if (prop.type === 'enum' ? typeof current !== 'string' || !prop.values.includes(current) : prop.type === 'boolean' ? typeof current !== 'boolean' : typeof current !== 'string' || current.length > 2000) throw new Error(`Недопустимое значение свойства ${key}.`);
  }
}
export function parseDocument(raw: string): CanvasDocument {
  if (new TextEncoder().encode(raw).byteLength > 2_000_000) throw new Error('Документ превышает 2 МБ.');
  const value: unknown = JSON.parse(raw);
  object(value);
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) throw new Error('Поддерживаются schemaVersion: 1 и 2.');
  keys(value, ['schemaVersion', 'platform', 'elements', value.schemaVersion === 1 ? 'theme' : 'themeOverrides']);
  if (value.platform !== 'web') throw new Error('Поддерживается только платформа web.');
  const legacy = value.schemaVersion === 1;
  const theme = legacy ? value.theme : value.themeOverrides;
  object(theme);
  if (legacy) keys(theme, ['primaryColor', 'radius', 'fontFamily']);
  else if (Object.keys(theme).some(key => !['primaryColor', 'radiusPx', 'fontFamily'].includes(key))) throw new Error('Неизвестное поле themeOverrides.');
  if ('primaryColor' in theme && (typeof theme.primaryColor !== 'string' || !/^#[\da-f]{6}$/i.test(theme.primaryColor))) throw new Error('Цвет должен быть в формате #0055ff.');
  const radiusKey = legacy ? 'radius' : 'radiusPx';
  if (radiusKey in theme && (typeof theme[radiusKey] !== 'number' || !Number.isFinite(theme[radiusKey]) || Number(theme[radiusKey]) < 0 || Number(theme[radiusKey]) > (legacy ? 48 : 32))) throw new Error(legacy ? 'Радиус v1 должен быть от 0 до 48 px.' : 'Радиус должен быть от 0 до 32 px.');
  if ('fontFamily' in theme && (typeof theme.fontFamily !== 'string' || theme.fontFamily.length > 100 || !theme.fontFamily.trim())) throw new Error('Укажите название шрифта (до 100 символов).');
  if (!Array.isArray(value.elements) || value.elements.length > 500) throw new Error('Ожидается массив до 500 элементов.');
  const ids = new Set<string>();
  for (const element of value.elements) {
    object(element); keys(element, ['id', 'component', 'variantProps', 'editorProps']);
    if (typeof element.id !== 'string' || !element.id || element.id.length > 100 || ids.has(element.id)) throw new Error('Идентификаторы элементов должны быть уникальными непустыми строками.');
    ids.add(element.id);
    if (typeof element.component !== 'string') throw new Error('Не указан компонент.');
    const entry = definition(element.component);
    props(element.variantProps, entry.variantProps); props(element.editorProps, entry.editorProps);
  }
  if (legacy) return { schemaVersion: 2, platform: 'web', elements: value.elements as unknown as CanvasDocument['elements'], themeOverrides: { primaryColor: theme.primaryColor as string, radiusPx: Math.min(Number(theme.radius), 32), fontFamily: theme.fontFamily as string } };
  return value as unknown as CanvasDocument;
}
export function loadDocument(key = STORAGE_KEY, migrateLegacy = false): { document: CanvasDocument; error?: string; warning?: string } {
  try { const raw = (localStorage.getItem(key) ?? (migrateLegacy ? localStorage.getItem(STORAGE_KEY) : null)); return { document: raw ? parseDocument(raw) : emptyDocument(), warning: raw ? migrationWarning(raw) : undefined }; }
  catch { return { document: emptyDocument(), error: 'Сохранённый документ недоступен или повреждён. Автосохранение приостановлено, чтобы не затереть данные. Экспортируйте нужное перед продолжением.' }; }
}
export function migrationWarning(raw: string): string | undefined {
  try { const data = JSON.parse(raw); if (data.schemaVersion === 1 && data.theme?.radius > 32) return 'Документ v1 восстановлен. Радиус ограничен 32 px по правилам Sprint 02; исходные данные не изменены в файле импорта, а прежнее локальное сохранение резервируется отдельно.'; } catch { /* parseDocument reports malformed JSON. */ }
}
export function saveDocument(document: CanvasDocument, key = STORAGE_KEY) {
  const old = localStorage.getItem(key);
  let isLegacy = false;
  try { isLegacy = old !== null && JSON.parse(old).schemaVersion === 1; } catch { /* User may explicitly resume after a damaged save. */ }
  if (old && isLegacy && localStorage.getItem(key + '.sprint01-backup') === null) localStorage.setItem(key + '.sprint01-backup', old);
  localStorage.setItem(key, JSON.stringify(document));
}
export function exportDocument(document: CanvasDocument) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }));
  const link = window.document.createElement('a'); link.href = url; link.download = 'wdeaf-canvas.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
