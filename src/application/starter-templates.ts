import { createElement, emptyDocument, type CanvasDocument } from '../canvas/model';
import { strictDocument } from '../renderer/boundary';

export type ProjectStart = 'blank' | 'login';

function loginField(label: string, state: 'default' | 'disabled default') {
  const input = createElement('input');
  return {
    ...input,
    variantProps: { size: 'l', state, placeholder: false },
    editorProps: { label, placeholderText: '' },
  };
}

export function createStarterDocument(start: ProjectStart): CanvasDocument {
  const document = emptyDocument();
  if (start === 'blank') return document;

  document.elements = [
    loginField('Логин', 'default'),
    loginField('Пароль (макет)', 'disabled default'),
    {
      ...createElement('checkbox'),
      variantProps: { size: 's', state: 'default', checked: false, indeterminate: false },
      editorProps: { label: 'Запомнить меня' },
    },
    {
      ...createElement('button'),
      variantProps: { size: 'm', variant: 'primary', colorScheme: 'accent', state: 'default' },
      editorProps: { label: 'Войти' },
    },
  ];
  return strictDocument(document);
}
