import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { registry, definition, figmaUrl } from './registry';
import { createElement, moveElement } from './canvas/model';
import { Preview } from './canvas/Preview';
import { Inspector } from './inspector';
import { ThemeEditor } from './theme';
import { themeStyle } from './theme/model';
import { Icon, CloseButton } from './ui';
import { CatalogSample } from './ui/CatalogSample';
import './ui/styles.css';
import { exportDocument, loadDocument, parseDocument, saveDocument, migrationWarning } from './storage';
import { generatePrompt } from './prompt';
import './styles.css';
import './appearance/appearance.css';
import { AccountGate, AccountButton, type User } from './account';

function App({ user }: { user: User }) {
  const storageKey = `wdeaf.canvas.v1.${user.id}`;
  const [initial] = useState(() => loadDocument(storageKey, user.username === 'emikman'));
  const [document, setDocument] = useState(initial.document);
  const [selected, setSelected] = useState<string>();
  const [paused, setPaused] = useState(Boolean(initial.error));
  const [saveStatus, setSaveStatus] = useState('');
  const [message, setMessage] = useState(initial.error ?? initial.warning ?? '');
  const [promptOpen, setPromptOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inspectorMode, setInspectorMode] = useState<'properties' | 'theme'>('properties');
  const importRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selectedElement = document.elements.find(element => element.id === selected);
  useEffect(() => {
    if (paused) { setSaveStatus('Автосохранение приостановлено'); return; }
    try { saveDocument(document, storageKey); setSaveStatus('Сохранено на устройстве'); }
    catch { setSaveStatus('Не удалось сохранить'); setMessage('localStorage недоступен или переполнен. Сохраните документ через JSON-экспорт.'); }
  }, [document, paused, storageKey]);
  useEffect(() => { if (promptOpen) dialogRef.current?.showModal(); else dialogRef.current?.close(); }, [promptOpen]);
  const prompt = generatePrompt(document);
  const canvasThemeStyle = themeStyle(document.themeOverrides);
  return <>
    <header className="app-header"><div className="brand"><span className="brand-mark">W</span><div><strong>WDeaf <span>Builder</span></strong><small>Конструктор дизайн-системы</small></div><span className="badge">Sprint 02</span></div>
      <div className="header-actions"><AccountButton user={user} /><button onClick={() => importRef.current?.click()}><Icon name="upload-01" /> Импорт JSON</button><button onClick={() => exportDocument(document)}><Icon name="download-01" /> Экспорт JSON</button><button className="primary" onClick={() => { setCopied(false); setPromptOpen(true); }}>Сгенерировать промпт <Icon name="arrow-up-right" /></button></div>
    </header>
    <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
      try {
        if (file.size > 2_000_000) throw new Error('Файл превышает 2 МБ.');
        const raw = await file.text();
        const imported = parseDocument(raw);
        if (document.elements.length && !window.confirm('Заменить текущий холст импортированным документом? При необходимости сначала экспортируйте текущий.')) return;
        setDocument(imported); setSelected(undefined); setPaused(false); setMessage(migrationWarning(raw) ?? 'Документ импортирован.');
      } catch (error) { setMessage(`Импорт отклонён: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`); }
    }} />
    {message && <div className="notice" role="status"><span>{message}</span>{paused && <button onClick={() => { setPaused(false); setMessage(''); }}>Продолжить с текущим холстом</button>}<CloseButton label="Закрыть сообщение" size="s" onClick={() => setMessage('')} /></div>}
    <main className="workspace">
      <aside className="catalog panel"><div className="panel-heading"><h2>Компоненты</h2><span className="count">{registry.length}</span></div><p className="muted">Из библиотеки WDeaf PRO 2.0</p>
        <div className="catalog-list">{registry.map(entry => <button className="catalog-card" key={entry.id} disabled={document.elements.length >= 500} onClick={() => { const element = createElement(entry.id); setDocument(current => ({ ...current, elements: [...current.elements, element] })); setSelected(element.id); }}>
          <span className="catalog-sample" aria-hidden="true"><CatalogSample component={entry.id} /></span>
          <span className="catalog-label"><strong>{entry.label}</strong><Icon name="plus" /></span><small>Добавить на холст</small>
        </button>)}</div>
        <div className="catalog-note"><span className="eyebrow">ИСТОЧНИК</span><h3>Метаданные Figma</h3><p className="muted">Варианты сохранены из seed. Внешний вид — приближённый CSS-предпросмотр.</p><a href={figmaUrl} target="_blank" rel="noreferrer">Открыть дизайн-систему <Icon name="arrow-up-right" /></a></div>
        <div className="ai-note"><strong>AI-чат · следующий этап</strong><p className="muted">Пока доступна генерация задания. Подключения к LLM нет.</p></div>
      </aside>
      <section className="canvas-area"><div className="canvas-heading"><div><div className="eyebrow">РАБОЧАЯ ОБЛАСТЬ</div><h1>Ваш интерфейс</h1></div><span className="platform"><Icon name="globe-01" /> Web</span></div>
        <div className="canvas-meta"><span>{document.elements.length} элементов</span><span className="save-status">{saveStatus}</span></div>
        <div className="canvas-paper" style={canvasThemeStyle} data-color-override={Boolean(document.themeOverrides.primaryColor)} data-radius-override={document.themeOverrides.radiusPx !== undefined}>
          <div className="paper-caption"><span>Холст</span><span>Предпросмотр</span></div>
          {!document.elements.length ? <div className="empty-canvas"><div className="empty-icon"><Icon name="plus" /></div><h2>Начните с компонента</h2><p>Добавьте компонент из каталога слева.<br />Настройте варианты в инспекторе справа.</p><span className="badge">Пять компонентов из WDeaf.</span></div> : <div className="canvas-elements">{document.elements.map((element, index) => <article key={element.id} className={`canvas-item ${selected === element.id ? 'selected' : ''}`} onClick={() => setSelected(element.id)}>
            <div className="element-toolbar"><button className="element-select" aria-pressed={selected === element.id} onClick={() => setSelected(element.id)}><span>{String(index + 1).padStart(2, '0')}</span> {definition(element.component).label}</button><div className="element-actions">
              <button aria-label={`Переместить ${definition(element.component).label} ${index + 1} вверх`} disabled={index === 0} onClick={e => { e.stopPropagation(); setDocument(current => ({ ...current, elements: moveElement(current.elements, element.id, -1) })); }}><Icon name="arrow-up" /></button>
              <button aria-label={`Переместить ${definition(element.component).label} ${index + 1} вниз`} disabled={index === document.elements.length - 1} onClick={e => { e.stopPropagation(); setDocument(current => ({ ...current, elements: moveElement(current.elements, element.id, 1) })); }}><Icon name="arrow-down" /></button>
              <button aria-label={`Удалить ${definition(element.component).label} ${index + 1}`} onClick={e => { e.stopPropagation(); setDocument(current => ({ ...current, elements: current.elements.filter(item => item.id !== element.id) })); if (selected === element.id) setSelected(undefined); }}><Icon name="trash-01" /></button>
            </div></div><div className="component-preview"><Preview element={element} onChange={updated => setDocument(current => ({ ...current, elements: current.elements.map(item => item.id === updated.id ? updated : item) }))} /></div>
          </article>)}</div>}
        </div><p className="canvas-footnote">Приближённый предпросмотр · Геометрия компонентов не сверена с Figma</p>
      </section>
      <aside className="properties panel"><div className="inspector-tabs" role="group" aria-label="Режим инспектора"><button aria-pressed={inspectorMode === 'properties'} onClick={() => setInspectorMode('properties')}>Свойства</button><button aria-pressed={inspectorMode === 'theme'} onClick={() => setInspectorMode('theme')}>Тема</button></div>
        {inspectorMode === 'properties' ? <Inspector element={selectedElement} onChange={updated => setDocument(current => ({ ...current, elements: current.elements.map(element => element.id === updated.id ? updated : element) }))} /> : <ThemeEditor overrides={document.themeOverrides} onChange={themeOverrides => setDocument(current => ({ ...current, themeOverrides }))} />}
      </aside>
    </main>
    <dialog ref={dialogRef} onCancel={() => setPromptOpen(false)} onClose={() => setPromptOpen(false)}><div className="dialog-heading"><div><h2>Задание для AI-редактора</h2><p className="muted">Codex · Cursor · Claude Code</p></div><CloseButton label="Закрыть промпт" onClick={() => setPromptOpen(false)} /></div><textarea aria-label="Сгенерированный промпт" readOnly value={prompt} /><div className="dialog-footer"><span className="muted" role="status">{copied ? 'Текст скопирован' : 'Генерация локальная, без обращения к AI'}</span><button className="primary" onClick={async () => { try { await navigator.clipboard.writeText(prompt); setCopied(true); } catch { setCopied(false); setMessage('Буфер обмена недоступен. Выделите текст промпта и нажмите ⌘C.'); dialogRef.current?.querySelector('textarea')?.select(); } }}>Скопировать текст</button></div></dialog>
  </>;
}
createRoot(window.document.getElementById('root')!).render(<React.StrictMode><AccountGate>{user => <App key={user.id} user={user} />}</AccountGate></React.StrictMode>);
