import type { CSSProperties } from 'react';
import { token, verifiedTokens } from '../tokens';
export interface ThemeOverrides { primaryColor?: string; radiusPx?: number; fontFamily?: string }
export const isHexColor = (value: string) => /^#[\da-f]{6}$/i.test(value);
export const editorDefaults: Required<ThemeOverrides> = { primaryColor: token('surface/primary/default'), radiusPx: 8, fontFamily: token('Font family/primary') };
export function resolveTheme(overrides: ThemeOverrides) {
  return { primaryColor: overrides.primaryColor ?? token('surface/primary/default'), radiusPx: overrides.radiusPx, fontFamily: overrides.fontFamily ?? token('Font family/primary') };
}
export function themeStyle(overrides: ThemeOverrides): CSSProperties {
  const theme = resolveTheme(overrides);
  const variables: Record<string, string | number | undefined> = Object.fromEntries(Object.entries(verifiedTokens).map(([key, entry]) => [`--wdeaf-${key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, entry.type === 'dimension' ? `${entry.value}px` : entry.value]));
  return { ...variables, '--preview-accent': theme.primaryColor, '--preview-radius': theme.radiusPx === undefined ? undefined : `${theme.radiusPx}px`, '--preview-font': `${JSON.stringify(theme.fontFamily)}, -apple-system, BlinkMacSystemFont, sans-serif`, '--preview-body': token('text/default/body'), '--preview-surface': token('surface/on-color/default'), '--preview-border': token('border/neutral/overlay-strong'), '--preview-caption': token('text/default/caption'), '--preview-placeholder': token('text/default/placeholder') } as CSSProperties;
}
