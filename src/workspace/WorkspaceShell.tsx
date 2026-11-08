import { useEffect, useReducer, useRef, useState } from 'react';
import { initialWorkspaceState, libraries, projectById, projects, scenarios, workById, workspaceReducer, type WorkspaceState } from './model';
import { useWorkspaceTheme } from './theme';
import { workspaceTokens } from './presentation';
import { Sidebar, MobileNavigation, useNarrow } from './Navigation';
import { Modal, WorkspaceHelp, WorkspaceSettings } from './Overlays';
import { ChatComposer, Thread } from './ChatComposer';
import { ProjectCreationFlow } from './ProjectCreationFlow';
import { Editor, Libraries, ProjectPage } from './ProjectViews';

export function WorkspaceShell({ initial = initialWorkspaceState }: { initial?: WorkspaceState }) {
  const [state, dispatch] = useReducer(workspaceReducer, initial);
  const theme = useWorkspaceTheme(); const narrow = useNarrow();
  const content = useRef<HTMLDivElement>(null);
  const [modal, setModal] = useState<'settings' | 'help' | 'source' | null>(null);
  const [source, setSource] = useState('');
  const allProjects = [...state.mockProjects, ...projects];
  const project = projectById(state.projectId, state.mockProjects) ?? projects[0];
  const work = state.workId ? workById(project.id, state.workId, state.mockProjects) : undefined;
  const menuShown = narrow ? state.navOpen : state.sidebarOpen;
  const closeNav = () => dispatch({ type: 'close-nav' });
  const newChat = () => dispatch({ type: 'new-chat' });
  const openModal = (next: 'settings' | 'help') => { closeNav(); setModal(next); };
  const openSource = (label: string) => { setSource(label); setModal('source'); };
  const send = () => dispatch({ type: 'send-mock' });
  const onProject = (projectId: string) => dispatch({ type: 'select-project', projectId });
  const onOpen = (projectId: string, workId: string) => dispatch({ type: 'open-work', projectId, workId });
  useEffect(() => { if (!narrow) dispatch({ type: 'close-nav' }); }, [narrow]);
  useEffect(() => { content.current?.scrollTo({ top: 0 }); }, [state.view, state.projectId, state.scenarioId]);
  useEffect(() => { const prior = document.title; document.title = 'ЗАРЯ — Workspace demo'; return () => { document.title = prior; }; }, []);
  const sidebar = (mobile: boolean) => <Sidebar mobile={mobile} allProjects={allProjects} recentIds={state.recentProjectIds} currentProject={state.view === 'projects' || state.view === 'editor' ? project.id : null}
    onHome={newChat} onAll={() => dispatch({ type: 'navigate', view: 'projects' })} onProject={onProject}
    onToggle={mobile ? closeNav : () => dispatch({ type: 'toggle-sidebar' })} onSettings={() => openModal('settings')} onHelp={() => openModal('help')} />;
  return <div className="zarya" style={workspaceTokens} data-view={state.view} data-zarya-mode={theme.mode} data-zarya-scheme={theme.scheme}>
    {!narrow && state.sidebarOpen && <aside className="z-sidebar" aria-label="Разделы Workspace">{sidebar(false)}</aside>}
    <div className="z-main">
      <header className="z-header"><div>{(!menuShown || narrow) && <button type="button" className="z-button" data-menu-trigger aria-label="Открыть меню" aria-expanded={menuShown} onClick={() => dispatch({ type: narrow ? 'toggle-nav' : 'toggle-sidebar' })}>Меню</button>}</div>
        <span className="z-demo-label">Workspace · mock</span><a className="z-builder-link" href="./">Текущий Builder</a>
      </header>
      <div className={`z-content ${state.view === 'editor' ? 'z-editor-content' : ''}`} ref={content}>
        {state.view === 'home' && (state.scenarioId ? <ProjectCreationFlow key={state.scenarioId} scenarioId={state.scenarioId} onCreate={brief => dispatch({ type: 'create-mock-project', brief })} onCancel={() => dispatch({ type: 'choose-scenario', scenarioId: null })} /> : <main className="z-home">
          <div className="z-hero"><p className="z-eyebrow">Идея начинается с разговора</p><h1>{state.thread.length ? 'Обсудим вашу идею' : 'Что создадим сегодня?'}</h1><p>Соберите направление для интерфейса. Сейчас — только демонстрация.</p></div>
          {!!state.thread.length && <><Thread messages={state.thread} /><div className="z-notice"><p>Пример плана, не ответ модели. Компоненты не подобраны и не проверены. Холст не изменён.</p><button className="z-button" type="button" onClick={() => onOpen(projects[0].id, projects[0].works[0].id)}>Открыть пример в Canvas</button></div></>}
          <ChatComposer draft={state.draft} onDraft={draft => dispatch({ type: 'set-draft', draft })} onSend={send} onSource={openSource} />
          <div className="z-scenarios" aria-label="Сценарии создания">{scenarios.map(item => <button type="button" className="z-scenario" key={item.id} onClick={() => dispatch({ type: 'choose-scenario', scenarioId: item.id })}><strong>{item.title}</strong><small>{item.note}</small></button>)}</div>
          <p className="z-home-note">Без подключения LLM, импорта и сохранения проектов</p>
        </main>)}
        {state.view === 'projects' && <ProjectPage state={state} project={project} allProjects={allProjects} onProject={onProject} onSection={section => dispatch({ type: 'project-section', section })} onOpen={onOpen} onLibrary={libraryId => dispatch({ type: 'select-library', libraryId })} />}
        {state.view === 'libraries' && <Libraries libraryId={state.libraryId ?? libraries[0].id} onSelect={libraryId => dispatch({ type: 'select-library', libraryId })} />}
        {state.view === 'editor' && work && <Editor state={state} project={project} work={work} onBack={() => onProject(project.id)} onElement={elementId => dispatch({ type: 'select-element', elementId })} onTab={tab => dispatch({ type: 'set-tab', tab })} onViewport={viewport => dispatch({ type: 'set-viewport', viewport })} onChat={() => dispatch({ type: 'toggle-chat' })} onDraft={draft => dispatch({ type: 'set-draft', draft })} onSend={send} onSource={openSource} />}
      </div>
    </div>
    <MobileNavigation open={narrow && state.navOpen} onClose={closeNav} content={content}>{sidebar(true)}</MobileNavigation>
    <Modal title="Настройки" open={modal === 'settings'} onClose={() => setModal(null)}><WorkspaceSettings mode={theme.mode} onTheme={theme.choose} /></Modal>
    <Modal title="Справка" open={modal === 'help'} onClose={() => setModal(null)}><WorkspaceHelp /></Modal>
    <Modal returnFocusSelector="[data-source-trigger]" title={source || 'Источник'} open={modal === 'source'} onClose={() => setModal(null)}><div className="z-modal-body"><span className="z-badge">Пока недоступно</span><p>Это интерфейс демонстрации. Файл, Figma, сайт и референс не загружаются и не анализируются. Запрос не отправлен, источник не подключён.</p>
      {source === 'Выбрать дизайн-систему' && <button type="button" className="z-button" onClick={() => { setModal(null); dispatch({ type: 'navigate', view: 'libraries' }); }}>Посмотреть демонстрационный список</button>}
    </div></Modal>
  </div>;
}
