import { useId, useRef } from 'react';
import { ChatComposer, Thread } from './ChatComposer';
import { libraries, projectChatFor, type InspectorTab, type MockElement, type MockProject, type MockWork, type ProjectSection, type WorkspaceState } from './model';

const sections: readonly [ProjectSection, string][] = [['canvas', 'Canvas'], ['sources', 'Источники'], ['libraries', 'Дизайн-система'], ['files', 'Файлы'], ['references', 'Референсы'], ['history', 'История'], ['settings', 'Настройки проекта']];
export function ProjectPage({ project, allProjects, state, onProject, onSection, onOpen, onLibrary }: {
  project: MockProject; allProjects: readonly MockProject[]; state: WorkspaceState; onProject: (id: string) => void;
  onSection: (section: ProjectSection) => void; onOpen: (projectId: string, workId: string) => void; onLibrary: (id: string) => void;
}) {
  const firstWork = project.works[0];
  if (state.projectListOpen) return <section className="z-page z-project-page">
    <div className="z-page-heading"><p className="z-eyebrow">Локальная демонстрация</p><h1>Проекты</h1><p className="z-muted">Примеры и черновики этой сессии. После перезагрузки новые mock-проекты исчезнут.</p></div>
    <div className="z-project-grid">{allProjects.map(item => <button type="button" className="z-project-card" key={item.id} aria-current={item.id === project.id ? 'true' : undefined} onClick={() => onProject(item.id)}>
      <span className="z-card-preview" aria-hidden="true"><span/><span/><span/></span><strong>{item.name}</strong><small>{item.client}</small><span className="z-card-caption">mock · {item.works.length} работ</span>
    </button>)}</div>
  </section>;
  return <section className="z-page z-project-page">
    <div className="z-project-heading"><div><span className="z-badge">mock · React state</span><h2>{project.name}</h2><p className="z-muted">{project.client}</p></div><button type="button" className="z-button z-primary" disabled={!firstWork} title={firstWork ? undefined : 'В проекте пока нет работ для открытия Canvas.'} onClick={() => { if (firstWork) onOpen(project.id, firstWork.id); }}>Открыть Canvas</button></div>
    <nav className="z-project-nav" aria-label="Разделы проекта">{sections.map(([id, label]) => <button type="button" className="z-button" key={id} aria-current={state.projectSection === id ? 'page' : undefined} onClick={() => onSection(id)}>{label}</button>)}</nav>
    {state.projectSection === 'canvas' && !firstWork && <Unavailable title="Пока нет работ" reason="В этом mock-проекте нет работ для открытия Canvas. Создание и сохранение работ пока недоступны." />}
    {state.projectSection === 'canvas' && firstWork && <><p className="z-notice">Canvas ниже — демонстрационный макет. Генерация AI и проверка DS Contract не выполнялись.</p><ul className="z-works">{project.works.map(work => <li key={work.id}><h3>{work.name}</h3><p className="z-muted">{work.summary}</p><button type="button" className="z-button" onClick={() => onOpen(project.id, work.id)}>Открыть работу</button></li>)}</ul></>}
    {state.projectSection === 'libraries' && <Libraries libraryId={state.libraryId} onSelect={onLibrary} embedded />}
    {state.projectSection === 'sources' && <Unavailable title="Источники" reason="Импорт Figma, файлов и сайтов пока недоступен. Ничего не загружалось и не анализировалось.">{project.brief?.source && <p>Указанная ссылка (только текст): {project.brief.source}</p>}</Unavailable>}
    {state.projectSection === 'references' && <Unavailable title="Референсы" reason="Анализ референсов пока недоступен.">{project.brief?.references && <p className="z-preserve">Описание: {project.brief.references}</p>}</Unavailable>}
    {state.projectSection === 'files' && <Unavailable title="Файлы" reason="Пока недоступно: загрузка и сохранение файлов не подключены." />}
    {state.projectSection === 'history' && <Unavailable title="История проекта" reason="Постоянная история не ведётся. Записей нет; это не audit или undo." />}
    {state.projectSection === 'settings' && <Unavailable title="Настройки проекта" reason="Изменение настроек пока недоступно. Название и описание — только метаданные локального mock."><p className="z-preserve">{project.brief?.description ?? project.client}</p><p>Шаблоны и участники — будущие возможности, не подключены.</p></Unavailable>}
  </section>;
}
function Unavailable({ title, reason, children }: { title: string; reason: string; children?: React.ReactNode }) {
  return <section className="z-empty"><h3>{title}</h3><p>{reason}</p>{children}</section>;
}

export function Libraries({ libraryId, onSelect, embedded = false }: { libraryId: string; onSelect: (id: string) => void; embedded?: boolean }) {
  const selected = libraries.find(item => item.id === libraryId) ?? libraries[0];
  return <section className={embedded ? 'z-libraries' : 'z-page z-libraries'}>
    <h2>Дизайн-системы</h2><p className="z-muted">Только демонстрационный список. Источники не опрашиваются и не синхронизируются.</p>
    <div className="z-table-wrap"><table><caption className="z-sr">Примеры дизайн-систем</caption><thead><tr><th>Название</th><th>Версия</th><th>Компоненты</th><th>Источник</th><th>Статус</th></tr></thead><tbody>{libraries.map(item => <tr key={item.id} data-selected={selected.id === item.id}>
      <td><button type="button" className="z-button z-text-button" aria-pressed={selected.id === item.id} onClick={() => onSelect(item.id)}>{item.name}</button><small>{item.note}</small></td><td>{item.version}</td><td>{item.components}</td><td>{item.source}</td><td>{item.status}</td>
    </tr>)}</tbody></table></div><p className="z-notice">{selected.note}</p>
    <button className="z-button" type="button" disabled title="Пока недоступно: интеграция источников не реализована.">Подключить источник</button>
  </section>;
}

const tabs: readonly [InspectorTab, string][] = [['params', 'Параметры'], ['history', 'История'], ['comments', 'Комменты'], ['review', 'Проверка']];
export function Editor({ state, project, work, onBack, onElement, onTab, onViewport, onChat, onDraft, onSend, onSource }: {
  state: WorkspaceState; project: MockProject; work: MockWork; onBack: () => void; onElement: (id: string) => void;
  onTab: (tab: InspectorTab) => void; onViewport: (viewport: 'desktop' | 'mobile') => void; onChat: () => void;
  onDraft: (text: string) => void; onSend: () => void; onSource: (source: string) => void;
}) {
  const chat = projectChatFor(state);
  const element = work.elements.find(item => item.id === state.elementId) ?? work.elements[0];
  return <section className="z-editor" aria-label="Демонстрационный Canvas">
    <header className="z-editor-head"><button type="button" className="z-button" aria-label="Вернуться к проектам" onClick={onBack}>К проекту</button><div className="z-work-title"><strong>{work.name}</strong><small>{project.name} · mock</small></div>
      <div className="z-devices" role="group" aria-label="Просмотр размера">{(['desktop', 'mobile'] as const).map(mode => <button className="z-button" key={mode} type="button" aria-pressed={state.viewport === mode} onClick={() => onViewport(mode)}>{mode === 'desktop' ? 'Desktop' : 'Mobile'}</button>)}</div>
      <button type="button" className="z-button" onClick={() => onTab('review')}>Проверка</button>
    </header>
    <div className="z-editor-grid"><aside className="z-layers" aria-label="Структура интерфейса"><h2>Слои и компоненты</h2><p className="z-muted">Layers · выбор элемента</p><ul>{work.elements.map(item => <li key={item.id}><button type="button" className="z-layer" aria-current={element.id === item.id ? 'true' : undefined} onClick={() => onElement(item.id)}><small>{item.kind}</small>{item.name}</button></li>)}</ul><p className="z-muted">WDeaf показана как пример. Контракт здесь не проверяется.</p></aside>
      <div className="z-stage"><Canvas work={work} viewport={state.viewport} selected={element.id} onElement={onElement} />
        <div className="z-context"><button className="z-button" type="button" aria-expanded={state.chatOpen} onClick={onChat}>{state.chatOpen ? 'Скрыть чат' : 'Контекстный чат'}</button>
          {state.chatOpen && <><Thread messages={chat.thread} /><ChatComposer compact draft={chat.draft} onDraft={onDraft} onSend={onSend} onSource={onSource} /></>}
        </div>
      </div>
      <Inspector element={element} tab={state.tab} onTab={onTab} />
    </div>
  </section>;
}

function Inspector({ element, tab, onTab }: { element: MockElement; tab: InspectorTab; onTab: (tab: InspectorTab) => void }) {
  const id = useId(); const tablist = useRef<HTMLDivElement>(null);
  return <aside className="z-inspector" aria-label="Инспектор"><h2>Свойства и проверка</h2><div role="tablist" aria-label="Разделы инспектора" ref={tablist} onKeyDown={event => {
    if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
      const at = tabs.findIndex(item => item[0] === tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (at + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault(); onTab(tabs[next][0]); tablist.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    }
  }}>{tabs.map(([value, label]) => <button type="button" role="tab" key={value} id={`${id}-${value}`} aria-controls={`${id}-panel`} tabIndex={tab === value ? 0 : -1} aria-selected={tab === value} onClick={() => onTab(value)}>{label}</button>)}</div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} tabIndex={0}>
      {tab === 'params' && <><h3>{element.name}</h3><p className="z-muted">Пример свойств. Значения не записываются.</p><dl><dt>Тип</dt><dd>{element.kind}</dd><dt>Заметка</dt><dd>{element.note}</dd></dl><button type="button" className="z-button" disabled title="Демонстрация. Холст Builder не изменяется.">Применить к холсту</button><p className="z-muted">Apply и Trusted Admission не подключены.</p></>}
      {tab === 'history' && <><h3>История</h3><p>Записей нет. Демонстрация не ведёт журнал и не сохраняет шаги.</p></>}
      {tab === 'comments' && <><h3>Комменты</h3><p>Пример: «Посмотреть отступ заголовка». Это не сообщение участника.</p><label>Комментарий<textarea disabled placeholder="Недоступно в демо" /></label><button className="z-button" type="button" disabled title="Комментарии пока не отправляются.">Добавить комментарий</button></>}
      {tab === 'review' && <><h3>Проверка</h3><p>Политика JSON здесь не запускается. Статус проверки не выдан. Совпадение с Figma не измерялось.</p><button className="z-button" type="button" disabled title="Демонстрация. Проверка не выполняется.">Запустить проверку</button></>}
    </div>
  </aside>;
}

function Canvas({ work, viewport, selected, onElement }: { work: MockWork; viewport: 'desktop' | 'mobile'; selected: string; onElement: (id: string) => void }) {
  const selection = (id: string) => selected === id ? 'z-selected' : '';
  const registration = work.elements.some(item => item.id === 'password');
  return <div className={`z-frame ${viewport}`} data-testid="workspace-artboard" aria-label="Макет, только выбор элементов">
    <div className="z-site-top"><b>nexa.</b><span>Помощь · RU</span></div>
    {registration ? <div className="z-site"><h2><button type="button" className={`z-artboard-heading ${selection('heading')}`} onClick={() => onElement('heading')}>Создайте аккаунт</button></h2><p>Начните работать с командой за несколько минут</p>
      <label className={selection('email')}>Рабочий email<input className="wdeaf-input" readOnly value="name@company.ru" onFocus={() => onElement('email')} onClick={() => onElement('email')} /></label>
      <label className={selection('password')}>Пароль<input className="wdeaf-input" readOnly value="Не менее 8 символов" onFocus={() => onElement('password')} onClick={() => onElement('password')} /></label>
      <button type="button" className={`z-artboard-hint ${selection('hint')}`} onClick={() => onElement('hint')}>Используйте буквы, цифры и специальный символ</button>
      <button type="button" className={`wdeaf-button ${selection('button')}`} aria-label="Выбрать Button / Продолжить на макете" title="Выбрать элемент для Inspector, без отправки формы" onClick={() => onElement('button')}>Продолжить</button>
    </div> : <div className="z-site"><h2>{work.name}</h2>{work.elements.map(item => <button key={item.id} type="button" className={`wdeaf-button ${selection(item.id)}`} onClick={() => onElement(item.id)}>{item.name}</button>)}</div>}
    <p className="z-artboard-note">Макет для просмотра. Это не документ Schema v3 и не холст Builder.</p>
  </div>;
}
