import { libraryNode } from './library-capabilities';
import { validateScreen, type ScreenElement, type ScreenSchema, type Result, type Issue } from '../design-system';
export type RenderElement = Exclude<ScreenElement, { component: 'table' | 'hint' | 'field-label' | 'items-list' }>;
const buttonNodes = { default: '15:17377', hover: '15:17429', pressed: '15:17401', disabled: '15:17529' };
const inputNodes = {
  default: ['115:71', '115:144'], hover: ['115:80', '115:153'], pressed: ['115:125', '115:171'],
  filled: ['115:98', '115:107'], error: ['115:135', '115:181'], 'disabled default': ['115:89', '115:162'], 'disabled filled': ['115:116', null],
};
const checkNodes = {
  default: ['44:355', '44:397', '44:447'], hover: ['44:360', '44:403', '44:453'],
  pressed: ['44:365', '44:409', '44:459'], disabled: ['44:371', '44:416', '44:466'],
};
export function sourceNode(e: ScreenElement): string | null {
  if (e.component === 'input' && e.slots && Object.keys(e.slots).length && !(e.variantProps.size === 'l' && e.variantProps.state === 'default' && !e.variantProps.placeholder)) return null;
  if (e.component === 'select' && !String(e.editorProps.optionsText).split('\n').filter(x => x.trim()).length) return null;
  if (e.component === 'select' && String(e.editorProps.optionsText).split('\n').filter(x => x.trim()).length > 10) return null;
  switch (e.component) {
    case 'button': return e.variantProps.size === 'm' && e.variantProps.variant === 'primary' && e.variantProps.colorScheme === 'accent' ? buttonNodes[e.variantProps.state] : null;
    case 'input': return e.variantProps.size === 'l' ? inputNodes[e.variantProps.state][Number(e.variantProps.placeholder)] : null;
    case 'checkbox': return e.variantProps.size === 's' ? checkNodes[e.variantProps.state][e.variantProps.indeterminate ? 2 : Number(e.variantProps.checked)] : null;
    case 'table': return null;
    default: return libraryNode(e);
  }
}
/** Revalidate on every render. Unsupported but schema-valid variants also fail closed. */
export function prepareRender(input: unknown): Result<Omit<ScreenSchema, 'elements'> & { elements: RenderElement[] }> {
  const result = validateScreen(input);
  if (!result.valid) return result;
  const errors: Issue[] = result.value.elements.flatMap((e, i) => sourceNode(e) ? [] : [{ code: 'RENDERER_UNSUPPORTED', path: `/elements/${i}`, message: `${e.component}: вариант ещё не реализован по проверенному образцу Figma.` }]);
  return errors.length ? { valid: false, errors, warnings: [] } : { ...result, value: result.value as Omit<ScreenSchema, 'elements'> & { elements: RenderElement[] } };
}
