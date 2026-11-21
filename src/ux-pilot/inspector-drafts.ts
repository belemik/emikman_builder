import { locales, type Locale, type MenuItem, type PilotDocument } from './model';

export const INSPECTOR_EXIT_WARNING = 'Есть несохранённые изменения в Inspector. Черновики находятся только в памяти этой вкладки.';

export type InspectorValue = { text: string; target?: MenuItem['target'] };
export type InspectorDrafts = ReadonlyMap<string, Partial<InspectorValue>>;
export const emptyInspectorDrafts: InspectorDrafts = new Map();

function keyFor(id: string, locale: Locale) {
  return id + ':' + locale;
}

export function readInspectorDraft(drafts: InspectorDrafts, id: string, locale: Locale) {
  return drafts.get(keyFor(id, locale));
}

export function getDirtyInspectorDrafts(drafts: InspectorDrafts, document: PilotDocument): InspectorDrafts {
  if (drafts.size === 0) return drafts;
  const dirty = new Map<string, Partial<InspectorValue>>();
  function compare(id: string, locale: Locale, committed: InspectorValue) {
    const draft = readInspectorDraft(drafts, id, locale);
    if (!draft) return;

    const changes: Partial<InspectorValue> = {};
    if (draft.text !== undefined && draft.text !== committed.text) changes.text = draft.text;
    if (draft.target !== undefined && draft.target !== committed.target) changes.target = draft.target;
    if (Object.keys(changes).length) dirty.set(keyFor(id, locale), changes);
  }
  for (const locale of locales) {
    compare('hero', locale, { text: document.hero[locale] });
    for (const item of document.menu) compare(item.id, locale, { text: item.label[locale], target: item.target });
  }
  return dirty;
}

export function editInspectorDraft(drafts: InspectorDrafts, id: string, locale: Locale, edit: Partial<InspectorValue>, committed: InspectorValue): InspectorDrafts {
  const key = keyFor(id, locale);
  const next = new Map(drafts);
  const draft = { ...drafts.get(key) };
  if (edit.text !== undefined) {
    if (edit.text === committed.text) delete draft.text;
    else draft.text = edit.text;
  }
  if (edit.target !== undefined) {
    if (edit.target === committed.target) delete draft.target;
    else draft.target = edit.target;
  }
  if (Object.keys(draft).length) next.set(key, draft);
  else next.delete(key);
  return next;
}

export function discardInspectorDraft(drafts: InspectorDrafts, id: string, locale: Locale): InspectorDrafts {
  const key = keyFor(id, locale);
  if (!drafts.has(key)) return drafts;
  const next = new Map(drafts);
  next.delete(key);
  return next;
}

export function hasLayerDrafts(drafts: InspectorDrafts, id: string) {
  return locales.some(locale => drafts.has(keyFor(id, locale)));
}

export function discardLayerDrafts(drafts: InspectorDrafts, ids: readonly string[]) {
  if (ids.length === 0) return drafts;
  const next = new Map(drafts);
  for (const id of ids) for (const locale of locales) next.delete(keyFor(id, locale));
  return next;
}

export function discardCommittedTarget(drafts: InspectorDrafts, id: string, target: MenuItem['target']): InspectorDrafts {
  const next = new Map(drafts);
  for (const locale of locales) {
    const key = keyFor(id, locale);
    const draft = next.get(key);
    if (draft?.target !== target) continue;
    if (draft.text === undefined) next.delete(key);
    else next.set(key, { text: draft.text });
  }
  return next;
}
