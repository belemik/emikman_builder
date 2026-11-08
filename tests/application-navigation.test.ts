import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { applicationHref, isWorkspaceDemoShortcut, resolveApplicationRoute } from '../src/application/navigation';
import { WorkspaceShell } from '../src/workspace/WorkspaceShell';
import { AccountButton } from '../src/account';
import { DemoGate } from '../src/demo';

test('W03 default, canonical and existing demo URLs resolve to Workspace', () => {
  for (const search of ['', '?demo=workspace', '?view=workspace', '?demo=server', '?other=anything']) assert.equal(resolveApplicationRoute(search), 'workspace');
});
test('W03 laboratory requires an explicit route, including conflicting demo aliases', () => {
  assert.equal(resolveApplicationRoute('?view=laboratory'), 'laboratory');
  assert.equal(resolveApplicationRoute('?demo=workspace&view=laboratory'), 'laboratory');
  assert.equal(isWorkspaceDemoShortcut('?demo=workspace&view=laboratory'), false);
  assert.equal(isWorkspaceDemoShortcut('?demo=workspace'), true);
  assert.equal(isWorkspaceDemoShortcut('?view=workspace'), false);
});
test('W03 unknown routes are explicit and cannot redirect to external or legacy destinations', () => {
  for (const view of ['', 'builder', '__proto__', 'https://evil.example', '../server', 'WORKSPACE']) assert.equal(resolveApplicationRoute('?view=' + encodeURIComponent(view)), 'unknown');
});
test('W03 links preserve both server root and GitHub Pages subpath without rewrite rules', () => {
  for (const base of ['https://example.test/', 'https://example.test/emikman_builder/', 'https://example.test/emikman_builder/index.html']) {
    for (const route of ['workspace', 'laboratory'] as const) {
      const original = new URL(base + '?demo=workspace'); const next = new URL(applicationHref(route), original);
      assert.equal(next.origin, original.origin); assert.equal(next.pathname, original.pathname);
      assert.equal(resolveApplicationRoute(next.search), route); assert.equal(next.searchParams.has('demo'), false);
    }
  }
});
test('W03 public guest entry stays honest about separate mock and laboratory storage', () => {
  const page = renderToStaticMarkup(createElement(DemoGate, { workspace: true, children: () => createElement('p', null, 'entered') }));
  assert.match(page, /ЗАРЯ Workspace/); assert.match(page, /mock в памяти/); assert.match(page, /Экспериментальный холст лаборатории хранится отдельно/);
  assert.match(page, /Открыть демоверсию/); assert.doesNotMatch(page, /entered/);
});
test('W03 Workspace receives a confirmed identity only from its parent; demo remains distinct', () => {
  const page = renderToStaticMarkup(createElement(WorkspaceShell, { user: { id: 'fixture', username: 'reviewer' } }));
  assert.match(page, /Открыть профиль reviewer/); assert.match(page, /Подтверждённая сессия/);
  assert.doesNotMatch(page, /Без подтверждённой сессии|Текущий Builder/);
  const demo = renderToStaticMarkup(createElement(WorkspaceShell)); assert.match(demo, /Демо-профиль/); assert.match(demo, /Без подтверждённой сессии/);
});


test('W03a AccountButton offers the same account action as a menu item without a second profile dialog', () => {
  const menu = renderToStaticMarkup(createElement(AccountButton, { user: { id: 'fixture', username: 'reviewer' }, presentation: 'menu-item' }));
  assert.match(menu, />Выйти<\/button>/); assert.doesNotMatch(menu, /<dialog|avatar-trigger|disabled/);
  const legacy = renderToStaticMarkup(createElement(AccountButton, { user: { id: 'fixture', username: 'reviewer' } }));
  assert.match(legacy, /Открыть профиль reviewer/); assert.match(legacy, /Личный кабинет/); assert.match(legacy, /Выйти из системы/);
});
