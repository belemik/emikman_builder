export type WorkspaceView = 'home' | 'projects' | 'libraries' | 'editor';
export type InspectorTab = 'params' | 'history' | 'comments' | 'review';
export type ViewportMode = 'desktop' | 'mobile';
export type ScenarioId = 'scratch' | 'figma' | 'redesign' | 'prototype';
export type ProjectSection = 'canvas' | 'sources' | 'libraries' | 'files' | 'references' | 'history' | 'settings';
export type MockProjectBrief = {
  readonly scenario: ScenarioId;
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly source: string;
  readonly references: string;
  readonly library: 'wdeaf' | 'none';
};

export type MockElement = {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly note: string;
};

export type MockWork = {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly elements: readonly MockElement[];
};

export type MockProject = {
  readonly id: string;
  readonly name: string;
  readonly client: string;
  readonly works: readonly MockWork[];
  readonly brief?: MockProjectBrief;
};

export type MockLibrary = {
  readonly id: string;
  readonly name: string;
  readonly note: string;
  readonly version: string;
  readonly components: string;
  readonly source: string;
  readonly status: string;
};

export type MockMessage = {
  readonly role: 'user' | 'mock';
  readonly text: string;
};

export type MockChat = {
  readonly draft: string;
  readonly thread: readonly MockMessage[];
};

export type WorkspaceState = {
  readonly view: WorkspaceView;
  readonly projectId: string;
  readonly workId: string | null;
  readonly elementId: string | null;
  readonly libraryId: string;
  readonly tab: InspectorTab;
  readonly viewport: ViewportMode;
  readonly navOpen: boolean;
  readonly sidebarOpen: boolean;
  readonly chatOpen: boolean;
  readonly draft: string;
  readonly thread: readonly MockMessage[];
  readonly projectChats: ReadonlyMap<string, MockChat>;
  readonly mockProjects: readonly MockProject[];
  readonly projectSection: ProjectSection;
  readonly projectListOpen: boolean;
  readonly scenarioId: ScenarioId | null;
  readonly recentProjectIds: readonly string[];
  readonly nextMockId: number;
};

export type WorkspaceAction =
  | { readonly type: 'new-chat' }
  | { readonly type: 'close-nav' }
  | { readonly type: 'choose-scenario'; readonly scenarioId: ScenarioId | null }
  | { readonly type: 'create-mock-project'; readonly brief: MockProjectBrief }
  | { readonly type: 'project-section'; readonly section: ProjectSection }
  | { readonly type: 'navigate'; readonly view: WorkspaceView }
  | { readonly type: 'toggle-nav' }
  | { readonly type: 'toggle-sidebar' }
  | { readonly type: 'select-project'; readonly projectId: string }
  | { readonly type: 'open-work'; readonly projectId: string; readonly workId: string }
  | { readonly type: 'select-element'; readonly elementId: string }
  | { readonly type: 'select-library'; readonly libraryId: string }
  | { readonly type: 'set-tab'; readonly tab: InspectorTab }
  | { readonly type: 'set-viewport'; readonly viewport: ViewportMode }
  | { readonly type: 'toggle-chat' }
  | { readonly type: 'set-draft'; readonly draft: string }
  | { readonly type: 'send-mock'; readonly text?: string };

export const MOCK_REPLY = 'Демонстрационный ответ. Модель не вызывалась, холст не изменён, запись не сохранена.';

export const projects: readonly MockProject[] = [
  {
    id: 'north',
    name: 'Северный свет',
    client: 'Собственный продукт',
    works: [
      {
        id: 'welcome',
        name: 'Экран приветствия',
        summary: 'Первый экран с заголовком и одним действием.',
        elements: [
          { id: 'heading', name: 'Заголовок', kind: 'Текст', note: 'Пример подписи экрана. Свойства не применяются.' },
          { id: 'email', name: 'Input / Email', kind: 'Поле', note: 'Пример поля. Значение никуда не отправляется.' },
          { id: 'password', name: 'Input / Пароль', kind: 'Поле', note: 'Пример поля без проверки длины.' },
          { id: 'button', name: 'Button / Продолжить', kind: 'Кнопка', note: 'Пример действия. Холст лаборатории не меняется.' },
          { id: 'hint', name: 'Hint / Подсказка', kind: 'Текст', note: 'Статичная подпись под полями.' },
        ],
      },
      {
        id: 'empty',
        name: 'Пустое состояние',
        summary: 'Пояснение, когда список работ ещё пуст.',
        elements: [
          { id: 'empty-title', name: 'Нет работ', kind: 'Текст', note: 'Честный пустой статус.' },
          { id: 'empty-action', name: 'Создать черновик', kind: 'Кнопка', note: 'В этой оболочке кнопка только показана.' },
        ],
      },
    ],
  },
  {
    id: 'routes',
    name: 'Городские маршруты',
    client: 'Учебный пример',
    works: [
      {
        id: 'search',
        name: 'Поиск рейса',
        summary: 'Поле запроса и список результатов.',
        elements: [
          { id: 'query', name: 'Куда едем', kind: 'Поле', note: 'Один запрос, без сети.' },
          { id: 'result', name: 'Карточка рейса', kind: 'Карточка', note: 'Статичный пример строки.' },
        ],
      },
    ],
  },
];

export const libraries: readonly MockLibrary[] = [
  {
    id: 'wdeaf',
    name: 'WDeaf PRO 2.0',
    note: 'Пример библиотеки в списке. Синхронизация с Figma, Storybook и репозиториями не подключена.',
    version: 'пример',
    components: 'не посчитаны',
    source: 'не Figma',
    status: 'не подключена',
  },
  {
    id: 'autodata',
    name: 'Autodata',
    note: 'Визуальный ориентир концепта. Макет не импортирован.',
    version: 'концепт',
    components: 'не импортирована',
    source: 'не Figma',
    status: 'референс',
  },
  {
    id: 'new-system',
    name: 'Новая система',
    note: 'Место для будущего подключения. Источник не выбран.',
    version: '—',
    components: '—',
    source: '—',
    status: 'не подключена',
  },
];

export const scenarios = [
  { id: 'scratch', title: 'Сайт с нуля', note: 'Новая структура и контент', text: 'Создай лендинг для B2B SaaS-продукта с использованием дизайн-системы' },
  { id: 'figma', title: 'По макету Figma', note: 'От дизайна к прототипу. Файл не читается.', text: 'Собери интерфейс по существующему макету Figma' },
  { id: 'redesign', title: 'Редизайн сайта', note: 'Улучшение UX и визуала', text: 'Обнови интерфейс существующего сайта, сохранив его структуру' },
  { id: 'prototype', title: 'Прототип приложения', note: 'Веб. Android и iOS здесь не собираются.', text: 'Создай рабочий прототип интерфейса приложения' },
] as const;

export const initialWorkspaceState: WorkspaceState = {
  view: 'home',
  projectId: projects[0].id,
  workId: null,
  elementId: null,
  libraryId: libraries[0].id,
  tab: 'params',
  viewport: 'desktop',
  navOpen: false,
  sidebarOpen: true,
  chatOpen: false,
  draft: '',
  thread: [],
  projectChats: new Map(),
  mockProjects: [],
  projectSection: 'canvas',
  projectListOpen: true,
  scenarioId: null,
  recentProjectIds: projects.map(project => project.id),
  nextMockId: 1,
};

export function projectById(id: string, local: readonly MockProject[] = []): MockProject | undefined {
  return [...local, ...projects].find(project => project.id === id);
}

export function workById(projectId: string, workId: string, local: readonly MockProject[] = []): MockWork | undefined {
  return projectById(projectId, local)?.works.find(work => work.id === workId);
}

const emptyProjectChat: MockChat = { draft: '', thread: [] };

/** In-memory project context, separate from the general home chat. */
export function projectChatFor(state: WorkspaceState): MockChat {
  return state.projectChats.get(state.projectId) ?? emptyProjectChat;
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  const recent = (id: string) => [id, ...state.recentProjectIds.filter(item => item !== id)];
  switch (action.type) {
    case 'new-chat':
      return { ...state, view: 'home', draft: '', thread: [], chatOpen: false, scenarioId: null, navOpen: false, workId: null, elementId: null };
    case 'close-nav':
      return state.navOpen ? { ...state, navOpen: false } : state;
    case 'choose-scenario':
      return { ...state, view: 'home', scenarioId: action.scenarioId, navOpen: false };
    case 'project-section':
      return { ...state, projectSection: action.section };
    case 'create-mock-project': {
      const name = action.brief.name.trim();
      if (!name || !action.brief.description.trim() || !scenarios.some(item => item.id === action.brief.scenario)) return state;
      const id = `mock-${state.nextMockId}`;
      const project: MockProject = { id, name, client: 'Локальная демонстрация', brief: { ...action.brief, name },
        works: [{ id: 'draft', name: 'Демонстрационный экран', summary: 'Заранее заданный пример, не результат генерации.', elements: projects[0].works[0].elements }] };
      return { ...state, view: 'projects', projectId: id, workId: null, elementId: null,
        mockProjects: [...state.mockProjects, project], nextMockId: state.nextMockId + 1,
        scenarioId: null, projectSection: 'canvas', projectListOpen: false, chatOpen: false, navOpen: false, recentProjectIds: recent(id) };
    }
    case 'navigate':
      if (action.view === 'editor' && !state.workId) return state;
      return { ...state, view: action.view, projectListOpen: action.view === 'projects' ? true : state.projectListOpen, navOpen: false };
    case 'toggle-nav':
      return { ...state, navOpen: !state.navOpen };
    case 'toggle-sidebar':
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case 'select-project':
      return projectById(action.projectId, state.mockProjects)
        ? { ...state, view: 'projects', projectId: action.projectId, workId: null, elementId: null, projectSection: 'canvas', projectListOpen: false, chatOpen: false, navOpen: false, recentProjectIds: recent(action.projectId) }
        : state;
    case 'open-work': {
      const work = workById(action.projectId, action.workId, state.mockProjects);
      if (!work) return state;
      return {
        ...state,
        view: 'editor',
        projectId: action.projectId,
        recentProjectIds: recent(action.projectId),
        chatOpen: action.projectId === state.projectId ? state.chatOpen : false,
        workId: work.id,
        elementId: work.elements[0]?.id ?? null,
        tab: 'params',
        navOpen: false,
      };
    }
    case 'select-element': {
      const work = state.workId ? workById(state.projectId, state.workId, state.mockProjects) : undefined;
      if (!work?.elements.some(element => element.id === action.elementId)) return state;
      return { ...state, elementId: action.elementId, tab: 'params' };
    }
    case 'select-library':
      return libraries.some(library => library.id === action.libraryId)
        ? { ...state, view: state.view === 'projects' ? 'projects' : 'libraries', libraryId: action.libraryId, navOpen: false }
        : state;
    case 'set-tab':
      return { ...state, tab: action.tab };
    case 'set-viewport':
      return { ...state, viewport: action.viewport };
    case 'toggle-chat':
      return { ...state, chatOpen: !state.chatOpen };
    case 'set-draft':
      return state.view === 'editor'
        ? { ...state, projectChats: new Map(state.projectChats).set(state.projectId, { ...projectChatFor(state), draft: action.draft }) }
        : { ...state, draft: action.draft };
    case 'send-mock': {
      const chat = state.view === 'editor' ? projectChatFor(state) : state;
      const text = (action.text ?? chat.draft).trim();
      if (!text) return state;
      const next: MockChat = { draft: '', thread: [...chat.thread, { role: 'user', text }, { role: 'mock', text: MOCK_REPLY }] };
      return state.view === 'editor'
        ? { ...state, chatOpen: true, projectChats: new Map(state.projectChats).set(state.projectId, next) }
        : { ...state, ...next };
    }
    default:
      return state;
  }
}
