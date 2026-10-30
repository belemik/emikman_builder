import { catalog, tokens } from './catalog.generated';
import { MAX_BYTES, type Issue, type Result, type ScreenSchema, type ScreenDraft, type ScreenElement, type TokenName, type TokenType } from './schema';

type Obj = Record<string, unknown>;
type Prop = { type: string; values?: readonly string[] };
const own = (o: object, key: PropertyKey) => Object.hasOwn(o, key);
const issue = (code: string, path: string, message: string): Issue => ({ code, path, message });
export function isObject(v: unknown): v is Obj {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}
export function fields(v: unknown, expected: readonly string[], path: string, errors: Issue[], optional = false): v is Obj {
  if (!isObject(v)) { errors.push(issue('OBJECT', path, 'Expected a plain JSON object.')); return false; }
  for (const k of Reflect.ownKeys(v)) {
    const descriptor = Object.getOwnPropertyDescriptor(v, k)!;
    if (typeof k !== 'string' || !expected.includes(k)) errors.push(issue('UNKNOWN_FIELD', path + '/' + String(k), 'Field is not allowed.'));
    if (!('value' in descriptor)) { errors.push(issue('JSON_VALUE', path, 'Accessors are not JSON.')); return false; }
  }
  if (!optional) for (const k of expected) if (!own(v, k)) errors.push(issue('MISSING_FIELD', path + '/' + k, 'Required field is missing.'));
  return true;
}
function validateProps(v: unknown, schema: Record<string, Prop>, path: string, errors: Issue[]) {
  if (!fields(v, Object.keys(schema), path, errors)) return;
  for (const [k, p] of Object.entries(schema)) {
    if (!own(v, k)) continue;
    const x = v[k];
    if (p.type === 'enum' ? typeof x !== 'string' || !p.values!.includes(x) : p.type === 'boolean' ? typeof x !== 'boolean' : typeof x !== 'string' || x.length > 2000) errors.push(issue('PROP_VALUE', path + '/' + k, 'Value is outside the reviewed seed schema.'));
  }
}
export function validateComponent(input: unknown): Result<ScreenElement> {
  const errors: Issue[] = [];
  if (fields(input, ['id', 'component', 'variantProps', 'editorProps'], '', errors)) {
    if (typeof input.id !== 'string' || !input.id || input.id.length > 100) errors.push(issue('ID', '/id', 'Expected nonempty ID, at most 100 characters.'));
    const entry = catalog.find(c => c.id === input.component);
    if (!entry) errors.push(issue('COMPONENT', '/component', 'Component is not in the reviewed catalog.'));
    else { validateProps(input.variantProps, entry.variantProps, '/variantProps', errors); validateProps(input.editorProps, entry.editorProps, '/editorProps', errors); }
  }
  return errors.length ? { valid: false, errors, warnings: [] } : { valid: true, value: structuredClone(input) as ScreenElement, warnings: [] };
}
/** Validate the exact token name and, when supplied, its type and immutable seed value. */
export function validateToken(name: unknown, expected?: { type?: TokenType; value?: unknown }): Result<TokenName> {
  if (typeof name !== 'string' || !own(tokens, name)) return { valid: false, errors: [issue('TOKEN', '', 'Unknown token name.')], warnings: [] };
  const t = tokens[name as TokenName];
  if (expected && ((own(expected, 'type') && expected.type !== t.type) || (own(expected, 'value') && expected.value !== t.value))) return { valid: false, errors: [issue('TOKEN_VALUE', '', 'Token type/value differs from the verified seed.')], warnings: [] };
  return { valid: true, value: name as TokenName, warnings: [] };
}
export function validateOverrides(v: unknown, path: string, errors: Issue[], legacy = false) {
  if (!fields(v, legacy ? ['primaryColor', 'radius', 'fontFamily'] : ['primaryColor', 'radiusPx', 'fontFamily'], path, errors, !legacy)) return;
  if (own(v, 'primaryColor') && (typeof v.primaryColor !== 'string' || !/^#[\da-f]{6}$/i.test(v.primaryColor))) errors.push(issue('COLOR', path + '/primaryColor', 'Expected six-digit HEX.'));
  const radius = legacy ? 'radius' : 'radiusPx';
  if (own(v, radius) && (typeof v[radius] !== 'number' || !Number.isFinite(v[radius]) || Number(v[radius]) < 0 || Number(v[radius]) > (legacy ? 48 : 32))) errors.push(issue('RADIUS', path + '/' + radius, 'Radius outside the supported editor range.'));
  if (own(v, 'fontFamily') && (typeof v.fontFamily !== 'string' || !v.fontFamily.trim() || v.fontFamily.length > 100)) errors.push(issue('FONT', path + '/fontFamily', 'Expected nonempty font name, at most 100 characters.'));
}
export function validateScreen(input: unknown): Result<ScreenSchema>;
export function validateScreen(input: unknown, options: { mode: 'strict' }): Result<ScreenSchema>;
export function validateScreen(input: unknown, options: { mode: 'compatible' }): Result<ScreenDraft>;
export function validateScreen(input: unknown, options: { mode: 'strict' | 'compatible' } = { mode: 'strict' }): Result<ScreenDraft> {
  const errors: Issue[] = [], warnings: Issue[] = [];
  if (fields(input, ['schemaVersion', 'platform', 'elements', 'themeOverrides', 'tokenReferences'], '', errors)) {
    if (input.schemaVersion !== 3) errors.push(issue('VERSION', '/schemaVersion', 'Expected version 3. Migrate v1/v2 explicitly.'));
    if (input.platform !== 'web') errors.push(issue('PLATFORM', '/platform', 'Only web is reviewed.'));
    if (!Array.isArray(input.elements) || input.elements.length > 500) errors.push(issue('ELEMENTS', '/elements', 'Expected at most 500 elements.'));
    else {
      const ids = new Set<string>();
      for (let i = 0; i < input.elements.length; i++) {
        const r = validateComponent(input.elements[i]);
        if (!r.valid) errors.push(...r.errors.map(e => ({ ...e, path: `/elements/${i}${e.path}` })));
        else {
          if (ids.has(r.value.id)) errors.push(issue('DUPLICATE_ID', `/elements/${i}/id`, 'Duplicate ID.'));
          ids.add(r.value.id);
          if (r.value.component === 'checkbox' && r.value.variantProps.indeterminate && !r.value.variantProps.checked) {
            const e = issue('UNVERIFIED_COMBINATION', `/elements/${i}/variantProps`, 'indeterminate=true/checked=false is an editor interpretation, not a verified Figma combination.');
            (options.mode === 'strict' ? errors : warnings).push(e);
          }
        }
      }
    }
    validateOverrides(input.themeOverrides, '/themeOverrides', errors);
    if (isObject(input.themeOverrides) && Object.keys(input.themeOverrides).length) {
      const e = issue('UNVERIFIED_STYLE', '/themeOverrides', 'Global editor overrides are not verified DS token bindings, even if a raw value matches a token.');
      (options.mode === 'strict' ? errors : warnings).push(e);
    }
    if (!Array.isArray(input.tokenReferences) || input.tokenReferences.length > Object.keys(tokens).length) errors.push(issue('TOKENS', '/tokenReferences', 'Expected a bounded list of verified token names.'));
    else {
      const names = new Set<unknown>();
      for (let i = 0; i < input.tokenReferences.length; i++) {
        const name = input.tokenReferences[i], result = validateToken(name);
        if (!result.valid) errors.push(...result.errors.map(e => ({ ...e, path: `/tokenReferences/${i}` })));
        if (names.has(name)) errors.push(issue('DUPLICATE_TOKEN', `/tokenReferences/${i}`, 'Duplicate token reference.'));
        names.add(name);
      }
    }
  }
  return errors.length ? { valid: false, errors, warnings } : { valid: true, value: structuredClone(input) as ScreenDraft, warnings };
}
export function parseScreen(raw: string, mode: 'strict' | 'compatible' = 'strict'): Result<ScreenDraft> {
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) return { valid: false, errors: [issue('SIZE', '', 'Document exceeds 2 MB.')], warnings: [] };
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return { valid: false, errors: [issue('JSON', '', 'Invalid JSON.')], warnings: [] }; }
  return mode === 'strict' ? validateScreen(input) : validateScreen(input, { mode });
}
