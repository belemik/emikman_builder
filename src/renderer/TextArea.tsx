import { useId, type CSSProperties } from 'react';
import { tokens } from '../design-system/catalog.generated';
import type { ScreenElement } from '../design-system';
import { sourceNode } from './prepare';

type TextAreaElement = Extract<ScreenElement, { component: 'textarea' }>;

const palette = {
  '--wdr-textarea-light-surface': tokens['surface/on-color/default'].value,
  '--wdr-textarea-light-body': tokens['text/default/body'].value,
  '--wdr-textarea-light-caption': tokens['text/default/caption'].value,
  '--wdr-textarea-light-error': tokens['border/error/default'].value,
  '--wdr-textarea-light-focus': tokens['border/primary/default'].value,
} as CSSProperties;

export function TextArea({ element, onChange }: { element: TextAreaElement; onChange?: (element: TextAreaElement) => void }) {
  const fieldId = useId();
  const messageId = fieldId + '-message';
  const { labelText, placeholderText, hintText, errorText, value } = element.editorProps;
  const error = element.variantProps.state === 'error';
  return <div className="wdr-textarea" style={palette} data-ds-component="textarea" data-figma-node={sourceNode(element)!}
    data-state={element.variantProps.state}>
    <label htmlFor={fieldId}>{labelText.trim() || 'Описание'}</label>
    <textarea id={fieldId} aria-describedby={messageId} aria-invalid={error || undefined} maxLength={2000}
      placeholder={placeholderText} {...(onChange ? {
        value, onChange: event => onChange({ ...element, editorProps: { ...element.editorProps, value: event.currentTarget.value } }),
      } : { defaultValue: value })} />
    <p id={messageId}>{error ? 'Ошибка: ' + (errorText.trim() || 'Проверьте введённый текст.') : hintText}</p>
  </div>;
}
