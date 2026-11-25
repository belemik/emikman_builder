import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createHeadingGateway, HERO_HEADING, IMPROVE_HEADING } from '../server/ai/gateway';
import { fakeHeadingProvider } from '../server/ai/fake-provider';
import { openAiHeadingProvider } from '../server/ai/openai-provider';
import { validateWebPage } from '../src/web-page/validate';

const payload = readFileSync(new URL('./fixtures/web-page/event.valid.json', import.meta.url), 'utf8');
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const input = {
  task: IMPROVE_HEADING,
  path: HERO_HEADING,
  base: { revisionId: 'synthetic-r1', sha256: sha256(payload), payload },
};
const policy = {
  model: 'fixture-model', timeoutMs: 2_000, maxRequestBytes: 4096, maxRequests: 8,
  maxOutputTokens: 96, outputTokenBudget: 768,
};
const value = 'День открытых мастерских: загляните за кулисы';
const proposalText = JSON.stringify({ path: HERO_HEADING, value });
const rejected = (code: string) => ({ kind: 'rejected', code });

test('validates a single proposal pinned to exact UTF-8 source bytes without mutation', async () => {
  const base = validateWebPage(payload);
  assert.ok(base.valid);
  const propose = createHeadingGateway(fakeHeadingProvider(value), policy);
  const result = await propose(input);
  assert.deepEqual(result, { kind: 'proposal', contract: '0.1', revisionId: input.base.revisionId,
    sha256: input.base.sha256, change: { path: HERO_HEADING, before: base.value.hero.heading, after: value } });
  assert.equal(input.base.payload, payload);
  assert.equal(sha256(input.base.payload), input.base.sha256);
  const candidate = validateWebPage(JSON.stringify({ ...base.value, hero: { ...base.value.hero, heading: value } }));
  assert.ok(candidate.valid);
  assert.deepEqual({ ...candidate.value, hero: { ...candidate.value.hero, heading: base.value.hero.heading } },
    base.value);
});

test('bad input, scope, size, document and pin are rejected without calling the provider', async () => {
  let calls = 0;
  const provider = { async suggest() { calls++; return proposalText; } };
  const propose = createHeadingGateway(provider, policy);
  assert.deepEqual(await propose(null), rejected('INVALID_SCOPE'));
  assert.deepEqual(await propose({ ...input, path: '/hero/body/text' }), rejected('INVALID_SCOPE'));
  assert.deepEqual(await propose({ ...input, base: null }), rejected('INVALID_BASE'));
  assert.deepEqual(await propose({ ...input, base: { ...input.base, payload: payload + '\n' } }), rejected('INVALID_BASE'));
  assert.deepEqual(await propose({ ...input, base: { ...input.base, payload: '{}', sha256: sha256('{}') } }),
    rejected('INVALID_BASE'));
  const padded = payload + 'я'.repeat(2100);
  assert.deepEqual(await propose({ ...input, base: { ...input.base, payload: padded } }), rejected('REQUEST_TOO_LARGE'));
  assert.equal(calls, 0);
});

test('closed response rejects paths, extra changes, unknown fields, duplicate keys and invalid text', async () => {
  const cases = [
    'not json', ' '.repeat(1025),
    '{"path":"/hero/body/text","value":"other"}',
    '{"path":"/hero/heading","value":"ok","apply":true}',
    '{"path":"/hero/heading","value":"a","value":"b"}',
    '{"path":"/hero/heading","value":"\\ud800"}',
    '{"path":"/hero/heading","value":17}',
    JSON.stringify([JSON.parse(proposalText)]),
    ...['', ' '.repeat(5), 'ю'.repeat(101), '<b>hello</b>', 'text\nline']
      .map(invalid => JSON.stringify({ path: HERO_HEADING, value: invalid })),
  ];
  for (const raw of cases) {
    const propose = createHeadingGateway({ async suggest() { return raw; } }, policy);
    assert.deepEqual(await propose(input), rejected('INVALID_RESPONSE'), raw.slice(0, 80));
  }
  const base = validateWebPage(payload);
  assert.ok(base.valid);
  assert.deepEqual(await createHeadingGateway(fakeHeadingProvider(base.value.hero.heading), policy)(input),
    rejected('NO_CHANGE'));
});

test('budget reserves before dispatch and counts failures without exposing provider errors', async () => {
  for (const limits of [{ maxRequests: 1 }, { outputTokenBudget: 96 }]) {
    let calls = 0;
    const propose = createHeadingGateway({ async suggest() {
      calls++;
      throw Error('internal confidential provider error');
    } }, { ...policy, ...limits });
    assert.deepEqual(await propose(input), rejected('PROVIDER_ERROR'));
    assert.deepEqual(await propose(input), rejected('BUDGET_EXHAUSTED'));
    assert.equal(calls, 1);
  }
  assert.throws(() => createHeadingGateway(fakeHeadingProvider(value), { ...policy, timeoutMs: 0 }),
    /INVALID_GATEWAY_POLICY/);
});

test('a concurrent burst dispatches once and cannot spend beyond either admission limit', async () => {
  for (const limits of [{ maxRequests: 2 }, { outputTokenBudget: 193 }]) {
    let calls = 0;
    let release: () => void = () => assert.fail('Provider was not dispatched');
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const propose = createHeadingGateway({ async suggest(request) {
      calls++;
      assert.ok(Object.isFrozen(request));
      await barrier;
      return proposalText;
    } }, { ...policy, ...limits });

    const attempt = propose(input);
    const concurrent = await Promise.all(Array.from({ length: 32 }, () => propose(input)));
    assert.deepEqual(concurrent, Array.from({ length: 32 }, () => rejected('BUSY')));
    assert.equal(calls, 1);
    release();
    assert.equal((await attempt).kind, 'proposal');
    assert.equal((await propose({ ...input, base: { ...input.base, revisionId: 'synthetic-r2' } })).kind, 'proposal');
    assert.deepEqual(await propose(input), rejected('BUDGET_EXHAUSTED'));
    assert.equal(calls, 2);
  }
});

test('timeout aborts and keeps admission closed until the outstanding provider settles', async () => {
  let finish: (raw: string) => void = () => assert.fail('Provider did not start');
  const reply = new Promise<string>(resolve => { finish = resolve; });
  let signal: AbortSignal | undefined;
  const propose = createHeadingGateway({ suggest(_request, options) {
    signal = options.signal;
    return reply;
  } }, { ...policy, timeoutMs: 25, outputTokenBudget: 192 });
  const pending = propose(input);
  assert.deepEqual(await propose(input), rejected('BUSY'));
  assert.deepEqual(await pending, rejected('TIMEOUT'));
  assert.ok(signal?.aborted);
  assert.deepEqual(await propose(input), rejected('BUSY'));
  finish(proposalText);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await propose(input)).kind, 'proposal');
  assert.deepEqual(await propose(input), rejected('BUDGET_EXHAUSTED'));
});

test('OpenAI adapter builds the bounded request and parses the reply using a stub transport', async () => {
  let calls = 0;
  const provider = openAiHeadingProvider({
    readApiKey: () => 'synthetic-test-credential',
    async transport(url, init) {
      calls++;
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(init.redirect, 'error');
      assert.equal(init.method, 'POST');
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer synthetic-test-credential');
      assert.equal(init.signal?.aborted, false);
      assert.equal(typeof init.body, 'string');
      const body = JSON.parse(init.body as string);
      const sent = JSON.parse(body.input);
      assert.deepEqual(Object.keys(sent).sort(), ['heading', 'path', 'task']);
      assert.equal(sent.path, HERO_HEADING);
      assert.equal(body.model, policy.model);
      assert.equal(body.max_output_tokens, policy.maxOutputTokens);
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      assert.deepEqual(body.text.format.schema.properties.path.enum, [HERO_HEADING]);
      return Response.json({ status: 'completed', output: [
        { type: 'reasoning' },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: proposalText }] },
      ] });
    },
  });
  const result = await createHeadingGateway(provider, policy)(input);
  assert.equal(calls, 1);
  assert.equal(result.kind, 'proposal');
  assert.doesNotMatch(JSON.stringify(result), /synthetic-test-credential/);
});

test('OpenAI adapter rejects errors, refusals, incomplete and oversized outputs', async () => {
  for (const response of [
    new Response('internal upstream error', { status: 503 }),
    new Response('x'.repeat(32_769)),
    Response.json({ status: 'incomplete', output: [] }),
    Response.json({ status: 'completed', output: [
      { type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'private' }] },
    ] }),
  ]) {
    const provider = openAiHeadingProvider({
      readApiKey: () => 'synthetic-test-credential',
      async transport() { return response; },
    });
    assert.deepEqual(await createHeadingGateway(provider, policy)(input), rejected('PROVIDER_ERROR'));
  }
  let called = false;
  const unconfigured = openAiHeadingProvider({
    readApiKey: () => undefined,
    async transport() { called = true; return new Response(); },
  });
  assert.deepEqual(await createHeadingGateway(unconfigured, policy)(input), rejected('PROVIDER_ERROR'));
  assert.equal(called, false);
});
