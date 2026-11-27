import { useEffect, useRef, useState } from 'react';
import { DSRenderer } from '../renderer/DSRenderer';
import { prepareRender } from '../renderer/prepare';
import { screenFromCanvas } from '../renderer/boundary';
import { registry, definition, figmaUrl } from '../registry';
import { createElement, moveElement, type CanvasDocument, type CanvasElement } from './model';
import { Preview } from './Preview';
import { Inspector } from '../inspector';
import { ThemeEditor } from '../theme';
import { themeStyle } from '../theme/model';
import { Icon } from '../ui';
import { CatalogSample } from '../ui/CatalogSample';

type Props = {
  document: CanvasDocument;
  setDocument: (update: (current: CanvasDocument) => CanvasDocument) => void;
  strict: boolean;
  setStrict: (strict: boolean) => void;
  selected?: string;
  setSelected: (id?: string) => void;
  title?: string;
  saveStatus?: string;
  project?: boolean;
};

export function CanvasEditor({
  document, setDocument, strict, setStrict, selected, setSelected,
  title = 'Экспериментальный холст', saveStatus, project = false,
}: Props) {
  const [inspectorMode, setInspectorMode] = useState<'properties' | 'theme'>('properties');
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (project) titleRef.current?.focus(); }, [project]);
  const selectedElement = document.elements.find(element => element.id === selected);
  const screen = screenFromCanvas(document);
  const canvasThemeStyle = themeStyle(document.themeOverrides);
  const changeElement = (updated: CanvasElement) =>
    setDocument(current => ({ ...current, elements: current.elements.map(item => item.id === updated.id ? updated : item) }));
  const validation = project && strict ? prepareRender(screen) : null;
  const validationMessage = validation?.valid ? 'Документ прошёл строгую проверку.' : 'Документ содержит ошибки. Проверьте диагностику на холсте.';
  const entries = registry.filter(entry => !entry.internal && (!project || !['textarea', 'button-icon'].includes(entry.id)));
  return (
    <main className={project ? "workspace project-canvas" : "workspace"}>
      <aside className="catalog panel"><div className="panel-heading"><h2>Компоненты</h2><span className="count">{entries.length}</span></div><p className="muted">Из библиотеки WDeaf PRO 2.0</p>
        <div className="catalog-list">{entries.map(entry => <button className="catalog-card" key={entry.id} disabled={document.elements.length >= 500} onClick={() => { const element = createElement(entry.id); setDocument(current => ({ ...current, elements: [...current.elements, element] })); setSelected(element.id); }}>
          <span className="catalog-sample" aria-hidden="true"><CatalogSample component={entry.id} /></span>
          <span className="catalog-label"><strong>{entry.label}</strong><Icon name="plus" /></span><small>Добавить на холст</small>
        </button>)}</div>
        {!project && <><div className="catalog-note"><span className="eyebrow">ИСТОЧНИК</span><h3>Метаданные Figma</h3><p className="muted">Варианты и ссылки сохранены из Figma. Для проверенной реализации включите строгий DS Renderer.</p><a href={figmaUrl} target="_blank" rel="noreferrer">Открыть дизайн-систему <Icon name="arrow-up-right" /></a></div>
        <div className="ai-note"><strong>Локальный генератор промптов</strong><p className="muted">Формирует текст задания без LLM. Это технический инструмент лаборатории.</p></div></>}
      </aside>
      <section className="canvas-area"><div className="canvas-heading"><div><div className="eyebrow">РАБОЧАЯ ОБЛАСТЬ</div><h1 tabIndex={project ? -1 : undefined} ref={titleRef}>{title}</h1></div><span className="platform"><Icon name="globe-01" /> Web</span></div>
        <div className="canvas-meta"><span>{document.elements.length} элементов</span>{saveStatus && <span className="save-status">{saveStatus}</span>}</div>
        <div className="renderer-mode"><button aria-pressed={!strict} onClick={() => setStrict(false)}>Редакторский preview</button><button aria-pressed={strict} onClick={() => setStrict(true)}>{project ? "Проверить документ" : "Строгий DS Renderer"}</button><small>{strict ? 'Оригинальная тема Figma · без overrides' : 'Пользовательские overrides · приближённый preview'}</small></div>
        {project && strict && <p role="status">{validationMessage}</p>}
        <div className="canvas-paper" style={canvasThemeStyle} data-color-override={Boolean(document.themeOverrides.primaryColor)} data-radius-override={document.themeOverrides.radiusPx !== undefined}>
          <div className="paper-caption"><span>Холст</span><span>Предпросмотр</span></div>
          {strict ? <DSRenderer screen={screen} onRemove={id=>setDocument(current=>({...current,elements:current.elements.filter(item=>item.id!==id)}))} onSelect={setSelected} onChange={changeElement} /> : !document.elements.length ? <div className="empty-canvas"><div className="empty-icon"><Icon name="plus" /></div><h2>Начните с компонента</h2><p>{project ? <>Добавьте компонент из каталога.<br />Настройте его свойства в инспекторе.</> : <>Добавьте компонент из каталога слева.<br />Настройте варианты в инспекторе справа.</>}</p><span className="badge">Компоненты WDeaf PRO 2.0.</span></div> : <div className="canvas-elements">{document.elements.map((element, index) => <article key={element.id} className={`canvas-item ${selected === element.id ? 'selected' : ''}`} onClick={() => setSelected(element.id)}>
            <div className="element-toolbar"><button className="element-select" aria-pressed={selected === element.id} onClick={() => setSelected(element.id)}><span>{String(index + 1).padStart(2, '0')}</span> {definition(element.component).label}</button><div className="element-actions">
              <button aria-label={`Переместить ${definition(element.component).label} ${index + 1} вверх`} disabled={index === 0} onClick={e => { e.stopPropagation(); setDocument(current => ({ ...current, elements: moveElement(current.elements, element.id, -1) })); }}><Icon name="arrow-up" /></button>
              <button aria-label={`Переместить ${definition(element.component).label} ${index + 1} вниз`} disabled={index === document.elements.length - 1} onClick={e => { e.stopPropagation(); setDocument(current => ({ ...current, elements: moveElement(current.elements, element.id, 1) })); }}><Icon name="arrow-down" /></button>
              <button aria-label={`Удалить ${definition(element.component).label} ${index + 1}`} onClick={e => { e.stopPropagation(); setDocument(current => ({ ...current, elements: current.elements.filter(item => item.id !== element.id) })); if (selected === element.id) setSelected(undefined); }}><Icon name="trash-01" /></button>
            </div></div><div className="component-preview"><Preview element={element} onRemove={()=>setDocument(current=>({...current,elements:current.elements.filter(item=>item.id!==element.id)}))} onChange={changeElement} /></div>
          </article>)}</div>}
        </div><p className="canvas-footnote">{strict ? 'Оригинальная тема Figma · поддержка определяется проверенной матрицей вариантов' : 'Приближённый предпросмотр · пользовательские настройки не являются токенами Figma'}</p>
      </section>
      <aside className="properties panel"><div className="inspector-tabs" role="group" aria-label="Режим инспектора"><button aria-pressed={inspectorMode === 'properties'} onClick={() => setInspectorMode('properties')}>Свойства</button><button aria-pressed={inspectorMode === 'theme'} onClick={() => setInspectorMode('theme')}>Тема</button></div>
        {inspectorMode === 'properties' ? <Inspector element={selectedElement} onChange={changeElement} /> : <ThemeEditor overrides={document.themeOverrides} onChange={themeOverrides => setDocument(current => ({ ...current, themeOverrides }))} />}
      </aside>
    </main>
  );
}
