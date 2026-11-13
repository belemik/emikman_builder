import { types, TextDecoder } from 'node:util';
import { inspectProjectRequest } from '../../src/projects/request.validation';
import type { RequestJson } from '../../src/projects/repository.dto';
import { PROJECT_INGEST_TEST_PROFILE as limits } from './ingest-profile';
import type { ProjectCommandInspection, ProjectDecodeCode, ProjectDecodeCounters } from './ingest-profile';

const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const byteLength = Object.getOwnPropertyDescriptor(typedArray, 'byteLength')!.get!;
const bufferOf = Object.getOwnPropertyDescriptor(typedArray, 'buffer')!.get!;
const copyBytes = Uint8Array.prototype.set;
const operations = new Set(['create-project', 'read-project', 'list-projects', 'update-metadata',
  'list-revisions', 'read-revision', 'create-revision', 'restore-project', 'soft-delete-project']);
const forbidden = new Set(['__proto__', 'constructor', 'prototype', 'ownerId', 'accountId',
  'role', 'roles', 'principal', 'permissions', 'authorization', 'owner', 'account']);
class Rejected extends Error { constructor(readonly code: ProjectDecodeCode) { super(code); } }
function deny(code: ProjectDecodeCode): never { throw new Rejected(code); }
type DataRecord = { [key: string]: RequestJson };
type Frame = { kind: 'object'; record: DataRecord; keys: Set<string>; key: string;
  state: 'first-key' | 'key' | 'colon' | 'value' | 'comma' }
  | { kind: 'array'; items: RequestJson[]; state: 'first-value' | 'value' | 'comma' };
type Field = 'string' | 'cursor' | 'product' | Schema;
interface Schema { readonly [key: string]: Field }
const product: Schema = { id: 'string', definitionVersion: 'string' };
const metadata: Schema = { name: 'string', description: 'string', defaultProductRef: 'product' };
const integrity: Schema = { algorithm: 'string', encoding: 'string', byteDomain: 'string', value: 'string' };
const revision: Schema = { kind: 'string', id: 'string', projectId: 'string', integrity };
function dataRecord(value: RequestJson): value is DataRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** Closed structural gate BEFORE P02 inspection, keeping its diagnostic allocations small.
 * Only our freshly constructed null-prototype records reach this function, never caller objects.
 */
function closedShape(operation: string, root: RequestJson): void {
  const schema: { [key: string]: Field } = { dtoVersion: 'string', modelId: 'string', modelVersion: 'string',
    registry: { id: 'string', version: 'string' } };
  if (operation !== 'create-project' && operation !== 'list-projects') schema.projectId = 'string';
  if (['create-project', 'update-metadata', 'create-revision'].includes(operation)) schema.metadata = metadata;
  if (['update-metadata', 'create-revision', 'restore-project', 'soft-delete-project'].includes(operation)) schema.expectedRevision = revision;
  if (['create-project', 'update-metadata', 'create-revision', 'restore-project', 'soft-delete-project'].includes(operation)) schema.idempotencyKey = 'string';
  if (operation === 'read-revision') schema.revision = revision;
  if (operation === 'restore-project') schema.sourceRevision = revision;
  if (operation === 'list-projects' || operation === 'list-revisions') schema.cursor = 'cursor';
  const pending: { value: RequestJson; schema: Schema }[] = [{ value: root, schema }];
  while (pending.length) {
    const current = pending.pop()!;
    if (!dataRecord(current.value)) deny('R1_DTO');
    const value = current.value;
    const names = Object.keys(current.schema);
    if (Object.keys(value).length !== names.length || names.some(k => !Object.hasOwn(value, k))) deny('R1_DTO');
    for (const key of names) {
      const field = current.schema[key], child = value[key];
      if (field === 'string') { if (typeof child !== 'string') deny('R1_DTO'); }
      else if (field === 'cursor') { if (child !== null && typeof child !== 'string') deny('R1_DTO'); }
      else if (field === 'product') { if (child !== null) pending.push({ value: child, schema: product }); }
      else pending.push({ value: child, schema: field });
    }
  }
}
function inspectClosedDto(operation: string, root: RequestJson): void {
  closedShape(operation, root);
  if (inspectProjectRequest(operation, root).kind !== 'dto-shape-recognized') deny('R1_DTO');
    if (dataRecord(root) && Object.hasOwn(root, 'idempotencyKey')) {
      const key = root.idempotencyKey;
      if (typeof key !== 'string' || key.length > limits.idempotencyKeyCharacters
        || !/^[\x20-\x7e]+$/.test(key) || !/[^ ]/.test(key)) deny('R1_IDEMPOTENCY_KEY');
    }
}
/** NO-IO TEST ONLY. Input: trusted internal, non-shared Uint8Array/Buffer byte view.
 * No iterable, callback, caller property or serializer is used to obtain bytes. Intrinsic
 * brand/accessors/set avoid overridden getters and reject Proxy. Caller must trust platform
 * intrinsics; this is not a sandbox for a hostile same-realm program that patches builtins.
 * Own bytes are copied before decoding. No bytes/tree/DTO/candidate escape in either result.
 */
export function decodeProjectCommandTestOnly(operation: string, input: Uint8Array): ProjectCommandInspection {
  let bodyBytes: number | null = null, decodedLength: number | null = null, i = 0;
  const counters = { nodes: 0, properties: 0, arrayItems: 0, maxContainerDepth: 0,
    maxKeyScalars: 0, maxStringScalars: 0, maxRawStringTokenBytes: 0 };
  const boundary = () => ({ profileId: limits.id, profileStatus: 'TEST_ONLY' as const,
    productionInput: 'BLOCKED_BY_D05' as const, productionCandidate: 'NOT_IMPLEMENTED' as const,
    verifiedPrincipal: 'NOT_PROVIDED' as const, persistencePermission: 'NOT_GRANTED' as const,
    executionPermission: 'NOT_GRANTED' as const, semanticAdmission: 'NOT_EVALUATED' as const,
    trustedAdmission: 'NOT_IMPLEMENTED' as const, performance: 'UNKNOWN' as const,
    bodyBytes, counters: Object.freeze({ ...counters }) satisfies ProjectDecodeCounters });
  try {
    if (typeof operation !== 'string' || !operations.has(operation)) deny('R1_OPERATION');
    if (!types.isUint8Array(input)) deny('R1_INPUT');
    const backing: ArrayBufferLike = bufferOf.call(input);
    if (types.isSharedArrayBuffer(backing)) deny('R1_INPUT');
    bodyBytes = byteLength.call(input);
    if (bodyBytes! > limits.bodyBytes) deny('R1_SIZE');
    const owned = new Uint8Array(bodyBytes!);
    try { copyBytes.call(owned, input); } catch { deny('R1_INPUT'); }
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(owned); }
    catch { deny('R1_UTF8'); }
    decodedLength = text.length;
    // ignoreBOM=true preserves a BOM; it is rejected by grammar, never silently removed.
    const stack: Frame[] = [];
    let root: RequestJson = null, started = false, unsupportedValues = false;
    const whitespace = () => { while (i < text.length && /[\x20\t\r\n]/.test(text[i])) i++; };
    const bump = (key: 'nodes' | 'properties' | 'arrayItems', max: number, code: ProjectDecodeCode) => {
      if (counters[key] >= max) deny(code); counters[key]++;
    };
    const stringToken = (key: boolean): string => {
      const parts: string[] = []; let scalars = 0, rawBytes = 1;
      i++; // opening quote
      const rawGate = () => { if (rawBytes > limits.rawStringTokenBytes) deny('R1_RAW_STRING_BYTES'); };
      const hexUnit = (): number => {
        const token = text.slice(i, i + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(token)) deny('R1_SYNTAX');
        i += 4; rawBytes += 4; return Number.parseInt(token, 16);
      };
      while (i < text.length) {
        if (text[i] === '"') {
          i++; rawBytes++; rawGate();
          if (key) counters.maxKeyScalars = Math.max(counters.maxKeyScalars, scalars);
          else counters.maxStringScalars = Math.max(counters.maxStringScalars, scalars);
          counters.maxRawStringTokenBytes = Math.max(counters.maxRawStringTokenBytes, rawBytes);
          return parts.join('');
        }
        let cp: number;
        if (text[i] === '\\') {
          i++; rawBytes++;
          const escape = text[i++]; rawBytes++;
          if (escape === 'u') {
            cp = hexUnit();
            if (cp >= 0xd800 && cp <= 0xdbff) {
              if (text.slice(i, i + 2) !== '\\u') deny('R1_UNICODE');
              i += 2; rawBytes += 2; const low = hexUnit();
              if (low < 0xdc00 || low > 0xdfff) deny('R1_UNICODE');
              cp = 0x10000 + (cp - 0xd800) * 1024 + low - 0xdc00;
            } else if (cp >= 0xdc00 && cp <= 0xdfff) deny('R1_UNICODE');
          } else {
            const escapes: { [key: string]: number } = { '"': 34, '\\': 92, '/': 47, b: 8, f: 12, n: 10, r: 13, t: 9 };
            if (!Object.hasOwn(escapes, escape)) deny('R1_SYNTAX'); cp = escapes[escape];
          }
        } else {
          cp = text.codePointAt(i)!;
          if (cp < 32) deny('R1_SYNTAX');
          i += cp > 0xffff ? 2 : 1;
          rawBytes += cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4;
        }
        rawGate();
        if ((cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xffff) >= 0xfffe) deny('R1_UNICODE');
        scalars++;
        if (scalars > (key ? limits.keyScalars : limits.stringScalars)) deny(key ? 'R1_KEY_SCALARS' : 'R1_STRING_SCALARS');
        parts.push(String.fromCodePoint(cp));
      }
      return deny('R1_SYNTAX');
    };
    const attach = (value: RequestJson) => {
      const parent = stack.at(-1);
      if (!parent) { root = value; started = true; }
      else if (parent.kind === 'object') { parent.record[parent.key] = value; parent.state = 'comma'; }
      else { parent.items.push(value); parent.state = 'comma'; }
    };
    const valueToken = () => {
      whitespace(); bump('nodes', limits.nodes, 'R1_NODES');
      const c = text[i];
      if (c === '{' || c === '[') {
        if (stack.length >= limits.containerDepth) deny('R1_DEPTH');
        counters.maxContainerDepth = Math.max(counters.maxContainerDepth, stack.length + 1);
        i++;
        if (c === '{') {
          const record: DataRecord = Object.create(null); attach(record);
          stack.push({ kind: 'object', record, keys: new Set(), key: '', state: 'first-key' });
        } else {
          const items: RequestJson[] = []; unsupportedValues = true; attach(items);
          stack.push({ kind: 'array', items, state: 'first-value' });
        }
      } else if (c === '"') attach(stringToken(false));
      else if (c === '-' || (c >= '0' && c <= '9')) {
        const start = i;
        while (i < text.length && /[0-9eE+.\-]/.test(text[i])) {
          i++; if (i - start > limits.numericTokenBytes) deny('R1_NUMERIC_BYTES');
        }
        if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+\-]?[0-9]+)?$/.test(text.slice(start, i))) deny('R1_SYNTAX');
        // No numeric conversion/precision claim. Numeric tokens force DTO rejection below.
        unsupportedValues = true; attach(null);
      } else if (text.startsWith('true', i)) { i += 4; attach(true); }
      else if (text.startsWith('false', i)) { i += 5; attach(false); }
      else if (text.startsWith('null', i)) { i += 4; attach(null); }
      else deny('R1_SYNTAX');
    };
    while (!started || stack.length) {
      whitespace();
      if (!started) { valueToken(); continue; }
      const frame = stack.at(-1)!;
      if (frame.kind === 'object') {
        if (frame.state === 'first-key' || frame.state === 'key') {
          if (text[i] === '}' && frame.state === 'first-key') { i++; stack.pop(); continue; }
          if (text[i] !== '"') deny('R1_SYNTAX');
          const key = stringToken(true); bump('properties', limits.properties, 'R1_PROPERTIES');
          if (frame.keys.has(key)) deny('R1_DUPLICATE_KEY');
          if (forbidden.has(key)) deny('R1_FORBIDDEN_KEY');
          frame.keys.add(key); frame.key = key; frame.state = 'colon';
        } else if (frame.state === 'colon') { if (text[i++] !== ':') deny('R1_SYNTAX'); frame.state = 'value'; }
        else if (frame.state === 'value') valueToken();
        else if (text[i] === '}') { i++; stack.pop(); }
        else if (text[i++] === ',') frame.state = 'key';
        else deny('R1_SYNTAX');
      } else if (frame.state === 'first-value' || frame.state === 'value') {
        if (text[i] === ']' && frame.state === 'first-value') { i++; stack.pop(); continue; }
        bump('arrayItems', limits.arrayItems, 'R1_ARRAY_ITEMS'); valueToken();
      } else if (text[i] === ']') { i++; stack.pop(); }
      else if (text[i++] === ',') frame.state = 'value';
      else deny('R1_SYNTAX');
    }
    whitespace(); if (i !== text.length) deny('R1_SYNTAX');
    if (unsupportedValues) deny('R1_DTO');
    inspectClosedDto(operation, root);

    return Object.freeze({ ...boundary(), kind: 'test-dto-inspected', counterSemantics: 'COMPLETE_DOCUMENT',
      diagnostics: Object.freeze([] as const) });
  } catch (error) {
    const code = error instanceof Rejected ? error.code : 'R1_INTERNAL';
    return Object.freeze({ ...boundary(), kind: 'rejected', counterSemantics: 'PARTIAL_SCAN_ATTEMPTS',
      diagnostics: Object.freeze([Object.freeze({ code, path: '' as const,
        message: 'Test-only command inspection rejected.' as const,
        offset: decodedLength === null ? null : Math.min(i, decodedLength),
        offsetDomain: 'DECODED_UTF16_CODE_UNITS' as const })]) });
  }
}
