import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceShell } from '../src/workspace/WorkspaceShell';
import { WorkspaceSettings } from '../src/workspace/Overlays';
import {
  initialWorkspaceState, projects, scenarios, workspaceReducer, projectById, workById, projectChatFor, type MockProjectBrief, type WorkspaceState,
} from '../src/workspace/model';
import {
  THEME_STORAGE_KEY, readThemeMode, resolvedScheme, watchSystemScheme, writeThemeMode, type MediaQuery, type ThemeMode, type ThemeStorage,
} from '../src/workspace/theme';

function html(state?: WorkspaceState) {
  return renderToStaticMarkup(createElement(WorkspaceShell, state ? { initial: state } : {}));
}

test('home offers a prompt, scenarios and sidebar demo projects without a saved claim', () => {
  const page = html();
  assert.match(page, /Новый чат/);
  assert.match(page, /Скрыть меню/);
  assert.match(page, /Что создадим сегодня/);
  assert.match(page, /Сайт с нуля/);
  assert.match(page, /Северный свет/);
  assert.match(page, /mock/);
  assert.doesNotMatch(page, /Сохранено|Политика проверена|синхронизирован/i);
  assert.equal(workspaceReducer(initialWorkspaceState, { type: 'send-mock' }), initialWorkspaceState);
});

test('a prompt produces only a labeled mock reply', () => {
  const sent = workspaceReducer(initialWorkspaceState, { type: 'send-mock', text: 'Собрать экран входа' });
  assert.equal(sent.thread[0]?.text, 'Собрать экран входа');
  assert.match(sent.thread[1]?.text ?? '', /Демонстрационный ответ/);
  assert.match(sent.thread[1]?.text ?? '', /не вызывалась/);
  assert.match(html(sent), /Демонстрационный ответ/);
  assert.doesNotMatch(html(sent), /Сохранено/);
});

test('projects open a named work in the editor', () => {
  const opened = workspaceReducer(initialWorkspaceState, { type: 'open-work', projectId: 'north', workId: 'welcome' });
  assert.equal(opened.view, 'editor');
  assert.equal(opened.elementId, 'heading');
  const page = html(opened);
  assert.match(page, /Экран приветствия/);
  assert.match(page, /Слои и компоненты/);
  assert.match(page, /Параметры/);
  assert.match(page, /История/);
  assert.match(page, /Комменты/);
  assert.match(page, /Проверка/);
  assert.match(page, /Desktop/);
  assert.match(page, /Mobile/);
  assert.match(page, /не документ Schema v3/);
  const mobile = workspaceReducer(opened, { type: 'set-viewport', viewport: 'mobile' });
  assert.match(html(mobile), /aria-pressed="true">Mobile/);
  const review = workspaceReducer(opened, { type: 'set-tab', tab: 'review' });
  assert.match(html(review), /Политика JSON здесь не запускается/);
});

test('libraries stay descriptive and do not claim a live source', () => {
  const librariesView = workspaceReducer(initialWorkspaceState, { type: 'navigate', view: 'libraries' });
  const page = html(librariesView);
  assert.match(page, /WDeaf/);
  assert.match(page, /не подключена/);
  assert.match(page, /Подключить источник/);
  assert.match(page, /disabled/);
  assert.equal(projects.length > 0, true);
});

test('editor selection and unimplemented actions stay local', () => {
  const opened = workspaceReducer(initialWorkspaceState, { type: 'open-work', projectId: 'routes', workId: 'search' });
  const selected = workspaceReducer(opened, { type: 'select-element', elementId: 'result' });
  assert.equal(selected.elementId, 'result');
  assert.equal(workspaceReducer(selected, { type: 'select-element', elementId: 'missing' }), selected);
  const page = html(selected);
  assert.match(page, /Карточка рейса/);
  assert.match(page, /Применить к холсту/);
  assert.match(page, /disabled/);
  assert.equal(workspaceReducer(initialWorkspaceState, { type: 'navigate', view: 'editor' }).view, 'home');
  const hidden = workspaceReducer(initialWorkspaceState, { type: 'toggle-sidebar' });
  assert.equal(hidden.sidebarOpen, false);
  assert.equal(hidden.view, 'home');
  assert.equal(workspaceReducer(hidden, { type: 'navigate', view: 'projects' }).sidebarOpen, false);
  const openedMenu = workspaceReducer(initialWorkspaceState, { type: 'toggle-nav' });
  assert.equal(openedMenu.navOpen, true);
  assert.match(html(hidden), /Открыть меню/);
});

test('workspace demo does not call the builder document API', () => {
  const shell = readFileSync(new URL('../src/workspace/WorkspaceShell.tsx', import.meta.url), 'utf8');
  const model = readFileSync(new URL('../src/workspace/model.ts', import.meta.url), 'utf8');
  const theme = readFileSync(new URL('../src/workspace/theme.ts', import.meta.url), 'utf8');
  const entry = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const htmlEntry = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const source of [shell, model, theme]) {
    assert.equal(source.includes('setDocument'), false);
    assert.equal(source.includes('JSON.parse'), false);
  }
  assert.equal(shell.includes('localStorage'), false);
  assert.equal(model.includes('localStorage'), false);
  assert.match(theme, new RegExp(THEME_STORAGE_KEY));
  assert.match(htmlEntry, new RegExp(THEME_STORAGE_KEY));
  assert.match(htmlEntry, /view !== null && view !== 'workspace'/);
  assert.match(entry, /<ApplicationShell/);
  const application = readFileSync(new URL('../src/application/ApplicationShell.tsx', import.meta.url), 'utf8');
  assert.match(application, /return isDemo/);
  assert.match(application, /: <AccountGate>/);
  assert.match(entry, /setDocument/);
});

test('theme follows the system until a manual choice is stored', () => {
  const page = html();
  // W-02 moves appearance into Settings; preserve the same theme contract.
  const settings = renderToStaticMarkup(createElement(WorkspaceSettings, { mode: 'system', onTheme: () => {} }));
  assert.match(settings, /Оформление/);
  assert.match(settings, /aria-pressed="true">Системная/);
  assert.match(page, /Демо-профиль/);
  assert.match(page, /data-zarya-mode="system"/);
  assert.equal(readThemeMode(null), 'system');
  assert.equal(resolvedScheme('system', true), 'dark');
  assert.equal(resolvedScheme('light', true), 'light');
  assert.equal(resolvedScheme('dark', false), 'dark');

  const stored = memoryTheme();
  writeThemeMode(stored, 'dark');
  assert.equal(readThemeMode(stored), 'dark');
  assert.deepEqual([...stored.data.keys()], [THEME_STORAGE_KEY]);
  writeThemeMode(stored, 'light');
  assert.equal(readThemeMode(stored), 'light');

  const denied: ThemeStorage = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
  };
  assert.equal(readThemeMode(denied), 'system');
  assert.doesNotThrow(() => writeThemeMode(denied, 'dark'));

  let mode: ThemeMode = 'system';
  let scheme = '';
  const media = fakeMedia(false);
  const stop = watchSystemScheme(media, () => mode, next => { scheme = next; });
  assert.equal(scheme, 'light');
  media.matches = true;
  media.emit();
  assert.equal(scheme, 'dark');
  mode = 'light';
  media.emit();
  assert.equal(scheme, 'light');
  stop();
  media.matches = false;
  media.emit();
  assert.equal(scheme, 'light');
});

function memoryTheme(): ThemeStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
  };
}

function fakeMedia(initial: boolean): MediaQuery & { matches: boolean; emit: () => void } {
  let matches = initial;
  const listeners = new Set<() => void>();
  return {
    get matches() { return matches; },
    set matches(value: boolean) { matches = value; },
    addEventListener(_type, listener) { listeners.add(listener); },
    removeEventListener(_type, listener) { listeners.delete(listener); },
    emit() { listeners.forEach(listener => listener()); },
  };
}


const brief = (name = 'Новый mock'): MockProjectBrief => ({ scenario: 'scratch', name, category: 'Лендинг', description: 'Описание демонстрации', source: '', references: '', library: 'wdeaf' });

test('W02 scenarios enter an explicit preparation flow rather than sending a random mock prompt', () => {
  assert.equal(scenarios.length, 4);
  for (const scenario of scenarios) {
    const state = workspaceReducer(initialWorkspaceState, { type: 'choose-scenario', scenarioId: scenario.id });
    assert.equal(state.thread.length, 0);
    assert.equal(state.scenarioId, scenario.id);
    const page = html(state);
    assert.match(page, /Название проекта/);
    assert.match(page, /Дизайн-система/);
    assert.match(page, /React state/);
    if (scenario.id === 'figma') assert.match(page, /Ссылка на Figma/);
    if (scenario.id === 'redesign') assert.match(page, /URL существующего сайта/);
    if (scenario.id === 'prototype') assert.match(page, /Платформа/);
  }
});

test('W02 mock creation is isolated state; fixture projects and source brief are never mutated', () => {
  const original = structuredClone(projects), input = brief();
  const state = workspaceReducer(initialWorkspaceState, { type: 'create-mock-project', brief: input });
  assert.equal(initialWorkspaceState.mockProjects.length, 0);
  assert.equal(state.mockProjects.length, 1);
  assert.equal(state.projectId, 'mock-1');
  assert.equal(state.view, 'projects');
  assert.equal(state.mockProjects[0].brief?.description, input.description);
  assert.notEqual(state.mockProjects[0].brief, input);
  assert.deepEqual(projects, original);
  assert.match(html(state), /Новый mock/);
  assert.match(html(state), /не результат генерации/);
});

test('W02 new chat resets only draft/dialog context and keeps all in-memory projects', () => {
  const created = workspaceReducer(initialWorkspaceState, { type: 'create-mock-project', brief: brief() });
  const sent = workspaceReducer(created, { type: 'send-mock', text: 'Сообщение' });
  const fresh = workspaceReducer(sent, { type: 'new-chat' });
  assert.equal(fresh.view, 'home'); assert.equal(fresh.thread.length, 0); assert.equal(fresh.draft, '');
  assert.equal(fresh.mockProjects, created.mockProjects);
  assert.equal(fresh.nextMockId, 2);
  const second = workspaceReducer(fresh, { type: 'create-mock-project', brief: brief('Второй') });
  assert.equal(second.projectId, 'mock-2'); assert.equal(second.mockProjects.length, 2);
});

test('W02 project -> work -> layer -> project round trip works for a newly created mock', () => {
  const created = workspaceReducer(initialWorkspaceState, { type: 'create-mock-project', brief: brief() });
  assert.equal(projectById('mock-1', created.mockProjects)?.name, 'Новый mock');
  assert.equal(workById('mock-1', 'draft', created.mockProjects)?.elements.length, 5);
  const opened = workspaceReducer(created, { type: 'open-work', projectId: 'mock-1', workId: 'draft' });
  assert.equal(opened.view, 'editor');
  const selected = workspaceReducer(opened, { type: 'select-element', elementId: 'email' });
  assert.equal(selected.elementId, 'email'); assert.match(html(selected), /Input \/ Email/);
  const returned = workspaceReducer(selected, { type: 'select-project', projectId: 'mock-1' });
  assert.equal(returned.workId, null); assert.equal(returned.elementId, null); assert.equal(returned.view, 'projects');
});

test('W02 switching fixture projects cannot accidentally keep a work from another project', () => {
  const first = workspaceReducer(initialWorkspaceState, { type: 'open-work', projectId: 'north', workId: 'welcome' });
  const second = workspaceReducer(first, { type: 'select-project', projectId: 'routes' });
  assert.equal(second.workId, null); assert.equal(second.projectId, 'routes');
  assert.equal(workspaceReducer(second, { type: 'open-work', projectId: 'routes', workId: 'welcome' }), second);
  assert.equal(workspaceReducer(second, { type: 'select-project', projectId: 'missing' }), second);
});

test('W02 local recents are explicit fixture/demo opens, with no fabricated timestamps or persisted history', () => {
  const state = workspaceReducer(initialWorkspaceState, { type: 'select-project', projectId: 'routes' });
  assert.deepEqual(state.recentProjectIds, ['routes', 'north']);
  assert.match(html(state), /Примеры и открытия в этой демосессии/);
  const changed = workspaceReducer(state, { type: 'project-section', section: 'history' });
  assert.match(html(changed), /Постоянная история не ведётся/);
});

test('W02 empty names or descriptions do not create a mock project', () => {
  for (const input of [{ ...brief(), name: ' ' }, { ...brief(), description: ' ' }]) {
    assert.equal(workspaceReducer(initialWorkspaceState, { type: 'create-mock-project', brief: input }), initialWorkspaceState);
  }
});

test('W02 metadata is escaped as text and does not become an executable document or source', () => {
  const state = workspaceReducer(initialWorkspaceState, { type: 'create-mock-project', brief: brief('<script>alert(1)</script>') });
  const page = html(state); assert.doesNotMatch(page, /<script>/); assert.match(page, /&lt;script&gt;/);
  assert.doesNotMatch(page, /Сохранено|CR3|STRICT_ALLOWED/);
});

test('W02 uses original icon/avatar/close implementations and no custom SVG substitute', () => {
  const nav = readFileSync(new URL('../src/workspace/Navigation.tsx', import.meta.url), 'utf8');
  const composer = readFileSync(new URL('../src/workspace/ChatComposer.tsx', import.meta.url), 'utf8');
  assert.match(nav, /Avatar, CloseButton, Icon/); assert.match(composer, /import \{ Icon \}/);
  assert.doesNotMatch(nav + composer, /<svg|<path/);
});

test('W02 all workspace modules remain outside document/storage/auth/AI execution boundaries', () => {
  const dir = new URL('../src/workspace/', import.meta.url);
  for (const name of readdirSync(dir).filter(name => /\.tsx?$/.test(name))) {
    const source = readFileSync(new URL(name, dir), 'utf8');
    assert.doesNotMatch(source, /setDocument|JSON\.parse|fetch\s*\(|XMLHttpRequest|indexedDB|\/api\//, name);
    if (name !== 'theme.ts') assert.doesNotMatch(source, /localStorage/, name);
  }
});


test('W02 general and project chat messages and drafts are separate', () => {
  const home = workspaceReducer(initialWorkspaceState, { type: 'send-mock', text: 'Only home' });
  const draft = workspaceReducer(home, { type: 'set-draft', draft: 'Home draft' });
  const opened = workspaceReducer(draft, { type: 'open-work', projectId: 'north', workId: 'welcome' });
  assert.deepEqual(projectChatFor(opened), { draft: '', thread: [] });
  const sent = workspaceReducer(opened, { type: 'send-mock', text: 'Only north' });
  assert.deepEqual(sent.thread, home.thread); assert.equal(sent.draft, 'Home draft');
  assert.equal(projectChatFor(sent).thread[0].text, 'Only north');
  assert.equal(opened.projectChats.size, 0);
  assert.doesNotMatch(html(sent), /Only home/);
  const back = workspaceReducer(sent, { type: 'navigate', view: 'home' });
  assert.match(html(back), /Only home/); assert.doesNotMatch(html(back), /Only north/);
});

test('W02 project messages and unsent drafts cannot leak across project switches', () => {
  const opened = workspaceReducer(initialWorkspaceState, { type: 'open-work', projectId: 'north', workId: 'welcome' });
  const sent = workspaceReducer(opened, { type: 'send-mock', text: 'North only' });
  const north = workspaceReducer(sent, { type: 'set-draft', draft: 'North draft' });
  const routes = workspaceReducer(north, { type: 'open-work', projectId: 'routes', workId: 'search' });
  assert.equal(routes.chatOpen, false); assert.deepEqual(projectChatFor(routes), { draft: '', thread: [] });
  const other = workspaceReducer(routes, { type: 'send-mock', text: 'Routes only' });
  assert.doesNotMatch(html(other), /North only|North draft/);
  const selected = workspaceReducer(other, { type: 'select-project', projectId: 'north' });
  const returned = workspaceReducer(selected, { type: 'open-work', projectId: 'north', workId: 'empty' });
  assert.equal(returned.chatOpen, false);
  assert.equal(projectChatFor(returned).draft, 'North draft');
  assert.equal(projectChatFor(returned).thread[0].text, 'North only');
  assert.equal(projectChatFor(north).thread.length, 2);
  assert.doesNotMatch(html(workspaceReducer(returned, { type: 'toggle-chat' })), /Routes only/);
});

test('W02 new chat resets panel visibility and home text before reopening Canvas', () => {
  const home = workspaceReducer(initialWorkspaceState, { type: 'send-mock', text: 'Home message' });
  const opened = workspaceReducer(home, { type: 'open-work', projectId: 'north', workId: 'welcome' });
  const sent = workspaceReducer(opened, { type: 'send-mock', text: 'Project message' });
  const fresh = workspaceReducer({ ...sent, draft: 'Home draft' }, { type: 'new-chat' });
  assert.equal(fresh.chatOpen, false); assert.equal(fresh.draft, ''); assert.deepEqual(fresh.thread, []);
  assert.equal(fresh.projectChats, sent.projectChats); // New general chat does not erase project contexts.
  const reopened = workspaceReducer(fresh, { type: 'open-work', projectId: 'north', workId: 'welcome' });
  assert.equal(reopened.chatOpen, false); assert.doesNotMatch(html(reopened), /Project message|Home message/);
  assert.match(html(reopened), /Контекстный чат/);
});

test('W02 a project without works renders an honest empty state and cannot open Canvas', () => {
  const empty = { id: 'empty-project', name: 'Без работ', client: 'mock', works: [] };
  const state: WorkspaceState = { ...initialWorkspaceState, view: 'projects', projectId: empty.id, projectListOpen: false, mockProjects: [empty] };
  const page = html(state);
  assert.match(page, /Пока нет работ/); assert.match(page, /нет работ для открытия Canvas/);
  assert.match(page, /disabled=""[^>]*>Открыть Canvas/);
  assert.doesNotMatch(page, /Открыть работу<|Canvas ниже/);
  assert.equal(workspaceReducer(state, { type: 'open-work', projectId: empty.id, workId: 'missing' }), state);
});
