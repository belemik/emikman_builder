import type { CSSProperties } from 'react';
import { token } from '../tokens';
import rendererTokens from '../../tokens.renderer.seed.json';
import libraryTokens from '../../tokens.sprint05.seed.json';
// Aliases of verified Figma values, not new catalog tokens. The existing W-01
// dark chrome palette is retained in CSS; it is not a verified Figma dark mode.
export const workspaceTokens = {
  '--ws-background': libraryTokens.tokens['surface/neutral/subtle-light'].value,
  '--ws-hover': rendererTokens.tokens['surface/neutral/overlay-light'].value,
  '--ws-accent-hover': rendererTokens.tokens['surface/primary/hover'].value,
  '--ws-type-sm': `${token('Typography/Desktop/body/font-size/SM')}px`,
  '--ws-type-md': `${token('Typography/Desktop/body/font-size/MD')}px`,
  '--ws-font': token('Font family/primary'),
  '--ws-accent': token('surface/primary/default'),
  '--ws-on-accent': token('text/on-color/body'),
  '--ws-surface': token('surface/on-color/default'),
  '--ws-body': token('text/default/body'),
  '--ws-caption': token('text/default/caption'),
  '--ws-border': token('border/neutral/overlay-strong'),
  '--ws-subtle': token('surface/primary/subtle-medium'),
  '--ws-pad': `${token('spacing/padding/spacing-16')}px`,
  '--ws-pad-lg': `${token('spacing/padding/spacing-24')}px`,
  '--ws-gap': `${token('spacing/gap/gap-8')}px`,
  '--ws-radius': `${token('spacing/radius/radius-4')}px`,
} as CSSProperties;
