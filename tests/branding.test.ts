import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccountButton } from '../src/account';
import { DemoGate } from '../src/demo';
import { libraries } from '../src/workspace/model';
import { STORAGE_KEY } from '../src/storage';
import { DEMO_STORAGE_KEY } from '../src/runtime';

test('W03b login uses ЗАРЯ while preserving login fields, action and technical asset paths', () => {
  const login = readFileSync(new URL('../server/login.html', import.meta.url), 'utf8');
  assert.match(login, /<title>Вход · ЗАРЯ<\/title>/); assert.match(login, /<h1>Вход в ЗАРЮ<\/h1>/);
  assert.match(login, /<span class="brand">З<\/span>/); assert.doesNotMatch(login, /WDeaf Builder/);
  for (const value of ['name="username"', 'name="password"', '/api/login', "location.replace('/')", '/wdeaf-controls.css', 'wdeaf.appearance']) assert.ok(login.includes(value));
});
test('W03b public and account profiles use the product brand without renaming the design system', () => {
  for (const workspace of [false, true]) {
    const welcome = renderToStaticMarkup(createElement(DemoGate, { workspace, children: () => null }));
    assert.match(welcome, workspace ? /<h1>ЗАРЯ Workspace<\/h1>/ : /<h1>ЗАРЯ<\/h1>/); assert.doesNotMatch(welcome, /WDeaf Builder/);
  }
  const profile = renderToStaticMarkup(createElement(AccountButton, { user: { id: 'fixture', username: 'reviewer' } }));
  assert.match(profile, /Учётная запись ЗАРЯ/); assert.doesNotMatch(profile, /WDeaf Builder/);
  assert.equal(libraries.find(item => item.id === 'wdeaf')?.name, 'WDeaf PRO 2.0');
});
test('W03b cosmetic branding does not rename historical document storage keys', () => {
  assert.equal(STORAGE_KEY, 'wdeaf.canvas.v1'); assert.equal(DEMO_STORAGE_KEY, 'wdeaf.demo.emikman_builder.canvas.v2');
});
