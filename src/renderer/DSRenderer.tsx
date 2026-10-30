import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { tokens } from '../design-system/catalog.generated';
import type { ScreenElement } from '../design-system';
import { prepareRender, sourceNode, type RenderElement } from './prepare';
import { assetUrl } from '../runtime';
const t = <K extends keyof typeof tokens>(key: K): typeof tokens[K]['value'] => tokens[key].value;
const font = t('Font family/primary');
const reset: CSSProperties = { boxSizing: 'border-box', fontFamily: font, fontStyle: 'normal', letterSpacing: 0, textTransform: 'none', boxShadow: 'none', margin: 0, opacity: 1, colorScheme: 'light' };
type E<C extends RenderElement['component']> = Extract<RenderElement, { component: C }>;
function useStatePreview(state: string) {
  const [hover, setHover] = useState(false), [pressed, setPressed] = useState(false);
  return { state: state === 'default' ? pressed ? 'pressed' : hover ? 'hover' : 'default' : state,
    events: { onMouseEnter: () => setHover(true), onMouseLeave: () => { setHover(false); setPressed(false); }, onPointerDown: () => setPressed(true), onPointerUp: () => setPressed(false), onBlur: () => setPressed(false) } };
}
function Button({ element }: { element: E<'button'> }) {
  const preview = useStatePreview(element.variantProps.state), disabled = preview.state === 'disabled';
  const background = disabled ? t('surface/disabled/overlay-light') : preview.state === 'hover' ? t('surface/primary/hover') : preview.state === 'pressed' ? t('surface/primary/pressed') : t('surface/primary/default');
  return <button className="wdr-button" type="button" data-ds-component="button" data-figma-node={sourceNode(element)!} data-state={preview.state} {...preview.events} disabled={disabled} style={{ ...reset, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 35, minWidth: 36, padding: '0 16px', border: 0, borderRadius: 4, background, color: disabled ? t('text/disabled/overlay-strong') : t('text/on-color/body'), fontSize: t('Typography/Desktop/caption/font-size/2XS'), lineHeight: `${t('Typography/Desktop/caption/line-height/2XS')}px`, fontWeight: 500, whiteSpace: 'nowrap', cursor: disabled ? 'not-allowed' : 'pointer' }}>{element.editorProps.label}</button>;
}
function Input({ element }: { element: E<'input'> }) {
  const v = element.variantProps, e = element.editorProps, preview = useStatePreview(v.state), state = preview.state;
  const disabled = state.startsWith('disabled'), error = state === 'error';
  const [value, setValue] = useState(v.state.includes('filled') || (!v.placeholder && ['error', 'pressed'].includes(v.state)) ? 'Input text' : v.state === 'pressed' && v.placeholder ? '|' : '');
  const caretSample = v.state === 'pressed' && v.placeholder;
  const floated = v.placeholder || Boolean(value) || state === 'pressed' || error;
  const labelColor = disabled ? t('text/disabled/overlay-strong') : error ? t('text/error/default') : state === 'pressed' ? t('text/primary/default') : floated ? t('text/default/caption') : t('text/default/body');
  const border = error ? t('border/error/default') : state === 'hover' ? t('border/primary/hover') : state === 'pressed' ? t('border/primary/pressed') : state === 'default' ? t('icon/neutral/overlay-strong') : t('border/neutral/overlay-strong');
  return <label className="wdr-input" data-ds-component="input" data-figma-node={sourceNode(element)!} data-state={state} {...preview.events} style={{ ...reset, display: 'flex', flexDirection: 'column', justifyContent: 'center', width: 280, height: 50, padding: '0 12px', border: disabled ? '1px solid transparent' : `1px solid ${border}`, borderRadius: 6, gap: 2, background: disabled ? t('surface/neutral/overlay-light') : t('surface/on-color/default'), fontWeight: 400 }}>
    {floated && <span style={{ ...reset, display: 'block', fontSize: t('Typography/Desktop/caption/font-size/2XS'), lineHeight: `${t('Typography/Desktop/caption/line-height/2XS')}px`, color: labelColor, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{e.label}</span>}
    <input aria-label={e.label || 'Input'} aria-invalid={error} disabled={disabled} value={value} onChange={event => setValue(event.target.value)} placeholder={floated ? v.placeholder ? e.placeholderText : '' : e.label} style={{ ...reset, display: 'block', width: '100%', minWidth: 0, height: caretSample ? 24 : t('Typography/Desktop/body/line-height/SM'), padding: 0, border: 0, borderRadius: 0, background: 'transparent', fontSize: caretSample ? t('Typography/Desktop/body/font-size/MD') : t('Typography/Desktop/body/font-size/SM'), lineHeight: caretSample ? '24px' : `${t('Typography/Desktop/body/line-height/SM')}px`, fontFeatureSettings: caretSample ? '"lnum" 1, "tnum" 1, "frac" 1' : 'normal', fontWeight: 400, color: disabled ? t('text/disabled/overlay-strong') : t('text/default/body'), '--wdr-placeholder': disabled ? t('text/disabled/overlay-strong') : floated ? t('text/default/placeholder') : labelColor } as CSSProperties} />
  </label>;
}
function Checkbox({ element, onChange }: { element: E<'checkbox'>; onChange?: (e: ScreenElement) => void }) {
  const v = element.variantProps, preview = useStatePreview(v.state), disabled = preview.state === 'disabled';
  const input = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState({ checked: v.checked, indeterminate: v.indeterminate });
  useEffect(() => { if (input.current) input.current.indeterminate = local.indeterminate; }, [local.indeterminate]);
  const index = (local.indeterminate ? 4 : 0) + ['default', 'hover', 'pressed', 'disabled'].indexOf(preview.state);
  const border = preview.state === 'hover' ? t('border/primary/hover') : preview.state === 'pressed' ? t('border/primary/pressed') : t('border/neutral/overlay-strong');
  return <label className="wdr-checkbox" data-ds-component="checkbox" data-figma-node={sourceNode({ ...element, variantProps: { ...v, ...local } })!} data-state={preview.state} {...preview.events} style={{ ...reset, display: 'inline-flex', alignItems: 'center', gap: 8, position: 'relative', fontSize: t('Typography/Desktop/body/font-size/MD'), lineHeight: `${t('Typography/Desktop/body/line-height/MD')}px`, fontWeight: 400, color: disabled ? t('text/disabled/overlay-strong') : t('text/default/body'), whiteSpace: 'nowrap' }}>
    <input ref={input} type="checkbox" aria-label={element.editorProps.label || 'Checkbox'} aria-checked={local.indeterminate ? 'mixed' : local.checked} checked={local.checked} disabled={disabled} onChange={event => { const next = { checked: event.target.checked, indeterminate: false }; setLocal(next); onChange?.({ ...element, variantProps: { ...v, ...next } }); }} style={{ position: 'absolute', left: 0, top: 0, width: 24, height: 24, margin: 0, opacity: 0, cursor: disabled ? 'not-allowed' : 'pointer' }} />
    <span className="wdr-check-container" aria-hidden="true" style={{ ...reset, display: 'flex', padding: 2, width: 24, height: 24, borderRadius: 3 }}>
      {local.checked ? <img src={assetUrl(`/ds-renderer/checkbox-${index}.svg`)} width={20} height={20} alt="" style={{ display: 'block', width: 20, height: 20, maxWidth: 'none', filter: 'none' }} /> : <span style={{ ...reset, display: 'block', width: 20, height: 20, borderRadius: 3, border: disabled ? 0 : `1.5px solid ${border}`, background: disabled ? t('surface/neutral/overlay-light') : t('surface/on-color/default') }} />}
    </span><span style={{ ...reset, color: 'inherit', fontSize: t('Typography/Desktop/body/font-size/MD'), lineHeight: `${t('Typography/Desktop/body/line-height/MD')}px`, fontWeight: 400 }}>{element.editorProps.label}</span>
  </label>;
}
function Element({ element, onChange }: { element: RenderElement; onChange?: (e: ScreenElement) => void }) {
  switch (element.component) {
    case 'button': return <Button element={element} />;
    case 'input': return <Input element={element} />;
    case 'checkbox': return <Checkbox element={element} onChange={onChange} />;
    default: { const exhaustive: never = element; return exhaustive; }
  }
}
export function DSRenderer({ screen, onSelect, onChange }: { screen: unknown; onSelect?: (id: string) => void; onChange?: (e: ScreenElement) => void }) {
  const result = prepareRender(screen);
  if (!result.valid) return <section className="renderer-errors" role="alert" data-renderer-valid="false"><strong>Строгий DS Renderer: отображение заблокировано</strong><ul>{result.errors.map((error, i) => <li key={i}><code>{error.code} {error.path}</code> — {error.message}</li>)}</ul><p>Исправьте документ или вернитесь в редакторский предпросмотр. Неподтверждённые элементы не подменяются.</p></section>;
  return <div className="wdeaf-renderer" data-renderer-valid="true" data-renderer-theme="figma" style={{ fontFamily: font, color: t('text/default/body'), background: t('surface/on-color/default'), colorScheme: 'light' }}>{result.value.elements.map(element => <div className="wdr-host-slot" key={element.id} onClick={() => onSelect?.(element.id)}><Element key={JSON.stringify(element)} element={element} onChange={onChange} /></div>)}</div>;
}
