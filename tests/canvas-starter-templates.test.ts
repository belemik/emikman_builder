import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStarterDocument } from '../src/application/starter-templates';
import { emptyDocument } from '../src/canvas/model';
import { validateScreen } from '../src/design-system';
import { importEditorDocument } from '../src/renderer/boundary';
import { prepareRender } from '../src/renderer/prepare';

test('P2.3 blank start is the existing empty v3 Canvas', () => {
  assert.deepEqual(createStarterDocument('blank'), emptyDocument());
});

test('P2.3 login template validates, renders and round-trips as v3', () => {
  const screen = createStarterDocument('login');
  assert.equal(screen.schemaVersion, 3);
  assert.deepEqual(screen.elements.map(item => item.component), ['input', 'input', 'checkbox', 'button']);
  assert.deepEqual(screen.elements.map(item => item.editorProps.label), ['Логин', 'Пароль (макет)', 'Запомнить меня', 'Войти']);
  assert.equal(screen.elements[1].variantProps.state, 'disabled default');
  assert.equal(validateScreen(screen).valid, true);
  assert.equal(prepareRender(screen).valid, true);
  const imported = importEditorDocument(JSON.stringify(screen));
  assert.deepEqual(imported.warnings, []);
  assert.deepEqual(imported.document, screen);
});

test('P2.3 every project gets fresh components; editing a template instance leaves the next one intact', () => {
  const first = createStarterDocument('login');
  const ids = new Set(first.elements.map(item => item.id));
  assert.equal(ids.size, 4);
  first.elements[0].editorProps.label = 'Другое имя';
  first.elements[1].variantProps.state = 'default';
  first.elements.pop();

  const next = createStarterDocument('login');
  assert.equal(next.elements.length, 4);
  assert.equal(next.elements[0].editorProps.label, 'Логин');
  assert.equal(next.elements[1].variantProps.state, 'disabled default');
  assert.ok(next.elements.every(item => !ids.has(item.id)));
});
