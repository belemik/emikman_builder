import { useState } from 'react';
import type { CanvasElement } from '../canvas/model';
import { DSRenderer } from '../renderer/DSRenderer';
import { prepareButtonExample } from './button-example';

function CodePreview({ code }: { code: string }) {
  const [status, setStatus] = useState('');

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setStatus('Код скопирован.');
    } catch {
      setStatus('Копирование недоступно. Выделите код в поле и скопируйте вручную.');
    }
  }

  return <>
    <textarea aria-label="Демонстрационный JSX" value={code} readOnly spellCheck={false} rows={9} />
    <button type="button" onClick={copyCode}>Скопировать JSX</button>
    <p className="studio-copy-status" role="status">{status}</p>
  </>;
}

export function ButtonStudio({ element }: { element: CanvasElement }) {
  const [motion, setMotion] = useState(false);
  const example = prepareButtonExample(element);
  const interactive = element.variantProps.state === 'default';
  const hasLabel = Boolean(String(element.editorProps.label).trim());

  return <section className="button-studio" aria-label="Component Studio · Button">
    <h3>Component Studio · Button</h3>
    <p>Проверенный профиль WDeaf: <code>m / primary / accent</code>. Изменяйте свойства в инспекторе выше.</p>

    <h4>Live Preview</h4>
    {example.valid ? <>
      <div className="studio-stage" data-motion={motion && interactive} inert={!hasLabel}>
        <DSRenderer screen={example.value} />
      </div>
      {!hasLabel &&
        <p>Добавьте текст, чтобы у кнопки было доступное имя.</p>}
    </> : <div role="status">
      <p>Текущие настройки не поддерживаются в строгом Renderer.</p>
      <ul>{example.errors.map(issue =>
        <li key={issue.code + issue.path}><code>{issue.code} {issue.path}</code> — {issue.message}</li>)}</ul>
    </div>}

    <h4>Motion Preview</h4>
    <label className="studio-motion-option">
      <input type="checkbox" checked={motion && interactive && example.valid}
        disabled={!interactive || !example.valid} onChange={event => setMotion(event.target.checked)} />
      CSS-переходы hover и pressed
    </label>
    {interactive
      ? <p>Наведите курсор, нажмите кнопку или удерживайте пробел в фокусе. Эффект экспериментальный и не меняет JSON.</p>
      : <p>Выберите состояние <code>default</code>, чтобы попробовать переходы.</p>}

    <h4>Code Preview</h4>
    <p>Демонстрационный JSX для Renderer этого проекта. Код доступен только для чтения.</p>
    {example.valid ? <CodePreview key={example.code} code={example.code} />
      : <p>JSX появится, когда Renderer подтвердит текущие свойства.</p>}
  </section>;
}
