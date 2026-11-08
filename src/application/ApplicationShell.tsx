import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { AccountGate, AccountButton, type User } from '../account';
import { DemoGate } from '../demo';
import { isDemo } from '../runtime';
import { WorkspaceShell } from '../workspace/WorkspaceShell';
import { applicationHref, isWorkspaceDemoShortcut, resolveApplicationRoute, type KnownApplicationRoute } from './navigation';

type Props = { renderLaboratory: (user: User, onDemoExit?: () => void) => ReactNode };

/** Reuses the existing gates; navigation never authenticates a user. */
export function ApplicationShell({ renderLaboratory }: Props) {
  return isDemo
    ? <DemoGate workspace initiallyActive={isWorkspaceDemoShortcut(window.location.search)}>{exit => <ApplicationViews renderLaboratory={renderLaboratory} onDemoExit={exit} />}</DemoGate>
    : <AccountGate>{user => <ApplicationViews renderLaboratory={renderLaboratory} user={user} accountAction={<AccountButton user={user} presentation="menu-item" />} />}</AccountGate>;
}

function ApplicationViews({ renderLaboratory, user, accountAction, onDemoExit }: Props & { user?: User; accountAction?: ReactNode; onDemoExit?: () => void }) {
  const [route, setRoute] = useState(() => resolveApplicationRoute(window.location.search));
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const pop = () => setRoute(resolveApplicationRoute(window.location.search));
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  useEffect(() => {
    document.title = route === 'laboratory' ? 'Лаборатория компонентов · ЗАРЯ' : route === 'workspace' ? 'ЗАРЯ Workspace' : 'Раздел не найден · ЗАРЯ';
    region.current?.focus({ preventScroll: true });
  }, [route]);
  const navigate = (next: KnownApplicationRoute) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.history.pushState(null, '', applicationHref(next));
    setRoute(next);
  };
  const endDemo = () => {
    window.history.replaceState(null, '', applicationHref('workspace'));
    onDemoExit?.();
  };
  return <div ref={region} tabIndex={-1}>
    {/* Keep the local mock Workspace alive during a laboratory visit. */}
    <div hidden={route !== 'workspace'}>
      <WorkspaceShell active={route === 'workspace'} user={user} accountAction={accountAction} onDemoExit={onDemoExit ? endDemo : undefined} onLaboratory={navigate('laboratory')} />
    </div>
    {route === 'laboratory' && <>
      <nav className="notice" aria-label="Навигация лаборатории"><a href={applicationHref('workspace')} onClick={navigate('workspace')}>Вернуться в Workspace</a><span>Лаборатория компонентов · ЗАРЯ. Экспериментальный холст хранится отдельно; это не Canvas проекта и не каталог дизайн-систем.</span></nav>
      {renderLaboratory(user ?? { id: 'guest', username: 'Гость' }, onDemoExit ? endDemo : undefined)}
    </>}
    {route === 'unknown' && <main className="panel"><h1>Раздел не найден</h1><p>Этот адрес не открывает лабораторию или проект автоматически.</p><a href={applicationHref('workspace')} onClick={navigate('workspace')}>Открыть Workspace</a></main>}
  </div>;
}
