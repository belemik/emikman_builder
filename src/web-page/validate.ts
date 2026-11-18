import { preflightJsonKeysUnicode } from '../readonly/json-preflight-keys';
import { WEB_PAGE_ASSETS, WEB_PAGE_VERSION, type PageImage, type WebPageV01 } from './contract';

export const WEB_PAGE_MAX_BYTES = 16_384;

export interface WebPageIssue {
  readonly code: 'INPUT' | 'SIZE' | 'JSON' | 'SHAPE' | 'UNKNOWN_FIELD'
    | 'VERSION' | 'TEXT' | 'LAYOUT' | 'ASSET' | 'ID' | 'TARGET';
  readonly path: string;
  readonly message: string;
  readonly span?: { readonly start: number; readonly end: number };
}

export type WebPageResult =
  | { readonly valid: true; readonly value: WebPageV01 }
  | { readonly valid: false; readonly issue: WebPageIssue };

class InvalidPage extends Error {
  constructor(readonly issue: WebPageIssue) {
    super(issue.message);
  }
}

function reject(code: WebPageIssue['code'], path: string, message: string): never {
  throw new InvalidPage({ code, path, message });
}

// Called only on values decoded by JSON.parse in this module.
function record(value: unknown, path: string, fields: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    reject('SHAPE', path, 'Expected an object.');
  }
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some(key => !fields.includes(key))) {
    reject('UNKNOWN_FIELD', path, 'Object contains an unsupported field.');
  }
  for (const field of fields) {
    if (!Object.hasOwn(object, field)) reject('SHAPE', path + '/' + field, 'Required field is missing.');
  }
  return object;
}

function plainText(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string' || value.length > max || !value.trim()
      || /[<>\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    reject('TEXT', path, `Expected nonempty plain text of at most ${max} UTF-16 units, without angle brackets or control characters.`);
  }
  return value;
}

function textBlock(value: unknown, path: string) {
  return Object.freeze({ text: plainText(record(value, path, ['text']).text, path + '/text', 500) });
}

function assetId(value: unknown): value is PageImage['assetId'] {
  return typeof value === 'string' && Object.hasOwn(WEB_PAGE_ASSETS, value);
}

function sectionId(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length > 40 || !/^[a-z][a-z0-9-]*$/u.test(value)
      || /\s/u.test(value)) {
    reject('ID', path, 'Expected a lowercase section ID of 1–40 letters, digits or hyphens, starting with a letter.');
  }
  return value;
}

/** Checks primitive JSON text and returns a fresh, recursively frozen page on success. */
export function validateWebPage(input: unknown): WebPageResult {
  if (typeof input !== 'string') {
    return { valid: false, issue: { code: 'INPUT', path: '', message: 'Expected JSON text.' } };
  }
  if (input.length > WEB_PAGE_MAX_BYTES || new TextEncoder().encode(input).length > WEB_PAGE_MAX_BYTES) {
    return { valid: false, issue: { code: 'SIZE', path: '', message: 'Page exceeds 16,384 UTF-8 bytes.' } };
  }
  const preflight = preflightJsonKeysUnicode(input);
  if (preflight.kind === 'rejected') {
    const { message, span } = preflight.issue;
    return { valid: false, issue: { code: 'JSON', path: '', message, ...(span ? { span } : {}) } };
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(input);
  } catch {
    return { valid: false, issue: { code: 'JSON', path: '', message: 'Invalid JSON.' } };
  }
  try {
    const page = record(decoded, '', ['version', 'hero', 'program']);
    if (page.version !== WEB_PAGE_VERSION) reject('VERSION', '/version', 'Expected WebPage version 0.1.');
    const hero = record(page.hero, '/hero', ['layout', 'heading', 'body', 'image', 'cta']);
    if (hero.layout !== 'stack' && hero.layout !== 'split') {
      reject('LAYOUT', '/hero/layout', 'Expected stack or split layout.');
    }
    const image = record(hero.image, '/hero/image', ['assetId', 'alt']);
    if (!assetId(image.assetId)) reject('ASSET', '/hero/image/assetId', 'Image is absent from the allowed catalog.');
    const cta = record(hero.cta, '/hero/cta', ['label', 'targetId']);
    const program = record(page.program, '/program', ['id', 'heading', 'items']);
    const id = sectionId(program.id, '/program/id');
    const targetId = sectionId(cta.targetId, '/hero/cta/targetId');
    if (targetId !== id) reject('TARGET', '/hero/cta/targetId', 'CTA must target the program section.');
    if (!Array.isArray(program.items) || program.items.length < 1 || program.items.length > 8) {
      reject('SHAPE', '/program/items', 'Expected 1–8 program items.');
    }
    return {
      valid: true,
      value: Object.freeze({
        version: WEB_PAGE_VERSION,
        hero: Object.freeze({
          layout: hero.layout,
          heading: plainText(hero.heading, '/hero/heading', 100),
          body: textBlock(hero.body, '/hero/body'),
          image: Object.freeze({ assetId: image.assetId, alt: plainText(image.alt, '/hero/image/alt', 160) }),
          cta: Object.freeze({ label: plainText(cta.label, '/hero/cta/label', 60), targetId }),
        }),
        program: Object.freeze({
          id,
          heading: plainText(program.heading, '/program/heading', 100),
          items: Object.freeze(program.items.map((item: unknown, i) => textBlock(item, `/program/items/${i}`))),
        }),
      }),
    };
  } catch (error) {
    if (error instanceof InvalidPage) return { valid: false, issue: error.issue };
    throw error;
  }
}
