import { defaults, definition, type PropValue } from '../registry';
import type { ThemeOverrides } from '../theme/model';
export interface CanvasElement {
  id: string;
  component: string;
  variantProps: Record<string, PropValue>;
  editorProps: Record<string, PropValue>;
}
export interface CanvasDocument { schemaVersion: 2; platform: 'web'; elements: CanvasElement[]; themeOverrides: ThemeOverrides }
export const emptyDocument = (): CanvasDocument => ({ schemaVersion: 2, platform: 'web', elements: [], themeOverrides: {} });
export function createElement(component: string): CanvasElement {
  const entry = definition(component);
  return { id: crypto.randomUUID(), component, variantProps: defaults(entry.variantProps), editorProps: defaults(entry.editorProps) };
}
export function moveElement(elements: CanvasElement[], id: string, direction: number) {
  const from = elements.findIndex(element => element.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= elements.length) return elements;
  const result = [...elements];
  [result[from], result[to]] = [result[to], result[from]];
  return result;
}
