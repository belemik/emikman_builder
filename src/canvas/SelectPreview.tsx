import { useId, useRef, useState } from 'react';
import type { CanvasElement } from './model';
export function SelectPreview({ element, sample = false }: { element: CanvasElement; sample?: boolean }) {
  const v = element.variantProps, e = element.editorProps;
  const options = String(e.optionsText).split('\n').map(s => s.trim()).filter(Boolean).slice(0, 100);
  const [open, setOpen] = useState(false), [selected, setSelected] = useState<number | undefined>(String(v.state).includes('filled') && options.length ? 0 : undefined);
  const [active, setActive] = useState(0);
  const id = useId(), trigger = useRef<HTMLButtonElement>(null);
  const disabled = String(v.state).startsWith('disabled');
  const content = <><span className="ds-select-copy">{v.label && <span className="ds-select-label">{e.labelText}</span>}<span className={selected === undefined ? 'ds-placeholder' : ''}>{selected !== undefined ? options[selected] : v.placeholder ? e.placeholderText : '\u00a0'}</span></span><img src="/ds/select-chevron.svg" width="16" height="16" alt="" className={v.foldDirection === 'up' ? 'fold-up' : ''} /></>;
  if (sample) return <span className="ds-select" data-size={String(v.size)}><span className="ds-select-trigger">{content}</span></span>;
  return <div className="ds-select" data-size={String(v.size)} data-state={String(v.state)} data-direction={String(v.foldDirection)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" className="ds-select-trigger" role="combobox" aria-label={String(e.labelText) || 'Select'} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-options`} aria-activedescendant={open && options.length ? `${id}-${active}` : undefined} aria-invalid={v.state === 'error'} disabled={disabled} onClick={() => setOpen(!open)} onKeyDown={event => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); setOpen(true); setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? Math.max(0, options.length - 1) : Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))); }
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
      if ((event.key === 'Enter' || event.key === ' ') && open) { event.preventDefault(); if (options.length) setSelected(active); setOpen(false); }
    }}>{content}</button>
    {open && <div className="ds-select-options" id={`${id}-options`} role="listbox" aria-label={String(e.labelText) || 'Варианты'}>{options.length ? options.map((option, index) => <div id={`${id}-${index}`} key={index} role="option" aria-selected={selected === index} data-active={active === index} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => { setSelected(index); setOpen(false); trigger.current?.focus(); }}>{option}</div>) : <p>Нет вариантов. Добавьте строки в optionsText.</p>}</div>}
  </div>;
}
