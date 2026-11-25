import { createHash } from 'node:crypto';
import { preflightJsonKeysUnicode } from '../../src/readonly/json-preflight-keys';
import { validateWebPage, WEB_PAGE_MAX_BYTES } from '../../src/web-page/validate';

export const HERO_HEADING = '/hero/heading';
export const IMPROVE_HEADING = 'improve-hero-heading.v1';
const MAX_REPLY_BYTES = 1024;

export interface HeadingRequest {
  readonly task: typeof IMPROVE_HEADING;
  readonly path: typeof HERO_HEADING;
  readonly heading: string;
}

export interface HeadingProvider {
  suggest(request: HeadingRequest, options: {
    readonly model: string;
    readonly maxOutputTokens: number;
    readonly signal: AbortSignal;
  }): Promise<string>;
}

interface GatewayPolicy {
  readonly model: string;
  readonly timeoutMs: number;
  readonly maxRequestBytes: number;
  readonly maxRequests: number;
  readonly maxOutputTokens: number;
  readonly outputTokenBudget: number;
}

type FailureCode = 'INVALID_SCOPE' | 'INVALID_BASE' | 'REQUEST_TOO_LARGE' | 'BUDGET_EXHAUSTED'
  | 'BUSY' | 'TIMEOUT' | 'PROVIDER_ERROR' | 'INVALID_RESPONSE' | 'NO_CHANGE';

type Result =
  | { kind: 'rejected'; code: FailureCode }
  | { kind: 'proposal'; contract: '0.1'; revisionId: string; sha256: string;
      change: { path: typeof HERO_HEADING; before: string; after: string } };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readReplacement(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length > MAX_REPLY_BYTES || Buffer.byteLength(raw) > MAX_REPLY_BYTES
      || preflightJsonKeysUnicode(raw).kind === 'rejected') return;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return;
  }
  if (isRecord(value) && Object.keys(value).length === 2
      && value.path === HERO_HEADING && typeof value.value === 'string') return value.value;
}

function positiveInteger(value: number, maximum = Number.MAX_SAFE_INTEGER): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= maximum;
}

// A gateway instance is one synthetic budget. Admit before dispatch, including failures and timeouts.
export function createHeadingGateway(provider: HeadingProvider, policy: GatewayPolicy) {
  const { model, timeoutMs, maxRequestBytes, maxRequests, maxOutputTokens, outputTokenBudget } = policy;
  if (typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u.test(model)
      || !positiveInteger(timeoutMs, 60_000) || !positiveInteger(maxRequestBytes, WEB_PAGE_MAX_BYTES)
      || !positiveInteger(maxRequests) || !positiveInteger(maxOutputTokens, 4096)
      || !positiveInteger(outputTokenBudget)) throw Error('INVALID_GATEWAY_POLICY');

  let requests = 0;
  let reservedOutputTokens = 0;
  let active = false;

  return async function propose(input: unknown): Promise<Result> {
    if (!isRecord(input) || Object.keys(input).length !== 3
        || input.task !== IMPROVE_HEADING || input.path !== HERO_HEADING) {
      return { kind: 'rejected', code: 'INVALID_SCOPE' };
    }
    if (!isRecord(input.base) || Object.keys(input.base).length !== 3) {
      return { kind: 'rejected', code: 'INVALID_BASE' };
    }
    const { revisionId, sha256, payload } = input.base;
    if (typeof revisionId !== 'string' || typeof sha256 !== 'string' || typeof payload !== 'string') {
      return { kind: 'rejected', code: 'INVALID_BASE' };
    }
    if (payload.length > maxRequestBytes || Buffer.byteLength(payload) > maxRequestBytes) {
      return { kind: 'rejected', code: 'REQUEST_TOO_LARGE' };
    }
    const base = validateWebPage(payload);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u.test(revisionId) || !base.valid
        || createHash('sha256').update(payload, 'utf8').digest('hex') !== sha256) {
      return { kind: 'rejected', code: 'INVALID_BASE' };
    }
    const request = Object.freeze({ task: IMPROVE_HEADING, path: HERO_HEADING, heading: base.value.hero.heading });
    if (Buffer.byteLength(JSON.stringify(request)) > maxRequestBytes) {
      return { kind: 'rejected', code: 'REQUEST_TOO_LARGE' };
    }
    if (outputTokenBudget - reservedOutputTokens < maxOutputTokens || requests >= maxRequests) {
      return { kind: 'rejected', code: 'BUDGET_EXHAUSTED' };
    }
    if (active) return { kind: 'rejected', code: 'BUSY' };
    active = true;
    requests++;
    reservedOutputTokens += maxOutputTokens;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<undefined>(resolve => {
      timer = setTimeout(() => {
        resolve(undefined);
        controller.abort();
      }, timeoutMs);
    });
    // Keep admission closed while a provider that ignored cancellation is still running.
    const work = Promise.resolve()
      .then(() => provider.suggest(request, { model, maxOutputTokens, signal: controller.signal }))
      .then(raw => ({ raw }), () => ({ raw: undefined, failed: true }))
      .finally(() => { active = false; });
    const reply = await Promise.race([work, deadline]);
    clearTimeout(timer);
    if (!reply) return { kind: 'rejected', code: 'TIMEOUT' };
    if ('failed' in reply) return { kind: 'rejected', code: 'PROVIDER_ERROR' };

    const after = readReplacement(reply.raw);
    if (after === undefined) return { kind: 'rejected', code: 'INVALID_RESPONSE' };
    const before = base.value.hero.heading;
    if (after === before) return { kind: 'rejected', code: 'NO_CHANGE' };
    // The trusted builder only accepts a scalar for the fixed path. Validate the entire candidate.
    const candidate = { ...base.value, hero: { ...base.value.hero, heading: after } };
    if (!validateWebPage(JSON.stringify(candidate)).valid) return { kind: 'rejected', code: 'INVALID_RESPONSE' };
    return { kind: 'proposal', contract: base.value.version, revisionId, sha256,
      change: { path: HERO_HEADING, before, after } };
  };
}
