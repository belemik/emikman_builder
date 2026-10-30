import type { catalog, tokens } from './catalog.generated';

type CatalogEntry = typeof catalog[number];
export type ComponentId = CatalogEntry['id'];
export type TokenName = keyof typeof tokens;
export type TokenType = typeof tokens[TokenName]['type'];
type Value<P> = P extends { type: 'enum'; values: readonly (infer V)[] } ? V : P extends { type: 'boolean' } ? boolean : string;
type Props<P> = keyof P extends never ? Record<string, never> : { -readonly [K in keyof P]: Value<P[K]> };
export type ScreenElement = { [C in ComponentId]: {
  id: string;
  component: C;
  variantProps: Props<Extract<CatalogEntry, { id: C }>['variantProps']>;
  editorProps: Props<Extract<CatalogEntry, { id: C }>['editorProps']>;
} }[ComponentId];
export interface EditorOverrides { primaryColor?: string; radiusPx?: number; fontFamily?: string }
/** tokenReferences is a dependency manifest, never a CSS binding API. */
export interface ScreenDraft {
  schemaVersion: 3;
  platform: 'web';
  elements: ScreenElement[];
  themeOverrides: EditorOverrides;
  tokenReferences: TokenName[];
}
/** Strict DS accepts no unverified global styling overrides. */
export interface ScreenSchema extends Omit<ScreenDraft, 'themeOverrides'> { themeOverrides: Record<string, never> }
export interface CanvasV2 extends Omit<ScreenDraft, 'schemaVersion' | 'tokenReferences'> { schemaVersion: 2 }
export interface CanvasV1 extends Omit<CanvasV2, 'schemaVersion' | 'themeOverrides'> {
  schemaVersion: 1;
  theme: { primaryColor: string; radius: number; fontFamily: string };
}
export interface Issue { code: string; path: string; message: string }
export type Result<T> = { valid: true; value: T; warnings: Issue[] } | { valid: false; errors: Issue[]; warnings: Issue[] };
export const CONTRACT_VERSION = '1.1.0';
export const MAX_BYTES = 2_000_000;
