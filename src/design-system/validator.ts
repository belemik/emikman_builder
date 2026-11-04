import matrix from '../../design-system/library-matrix.json';
import { slotRules, internalComponents, allowedParents } from './composition';
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
export function validateComponent(input: unknown, depth = 0): Result<ScreenElement> {
  if (depth > 3) return { valid: false, errors: [issue('DEPTH', '', 'Composition exceeds three levels.')], warnings: [] };
  const errors: Issue[] = [];
  if (fields(input, ['id', 'component', 'variantProps', 'editorProps', ...(isObject(input) && own(input, 'slots') ? ['slots'] : []), ...(isObject(input) && input.component === 'select' && own(input, 'interactionState') ? ['interactionState'] : [])], '', errors)) {
    if (typeof input.id !== 'string' || !input.id || input.id.length > 100) errors.push(issue('ID', '/id', 'Expected nonempty ID, at most 100 characters.'));
    const entry = catalog.find(c => c.id === input.component);
    if (!entry) return { valid: false, errors: [...errors, issue('COMPONENT', '/component', 'Component is not in the reviewed catalog.')], warnings: [] };
    else { validateProps(input.variantProps, entry.variantProps, '/variantProps', errors); validateProps(input.editorProps, entry.editorProps, '/editorProps', errors); }
  }
  if (isObject(input) && typeof input.component === 'string') {
    if (own(input, 'interactionState') && input.component === 'select' && fields(input.interactionState, ['selectedValue'], '/interactionState', errors)) {
      const value = input.interactionState.selectedValue;
      const options = isObject(input.editorProps) && typeof input.editorProps.optionsText === 'string' ? input.editorProps.optionsText.split('\n').filter(x => x.trim()) : [];
      if (value !== null && (typeof value !== 'string' || value.length > 2000 || !options.includes(value))) errors.push(issue('SELECT_VALUE', '/interactionState/selectedValue', 'Выбранное значение отсутствует в optionsText. Сначала сбросьте выбор в инспекторе.'));
    }
    const rows = own(matrix, input.component) ? (matrix as Record<string, { props: Record<string, unknown> }[]>)[input.component] : undefined;
    // Existing Select metadata compatibility remains; strict capability validation uses the narrower matrix.
    if (Array.isArray(rows) && input.component !== 'select' && isObject(input.variantProps) && !rows.some(row => Object.entries(row.props).every(([k,v]) => (input.variantProps as Obj)[k] === v))) errors.push(issue('UNVERIFIED_COMBINATION', '/variantProps', 'No such variant exists in the reviewed Figma matrix.'));
    if (own(input, 'slots')) {
      const rules = own(slotRules, input.component) ? slotRules[input.component] : {};
      if (fields(input.slots, Object.keys(rules), '/slots', errors, true)) for (const [slot, children] of Object.entries(input.slots)) {
        const rule = own(rules, slot) ? rules[slot] : undefined; if (!rule) continue;
        if (!Array.isArray(children) || children.length < rule.min || children.length > rule.max) { errors.push(issue('SLOT_COUNT', '/slots/'+slot, 'Invalid slot cardinality.')); continue; }
        for (let i=0; i<children.length; i++) {
          const child = children[i], result = validateComponent(child, depth+1);
          if (!result.valid) errors.push(...result.errors.map(e => ({...e,path:`/slots/${slot}/${i}${e.path}`})));
          if (isObject(child) && typeof child.component === 'string' && own(allowedParents, child.component) && !allowedParents[child.component].includes(input.component)) errors.push(issue('PARENT_COMPONENT', `/slots/${slot}/${i}`, 'Родитель не разрешён подтверждённой структурой Figma.'));
          if (!isObject(child) || child.component !== rule.component) errors.push(issue('SLOT_COMPONENT', '/slots/'+slot, 'Component is not allowed in this Figma slot.'));
        }
        if (isObject(input.variantProps) && ['tag-group','items-list'].includes(input.component) && children.length !== Number(String(input.variantProps.amount).replace('x',''))) errors.push(issue('SLOT_COUNT', '/slots/'+slot, 'Child count must match amount.'));
        if (input.component === 'items-list' && isObject(input.variantProps)) for (const child of children) { if (isObject(child) && isObject(child.variantProps) && child.variantProps.size !== input.variantProps.size) errors.push(issue('SLOT_VARIANT', '/slots/'+slot, 'DropdownMenu size must match ItemsList size.')); }
        if (input.component === 'tag-group' && isObject(input.variantProps)) for (const child of children) {
          if (isObject(child) && isObject(child.variantProps) && isObject(child.editorProps) && (child.variantProps.size !== input.variantProps.size || child.variantProps.variant !== 'primary' || child.variantProps.state !== (input.variantProps.disabled ? 'disabled' : 'default') || child.editorProps.closable !== input.variantProps.closable)) errors.push(issue('SLOT_VARIANT', '/slots/'+slot, 'TagItem must match the verified group composition.'));
        }
      }
    }
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
          if (internalComponents.has(r.value.component)) errors.push(issue('INTERNAL_COMPONENT', `/elements/${i}`, `${r.value.component} — внутренний компонент Figma. Допустимый родитель: ${(allowedParents[r.value.component] ?? []).join(', ')}; требуется подтверждённый слот. Исходные данные не удалены.`));
          const collect = (element: ScreenElement) => { for (const children of Object.values(element.slots ?? {})) for (const child of children ?? []) { if (ids.has(child.id)) errors.push(issue('DUPLICATE_ID', `/elements/${i}/slots`, 'Duplicate nested ID.')); ids.add(child.id); collect(child); } }; collect(r.value);
          if (ids.size > 500) errors.push(issue('ELEMENTS', '/elements', 'Total component count exceeds 500.'));
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
