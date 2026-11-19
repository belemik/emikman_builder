import { emptyDocument, type CanvasElement } from '../canvas/model';
import { prepareRender } from '../renderer/prepare';

export function prepareButtonExample(element: CanvasElement) {
  const result = prepareRender({
    ...emptyDocument(),
    elements: [{ ...element, id: 'button-example' }],
  });
  if (!result.valid) return result;

  // Only the validated one-element screen is serialized. Keep label content
  // inside a JS string even when the snippet is copied into a TSX file.
  const code = JSON.stringify(result.value, null, 2)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');

  return {
    ...result,
    code: [
      "import { DSRenderer } from './renderer/DSRenderer';",
      '',
      'export function ButtonExample() {',
      '  return <DSRenderer screen={' + code + '} />;',
      '}',
    ].join('\n'),
  };
}
