export const locales = ['ru', 'en'] as const;
export type Locale = typeof locales[number];
type Copy = Record<Locale, string>;
export const targets = ['#hero', '#contact'] as const;
type Target = typeof targets[number];
export type MenuItem = { id: string; label: Copy; target: Target };
export type PilotDocument = {
  format: 'zarya-ux-pilot-v0.2';
  id: 'emikman-first-screen';
  hero: Copy;
  menu: MenuItem[];
};

export const initialDocument: PilotDocument = {
  format: 'zarya-ux-pilot-v0.2',
  id: 'emikman-first-screen',
  hero: { ru: 'Запускаем и развиваем digital и phygital продукты для бизнеса', en: 'We launch and develop digital and phygital products for businesses' },
  menu: [
    { id: 'nav-hero', label: { ru: 'Главная', en: 'Home' }, target: '#hero' },
    { id: 'nav-contact', label: { ru: 'Связь', en: 'Contact' }, target: '#contact' },
  ],
};

export const MAX_MENU = 8;
export const MAX_HERO_TEXT = 160;
export const MAX_MENU_TEXT = 32;

function exactKeys(input: unknown, keys: string[]): input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype) return false;
  const ownKeys = Reflect.ownKeys(input);
  return ownKeys.length === keys.length && keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    return descriptor && 'value' in descriptor && descriptor.enumerable;
  });
}

function validCopy(input: unknown, max: number): input is Copy {
  return exactKeys(input, [...locales]) && locales.every(locale => {
    const value = input[locale];
    return typeof value === 'string' && Boolean(value.trim()) && value.length <= max;
  });
}

function validItem(input: unknown): input is MenuItem {
  return exactKeys(input, ['id', 'label', 'target']) &&
    typeof input.id === 'string' && /^nav-[a-z0-9-]{1,40}$/.test(input.id) &&
    validCopy(input.label, MAX_MENU_TEXT) && targets.some(target => input.target === target);
}

export function validatePilot(input: unknown): input is PilotDocument {
  if (!exactKeys(input, ['format', 'id', 'hero', 'menu']) || input.format !== 'zarya-ux-pilot-v0.2' ||
      input.id !== 'emikman-first-screen' || !validCopy(input.hero, MAX_HERO_TEXT) ||
      !Array.isArray(input.menu) || input.menu.length > MAX_MENU) return false;
  const menu = input.menu;
  if (Object.getPrototypeOf(menu) !== Array.prototype || Reflect.ownKeys(menu).length !== menu.length + 1) return false;
  const ids = new Set<string>();
  for (let index = 0; index < menu.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(menu, index);
    if (!descriptor || !('value' in descriptor) || !validItem(descriptor.value) || ids.has(descriptor.value.id)) return false;
    ids.add(descriptor.value.id);
  }
  return true;
}

type History = { past: PilotDocument[]; present: PilotDocument; future: PilotDocument[] };
export const initialHistory: History = { past: [], present: initialDocument, future: [] };
type Action = { type: 'commit'; document: PilotDocument } | { type: 'undo' } | { type: 'redo' };
export function changePilot(history: History, action: Action): History {
  if (action.type === 'commit') {
    if (!validatePilot(action.document) || JSON.stringify(history.present) === JSON.stringify(action.document)) return history;
    return { past: [...history.past, history.present].slice(-40), present: action.document, future: [] };
  }
  if (action.type === 'undo' && history.past.length) {
    return { past: history.past.slice(0, -1), present: history.past.at(-1)!, future: [history.present, ...history.future] };
  }
  if (action.type === 'redo' && history.future.length) {
    return { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) };
  }
  return history;
}

export function moveMenu(items: MenuItem[], id: string, offset: -1 | 1) {
  const from = items.findIndex(item => item.id === id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= items.length) return items;
  const result = [...items];
  [result[from], result[to]] = [result[to], result[from]];
  return result;
}

export function exportPilot(document: unknown) {
  if (!validatePilot(document)) throw new Error('Документ пилота не прошёл проверку.');
  return JSON.stringify(document, null, 2) + '\n';
}
