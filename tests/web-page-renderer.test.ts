import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WebPageRenderer } from '../src/web-page/WebPageRenderer';
import { validateWebPage } from '../src/web-page/validate';

const fixture = readFileSync(new URL('./fixtures/web-page/event.valid.json', import.meta.url), 'utf8');

test('WebPage Renderer handles the validated layouts and keeps both anchor targets unique', () => {
  const split = validateWebPage(fixture);
  const stack = validateWebPage(fixture.replace('"split"', '"stack"'));
  assert.ok(split.valid && stack.valid);

  const html = renderToStaticMarkup(createElement(Fragment, null,
    createElement(WebPageRenderer, { page: split.value }),
    createElement(WebPageRenderer, { page: stack.value }),
  ));
  assert.match(html, /data-layout="split"/);
  assert.match(html, /data-layout="stack"/);
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);
  const hrefs = [...html.matchAll(/ href="#([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2);
  assert.deepEqual(hrefs, ids);
  assert.match(html, /src="\/icons\/globe-01\.svg" alt="Знак мероприятия"/);
});

test('WebPage Renderer outputs URL-like and special-character input as inert text', () => {
  const candidate = validateWebPage(fixture.replace('День открытых мастерских', 'https://example.invalid/?a=1&b=2'));
  assert.ok(candidate.valid);
  const html = renderToStaticMarkup(createElement(WebPageRenderer, { page: candidate.value }));
  assert.match(html, /<h3>https:\/\/example\.invalid\/\?a=1&amp;b=2<\/h3>/);
  assert.doesNotMatch(html, /href="https?:/);
});
