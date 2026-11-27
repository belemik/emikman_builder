import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { tokens } from '../design-system/catalog.generated';
import type { ScreenElement } from '../design-system';

type ButtonIconElement = Extract<ScreenElement, { component: 'button-icon' }>;
type ButtonIconProps = Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'aria-expanded' | 'aria-controls'> & {
  state?: ButtonIconElement['variantProps']['state'];
  label: string;
  figmaNode?: string;
};

const palette = {
  '--wdr-icon-light-ink': tokens['icon/neutral/default'].value,
  '--wdr-icon-light-bg': tokens['surface/neutral/overlay-light'].value,
  '--wdr-icon-light-hover-bg': tokens['surface/neutral/overlay-medium'].value,
  '--wdr-icon-light-pressed-bg': tokens['surface/neutral/overlay-strong'].value,
  '--wdr-icon-light-disabled-bg': tokens['surface/disabled/overlay-light'].value,
  '--wdr-icon-light-focus': tokens['border/primary/default'].value,
} as CSSProperties;

export function ButtonIcon({ label, state = 'default', figmaNode, ...action }: ButtonIconProps) {
  return <button {...action} type="button" className="wdr-button-icon" style={palette}
    aria-label={label.trim() || 'Дополнительные действия'} disabled={state === 'disabled'}
    data-ds-component={figmaNode ? 'button-icon' : undefined} data-figma-node={figmaNode} data-state={state}>
    <span className="wdr-icon-surface" aria-hidden="true"><span className="wdr-icon-glyph" data-figma-icon="15:18364" /></span>
  </button>;
}
