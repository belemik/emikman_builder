import { CheckboxPreview } from './CheckboxPreview';
import { SelectPreview } from './SelectPreview';
import { TablePreview } from './TablePreview';
import type { CanvasElement } from './model';
export function Preview({ element, onChange, sample = false }: { element: CanvasElement; onChange?: (element: CanvasElement) => void; sample?: boolean }) {
  const v = element.variantProps;
  const e = element.editorProps;
  const state = String(v.state);
  if (element.component === 'button') return <button type="button" className="preview-button" data-size={String(v.size)} data-variant={String(v.variant)} data-scheme={String(v.colorScheme)} data-state={state} disabled={state === 'disabled'}>{e.label}</button>;
  if (element.component === 'input') return <label className="preview-input" data-size={String(v.size)} data-state={state}><span>{e.label}</span><input aria-label={String(e.label) || 'Input'} aria-invalid={state === 'error'} disabled={state.startsWith('disabled')} readOnly value={state.includes('filled') ? 'Пример значения' : ''} placeholder={v.placeholder ? String(e.placeholderText) : undefined} /></label>;
  if (element.component === 'checkbox') return <CheckboxPreview element={element} onChange={onChange} sample={sample} />;
  if (element.component === 'select') return <SelectPreview key={JSON.stringify([element.variantProps, element.editorProps])} element={element} sample={sample} />;
  if (element.component === 'table') return <TablePreview element={element} />;
  return null;
}
