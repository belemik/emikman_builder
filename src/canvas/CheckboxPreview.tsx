import { useRef, useEffect } from 'react';
import type { CanvasElement } from './model';
export function CheckboxPreview({ element, onChange, sample = false }: { element: CanvasElement; onChange?: (element: CanvasElement) => void; sample?: boolean }) {
  const v = element.variantProps, input = useRef<HTMLInputElement>(null);
  const mixed = Boolean(v.indeterminate), checked = Boolean(v.checked), disabled = v.state === 'disabled';
  useEffect(() => { if (input.current) input.current.indeterminate = mixed; }, [mixed]);
  const index = (mixed ? 8 : 0) + (v.size === 'xs' ? 4 : 0) + ['default', 'hover', 'pressed', 'disabled'].indexOf(String(v.state));
  return <label className="ds-checkbox" data-size={String(v.size)} data-state={String(v.state)}>
    {!sample && <input ref={input} type="checkbox" checked={checked} disabled={disabled} aria-checked={mixed ? 'mixed' : checked} aria-label={String(element.editorProps.label) || 'Checkbox'} onChange={event => onChange?.({ ...element, variantProps: { ...v, checked: event.target.checked, indeterminate: false } })} />}
    <span className="ds-check-container" aria-hidden="true"><span className={`ds-check-box ${checked || mixed ? 'is-checked' : ''}`}>{(checked || mixed) && <img src={`/ds/checkbox-${index}.svg`} width={v.size === 'xs' ? 16 : 20} height={v.size === 'xs' ? 16 : 20} alt="" />}</span></span><span>{element.editorProps.label}</span>
  </label>;
}
