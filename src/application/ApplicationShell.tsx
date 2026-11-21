import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { AccountGate, AccountButton, type User, type LogoutActions } from '../account';
import { DemoGate } from '../demo';
import { isDemo } from '../runtime';
import { PROJECT_WARNING, type PersonalProject } from './PersonalProjects';
import { WorkspaceShell } from '../workspace/WorkspaceShell';
import { INSPECTOR_EXIT_WARNING } from '../ux-pilot/inspector-drafts';
import { applicationHref, isWorkspaceDemoShortcut, resolveApplicationRoute, type KnownApplicationRoute } from './navigation';

// Index only navigation entries owned by this shell. No document data enters browser history.
const entryIndex = () => {
  const index = window.history.state?.zaryaEntryIndex;
  return Number.isSafeInteger(index) ? index as number : undefined;
};

type Props = { renderLaboratory: (user: User, onDemoExit?: () => void, logoutActions?: LogoutActions) => ReactNode };

/** Reuses the existing gates; navigation never authenticates a user. */
export function ApplicationShell({ renderLaboratory }: Props) {
  return isDemo
    ? <DemoGate workspace initiallyActive={isWorkspaceDemoShortcut(window.location.search)}>{exit => <ApplicationViews renderLaboratory={renderLaboratory} onDemoExit={exit} />}</DemoGate>
    : <AccountGate>{user => <ApplicationViews key={user.id} renderLaboratory={renderLaboratory} user={user}
      renderAccountAction={logoutActions => <AccountButton user={user} presentation="menu-item" logoutActions={logoutActions} />} />}</AccountGate>;
}

function ApplicationViews({ renderLaboratory, user, onDemoExit, renderAccountAction }: Props & {
  user?: User; onDemoExit?: () => void; renderAccountAction?: (logoutActions: LogoutActions) => ReactNode;
}) {
  const [route, setRoute] = useState(() => resolveApplicationRoute(window.location.search));
  const region = useRef<HTMLDivElement>(null);
  const [project, setProject] = useState<PersonalProject | null>(null);
  const loggedOut = useRef(false);
  const acceptedEntry = useRef({ url: window.location.href, index: entryIndex() ?? 0 });
  const restoringEntry = useRef<number | null>(null);
  useEffect(() => {
    if (entryIndex() === undefined) {
      window.history.replaceState({ ...window.history.state, zaryaEntryIndex: acceptedEntry.current.index }, '');
    }
  }, []);
  const [{ dirty: pilotDirty, open: pilotOpen }, setPilotDraftState] = useState({ dirty: false, open: false });
  const onPilotDraftState = useCallback((dirty: boolean, open: boolean) => setPilotDraftState({ dirty, open }), []);
  const hasProject = project !== null;
  useLayoutEffect(() => {
    if (!hasProject && !pilotDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (loggedOut.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasProject, pilotDirty]);
  const logoutActions: LogoutActions = {
    confirmLogout: () => {
      const warnings = [project ? PROJECT_WARNING + '.' : '', pilotDirty ? INSPECTOR_EXIT_WARNING : ''].filter(Boolean);
      return !warnings.length || window.confirm(warnings.join(' ') + ' Выйти из аккаунта?');
    },
    onLogout: () => { loggedOut.current = true; setProject(null); },
  };
  const shouldWarnOnPilotExit = route === 'workspace' && pilotOpen && pilotDirty;
  useLayoutEffect(() => {
    const pop = () => {
      const index = entryIndex();
      if (restoringEntry.current !== null && restoringEntry.current === index) {
        restoringEntry.current = null;
        return;
      }
      restoringEntry.current = null;
      const next = resolveApplicationRoute(window.location.search);
      if (shouldWarnOnPilotExit && next !== 'workspace' && !window.confirm(INSPECTOR_EXIT_WARNING + ' Выйти из редактора?')) {
        const previous = acceptedEntry.current;
        if (index !== undefined && index !== previous.index) {
          restoringEntry.current = previous.index;
          window.history.go(previous.index - index);
        } else {
          // Fragment or unmanaged history entries may lack an index.
          window.history.replaceState({ ...window.history.state, zaryaEntryIndex: previous.index }, '', previous.url);
        }
        return;
      }
      acceptedEntry.current = { url: window.location.href, index: index ?? acceptedEntry.current.index };
      setRoute(next);
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, [shouldWarnOnPilotExit]);
  useEffect(() => {
    document.title = route === 'laboratory' ? 'Лаборатория компонентов · ЗАРЯ' : route === 'workspace' ? 'ЗАРЯ Workspace' : 'Раздел не найден · ЗАРЯ';
    region.current?.focus({ preventScroll: true });
  }, [route]);
  const navigate = (next: KnownApplicationRoute) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (shouldWarnOnPilotExit && next !== 'workspace' && !window.confirm(INSPECTOR_EXIT_WARNING + ' Выйти из редактора?')) return;
    const index = acceptedEntry.current.index + 1;
    window.history.pushState({ zaryaEntryIndex: index }, '', applicationHref(next));
    acceptedEntry.current = { url: window.location.href, index };
    setRoute(next);
  };
  const endDemo = () => {
    if (pilotDirty && !window.confirm(INSPECTOR_EXIT_WARNING + ' Завершить демо?')) return;
    window.history.replaceState(window.history.state, '', applicationHref('workspace'));
    onDemoExit?.();
  };
  return <div ref={region} tabIndex={-1}>
    {/* Keep the local mock Workspace alive during a laboratory visit. */}
    <div hidden={route !== 'workspace'}>
      <WorkspaceShell onPilotDraftState={onPilotDraftState} active={route === 'workspace'} user={user} accountAction={renderAccountAction?.(logoutActions)}
        personalProjects={user ? { project, setProject } : undefined} onDemoExit={onDemoExit ? endDemo : undefined} onLaboratory={navigate('laboratory')} />
    </div>
    {route === 'laboratory' && <>
      <nav className="notice" aria-label="Навигация лаборатории"><a href={applicationHref('workspace')} onClick={navigate('workspace')}>Вернуться в Workspace</a><span>Лаборатория компонентов · ЗАРЯ. Экспериментальный холст хранится отдельно; это не Canvas проекта и не каталог дизайн-систем.</span></nav>
      {renderLaboratory(user ?? { id: 'guest', username: 'Гость' }, onDemoExit ? endDemo : undefined, user ? logoutActions : undefined)}
    </>}
    {route === 'unknown' && <main className="panel"><h1>Раздел не найден</h1><p>Этот адрес не открывает лабораторию или проект автоматически.</p><a href={applicationHref('workspace')} onClick={navigate('workspace')}>Открыть Workspace</a></main>}
  </div>;
}
