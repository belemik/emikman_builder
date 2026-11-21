import { useEffect, useLayoutEffect, useReducer, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { initialWorkspaceState, libraries, projectById, projects, workById, workspaceReducer, type WorkspaceState } from './model';
import type { User } from '../account';
import { applicationHref } from '../application/navigation';
import { useWorkspaceTheme, ThemeSelect } from '../studio/Theme';
import { workspaceTokens } from './presentation';
import { Sidebar, MobileNavigation, useNarrow } from './Navigation';
import { Modal, WorkspaceHelp, WorkspaceSettings } from './Overlays';
import { Thread } from './ChatComposer';
import { ProjectCreationFlow } from './ProjectCreationFlow';
import { Editor, Libraries, ProjectPage } from './ProjectViews';
import { changePilot, initialHistory } from '../ux-pilot/model';
import { PilotEditor } from '../ux-pilot/PilotEditor';
import { emptyInspectorDrafts, getDirtyInspectorDrafts, INSPECTOR_EXIT_WARNING } from '../ux-pilot/inspector-drafts';
import { ProjectCovers, StudioHome } from './StudioHome';
import { ComponentBoard } from '../studio/ComponentBoard';
import { Glyph } from '../studio/Controls';
import { WebPageEditor, useEventSession } from '../web-page/WebPageEditor';
import { PersonalProjects, PersonalProjectEditor, type PersonalProjectsState } from '../application/PersonalProjects';

export function WorkspaceShell({ initial = initialWorkspaceState, active = true, user, accountAction, onDemoExit, onLaboratory, personalProjects, onPilotDraftState }: { initial?: WorkspaceState; active?: boolean; user?: User; accountAction?: ReactNode; onDemoExit?: () => void; onLaboratory?: (event: MouseEvent<HTMLAnchorElement>) => void; personalProjects?: PersonalProjectsState; onPilotDraftState?: (dirty: boolean, open: boolean) => void }) {
  const [state, dispatch] = useReducer(workspaceReducer, initial);
  const [pilot, dispatchPilot] = useReducer(changePilot, initialHistory);
  const [pilotDrafts, setPilotDrafts] = useState(emptyInspectorDrafts);
  const [pilotOpen, setPilotOpen] = useState(false);
  const [webPageOpen, setWebPageOpen] = useState(false);
  const webPageOpener = useRef<HTMLButtonElement>(null);
  const restoreWebPageFocus = useRef(false);
  const [pilotNavOpen, setPilotNavOpen] = useState(false);
  const [direction, setDirection] = useState('Web Design');
  const eventSession = useEventSession();
  const [chatOnly, setChatOnly] = useState(false);
  const [libraryTab, setLibraryTab] = useState<'board' | 'projects'>('projects');
  const opener = useRef<HTMLButtonElement>(null);
  const restorePilotFocus = useRef(false);
  const theme = useWorkspaceTheme(); const narrow = useNarrow();
  const content = useRef<HTMLDivElement>(null);
  const [modal, setModal] = useState<'settings' | 'help' | 'source' | 'technical' | 'history' | null>(null);
  const [source, setSource] = useState('');
  const [personalView, setPersonalView] = useState<'list' | 'create' | 'canvas' | null>(null);
  const allProjects = [...state.mockProjects, ...projects];
  const project = projectById(state.projectId, state.mockProjects) ?? projects[0];
  const work = state.workId ? workById(project.id, state.workId, state.mockProjects) : undefined;
  const menuShown = narrow ? state.navOpen : pilotOpen ? pilotNavOpen : state.sidebarOpen;
  const dirtyPilotDrafts = getDirtyInspectorDrafts(pilotDrafts, pilot.present);
  const pilotDirty = dirtyPilotDrafts.size > 0;
  useLayoutEffect(() => { onPilotDraftState?.(pilotDirty, pilotOpen); }, [onPilotDraftState, pilotDirty, pilotOpen]);
  function leavePilot() {
    if (pilotOpen && pilotDirty && !window.confirm(INSPECTOR_EXIT_WARNING + ' Выйти из редактора?')) return false;
    setPilotOpen(false);
    return true;
  }
  const closeNav = () => dispatch({ type: 'close-nav' });
  const focusComposer = () => requestAnimationFrame(() => content.current?.querySelector('textarea')?.focus());
  const newChat = () => {
    if (!leavePilot()) return;
    setChatOnly(true); setPersonalView(null);
    dispatch({ type: 'new-chat' }); focusComposer();
  };
  const showPersonal = (view: 'list' | 'create' | 'canvas') => {
    if (!leavePilot()) return;
    closeNav();
    setPersonalView(view);
  };
  const openModal = (next: 'settings' | 'help' | 'technical' | 'history') => { closeNav(); setModal(next); };
  const openSource = (label: string) => { setSource(label); setModal('source'); };
  const send = () => dispatch({ type: 'send-mock' });
  const onProject = (projectId: string) => { if (!leavePilot()) return; setPersonalView(null); dispatch({ type: 'select-project', projectId }); };
  const onOpen = (projectId: string, workId: string) => dispatch({ type: 'open-work', projectId, workId });
  useEffect(() => { if (!narrow) dispatch({ type: 'close-nav' }); }, [narrow]);
  useEffect(() => { content.current?.scrollTo({ top: 0 }); }, [state.view, state.projectId, state.scenarioId, personalView, pilotOpen]);
  useEffect(() => { if (!active) { dispatch({ type: 'close-nav' }); setModal(null); } }, [active]);
  useEffect(() => {
    if (!pilotOpen && restorePilotFocus.current) {
      restorePilotFocus.current = false;
      opener.current?.focus({ preventScroll: true });
    }
  }, [pilotOpen]);
  useEffect(() => {
    if (!webPageOpen && restoreWebPageFocus.current) {
      restoreWebPageFocus.current = false;
      webPageOpener.current?.focus();
    }
  }, [webPageOpen]);
  const toggleDesktop = () => pilotOpen ? setPilotNavOpen(value => !value) : dispatch({ type: 'toggle-sidebar' });
  const section = pilotOpen ? 'EMIKMAN' : personalView ? 'Мои проекты' : state.scenarioId && state.view === 'home' ? 'Новый проект'
    : state.view === 'home' ? (chatOnly ? 'AI-чат' : 'Главная') : state.view === 'libraries' ? 'Дизайн-системы' : 'Проекты';
  const home = (chat: boolean) => {
    if (!leavePilot()) return;
    setPersonalView(null); setChatOnly(chat);
    dispatch({ type: 'choose-scenario', scenarioId: null });
    if (chat) focusComposer();
  };
  const all = () => { if (!leavePilot()) return; setPersonalView(null); dispatch({ type: 'navigate', view: 'projects' }); };
  const covers = <ProjectCovers eventRef={webPageOpener} pilotRef={opener}
    onEvent={() => { closeNav(); setWebPageOpen(true); }}
    onPilot={() => { closeNav(); setPilotNavOpen(false); setPilotOpen(true); }}
    onBoard={() => { setLibraryTab('board'); dispatch({ type: 'navigate', view: 'libraries' }); }} />;
  const sidebar = (mobile: boolean) => <Sidebar mobile={mobile} section={section} allProjects={allProjects} recentIds={state.recentProjectIds} currentProject={state.view === 'projects' && !state.projectListOpen ? project.id : null}
    onHome={() => home(false)} onChat={() => home(true)} onNewChat={newChat} onAll={all}
    onHistory={() => openModal('history')} onLibraries={() => {
      if (!leavePilot()) return;
      setLibraryTab('projects'); closeNav(); setPersonalView(null); dispatch({ type: 'navigate', view: 'libraries' });
    }}
    onPersonal={personalProjects ? () => showPersonal('list') : undefined} onProject={onProject}
    onToggle={mobile ? closeNav : toggleDesktop} onSettings={() => openModal('settings')} onHelp={() => openModal('help')} onTechnical={() => openModal('technical')} user={user} accountAction={accountAction} onDemoExit={onDemoExit} />;
  if (webPageOpen) {
    return <div className="zarya zs-platform" data-zarya-mode={theme.mode} data-zarya-scheme={theme.scheme}>
      <WebPageEditor session={eventSession} onBack={() => { restoreWebPageFocus.current = true; setWebPageOpen(false); }} />
    </div>;
  }
  if (personalView === 'canvas' && personalProjects?.project) {
    return <div style={workspaceTokens} data-zarya-mode={theme.mode} data-zarya-scheme={theme.scheme}>
      <PersonalProjectEditor project={personalProjects.project} onChange={personalProjects.setProject} onBack={() => showPersonal('list')} />
    </div>;
  }
  return <div className="zarya zs-platform" data-view={pilotOpen ? 'pilot' : state.view} data-zarya-mode={theme.mode} data-zarya-scheme={theme.scheme}>
    {!narrow && menuShown && <aside className="z-sidebar" aria-label="Разделы Workspace">{sidebar(false)}</aside>}
    <div className="z-main">
      <header className="z-header"><div>{(!menuShown || narrow) && <button type="button" className="z-button" data-menu-trigger aria-label="Открыть меню" aria-expanded={menuShown} onClick={narrow ? () => dispatch({ type: 'toggle-nav' }) : toggleDesktop}><Glyph name="panel" /><span className="z-sr">Меню</span></button>}<span className="zs-crumb">Workspace</span><span aria-hidden="true">/</span><strong>{section}</strong></div>
        <ThemeSelect />{onDemoExit && <a className="zs-lab-link" href={applicationHref('laboratory')} onClick={onLaboratory} aria-label="Попробовать редактор" title="Лаборатория компонентов"><Glyph name="grid" /><span>Лаборатория</span></a>}
        {!personalView && <button className="z-button zs-create" onClick={() => {
          if (personalProjects) showPersonal(personalProjects.project ? 'list' : 'create');
          else if (leavePilot()) dispatch({ type: 'choose-scenario', scenarioId: 'scratch' });
        }}><Glyph name="plus" />{personalProjects?.project ? 'Открыть мои проекты' : personalProjects ? 'Создать проект' : 'Новый проект'}</button>}
      </header>
      <div className={`z-content ${!personalView && state.view === 'editor' ? 'z-editor-content' : ''}`} ref={content}>
        {pilotOpen ? <PilotEditor history={pilot} dispatch={dispatchPilot} dirtyDrafts={dirtyPilotDrafts} setDrafts={setPilotDrafts} onBack={() => {
          if (leavePilot()) restorePilotFocus.current = true;
        }} /> : personalProjects && (personalView === 'list' || personalView === 'create') ? <PersonalProjects
          mode={personalView} project={personalProjects.project}
          onCreate={project => { personalProjects.setProject(project); showPersonal('canvas'); }}
          onNavigate={showPersonal}
        /> : <>
        {state.view === 'home' && (state.scenarioId ? <ProjectCreationFlow key={state.scenarioId} scenarioId={state.scenarioId} onCreate={brief => dispatch({ type: 'create-mock-project', brief })} onCancel={() => dispatch({ type: 'choose-scenario', scenarioId: null })} /> : <StudioHome direction={direction} onDirection={setDirection} state={state} chatOnly={chatOnly}
          onDraft={draft => dispatch({ type: 'set-draft', draft })} onSend={send} onSource={openSource}
          onScenario={scenarioId => dispatch({ type: 'choose-scenario', scenarioId })} onAll={all}
          onExample={() => onOpen(projects[0].id, projects[0].works[0].id)}>{covers}</StudioHome>)}
        {state.view === 'projects' && <ProjectPage state={state} project={project} allProjects={allProjects} onProject={onProject} onSection={section => dispatch({ type: 'project-section', section })} onOpen={onOpen} onLibrary={libraryId => dispatch({ type: 'select-library', libraryId })} covers={covers} />}
        {state.view === 'libraries' && <main className="zs-library"><div className="zs-switch" role="group" aria-label="Каталог">
          <button aria-pressed={libraryTab === 'board'} onClick={() => setLibraryTab('board')}>ZARYA DS</button>
          <button aria-pressed={libraryTab === 'projects'} onClick={() => setLibraryTab('projects')}>Библиотеки проектов</button></div>
          {libraryTab === 'board' ? <ComponentBoard /> : <Libraries libraryId={state.libraryId ?? libraries[0].id} onSelect={libraryId => dispatch({ type: 'select-library', libraryId })} />}</main>}
        {state.view === 'editor' && work && <Editor state={state} project={project} work={work} onBack={() => onProject(project.id)} onElement={elementId => dispatch({ type: 'select-element', elementId })} onTab={tab => dispatch({ type: 'set-tab', tab })} onViewport={viewport => dispatch({ type: 'set-viewport', viewport })} onChat={() => dispatch({ type: 'toggle-chat' })} onDraft={draft => dispatch({ type: 'set-draft', draft })} onSend={send} onSource={openSource} />}
        </>}
      </div>
    </div>
    <MobileNavigation open={active && narrow && state.navOpen} onClose={closeNav} content={content}>{sidebar(true)}</MobileNavigation>
    <Modal title="Технический раздел" open={active && modal === 'technical'} onClose={() => setModal(null)}><div className="z-modal-body"><h3>Лаборатория компонентов</h3><p>Технический раздел ЗАРЯ: JSON, варианты, Renderer, Validator, Theme Editor и локальный экспериментальный холст. Он не связан с Canvas проекта и не является готовым каталогом дизайн-систем.</p><p>Проект Workspace останется в памяти при обычном переходе и возврате. Перезагрузка страницы сбрасывает mock-данные.</p><a href={applicationHref('laboratory')} onClick={event => { setModal(null); onLaboratory?.(event); }}>Открыть лабораторию компонентов</a></div></Modal>
    <Modal title="История обсуждения" open={active && modal === 'history'} onClose={() => setModal(null)}>
      <div className="z-modal-body"><p>Сообщения текущего общего чата.</p>
        {state.thread.length ? <Thread messages={state.thread} /> : <p>Сообщений пока нет.</p>}
      </div>
    </Modal>
    <Modal title="Настройки" open={active && modal === 'settings'} onClose={() => setModal(null)}><WorkspaceSettings mode={theme.mode} onTheme={theme.choose} /></Modal>
    <Modal title="Справка" open={active && modal === 'help'} onClose={() => setModal(null)}><WorkspaceHelp /></Modal>
    <Modal returnFocusSelector="[data-source-trigger]" title={source || 'Источник'} open={active && modal === 'source'} onClose={() => setModal(null)}><div className="z-modal-body"><span className="z-badge">Пока недоступно</span><p>Это интерфейс демонстрации. Файл, Figma, сайт и референс не загружаются и не анализируются. Запрос не отправлен, источник не подключён.</p>
      {source === 'Выбрать дизайн-систему' && <button type="button" className="z-button" onClick={() => { setModal(null); setLibraryTab('projects'); dispatch({ type: 'navigate', view: 'libraries' }); }}>Посмотреть демонстрационный список</button>}
    </div></Modal>
  </div>;
}
