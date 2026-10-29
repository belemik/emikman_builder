// Build-time mode only: query strings and localStorage cannot disable server auth.
export const isDemo = import.meta.env?.MODE === 'production';
export const baseUrl = import.meta.env?.BASE_URL ?? '/';
export function assetUrl(path: string) { return baseUrl + path.replace(/^\/+/, ''); }
export const DEMO_STORAGE_KEY = 'wdeaf.demo.emikman_builder.canvas.v2';
