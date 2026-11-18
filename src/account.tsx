import { assetUrl } from './runtime';
import { flushSync } from 'react-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppearancePicker } from './appearance';
import { Avatar, CloseButton, Icon } from './ui';
export interface User { id: string; username: string }
export function AccountGate({ children }: { children: (user: User) => ReactNode }) {
  const [user, setUser] = useState<User>();
  const [failed, setFailed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [expired, setExpired] = useState(false);
  useEffect(() => { if (expired) location.replace('/'); }, [expired]);

  useEffect(() => {
    let live = true;
    let latest = 0;
    const check = async () => {
      const checkId = ++latest;
      try {
        const response = await fetch('/api/me');
        if (!live || checkId !== latest) return;
        if (response.status === 401) {
          setUser(undefined);
          setExpired(true);
          return;
        }
        if (!response.ok) throw new Error();
        const account = await response.json();
        if (live && checkId === latest) { setUser(account); setFailed(false); }
      } catch {
        if (live && checkId === latest) { setUser(undefined); setFailed(true); }
      } finally {
        if (live && checkId === latest) setChecking(false);
      }
    };
    void check(); const timer = setInterval(check, 60000);
    const foreground = () => {
      setChecking(true);
      void check();
    };
    const freeze = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      latest++;
      flushSync(() => setUser(undefined));
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) foreground();
    };
    window.addEventListener('focus', foreground);
    window.addEventListener('pagehide', freeze);
    window.addEventListener('pageshow', restore);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener('focus', foreground);
      window.removeEventListener('pagehide', freeze);
      window.removeEventListener('pageshow', restore);
    };
  }, []);
  if (!user) return <main className="panel"><h1>{failed ? 'Нет соединения с сервером' : 'Проверка входа…'}</h1>{failed && <button onClick={() => location.reload()}>Повторить</button>}</main>;
  return <>
    {checking && <main className="panel" role="status">Проверка входа…</main>}
    <div hidden={checking} inert={checking}>{children(user)}</div>
  </>;
}
function FigmaIcon({ name }: { name: 'user-circle' | 'log-out-01' }) {
  return <span className="wdeaf-icon-slot"><img className="wdeaf-icon" src={assetUrl(`/icons/${name}.svg`)} width="24" height="24" alt="" /></span>;
}
export type LogoutActions = { confirmLogout: () => boolean; onLogout: () => void };

export function AccountButton({ user, presentation = 'profile-dialog', logoutActions }: {
  user: User; presentation?: 'profile-dialog' | 'menu-item'; logoutActions?: LogoutActions;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const logoutButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (error) logoutButton.current?.focus(); }, [error]);
  // Shared by the existing laboratory profile and the Workspace menu item.
  const logout = async () => {
    if (busy || (logoutActions && !logoutActions.confirmLogout())) return;
    setBusy(true); setError(false);
    try {
      const response = await fetch('/api/logout', { method: 'POST' });
      if (!response.ok) throw new Error();
      logoutActions?.onLogout();
      location.replace('/');
    }
    catch { setError(true); setBusy(false); }
  };
  if (presentation === 'menu-item') return <>
    <button type="button" ref={logoutButton} disabled={busy} onClick={logout}><Icon name="log-out-01" />{busy ? 'Выход…' : 'Выйти'}</button>
    {error && <p role="alert">Не удалось выйти. Проверьте соединение и повторите.</p>}
  </>;
  return <><button className="avatar-trigger" aria-label={`Открыть профиль ${user.username}`} title={user.username} aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}><Avatar initials={user.username} /></button>
    <dialog ref={dialog} className="profile-dialog" aria-labelledby="profile-title">
      <div className="dialog-heading"><h2 id="profile-title">Личный кабинет</h2><CloseButton label="Закрыть профиль" onClick={() => dialog.current?.close()} /></div>
      <div className="profile-identity"><Avatar initials={user.username} size="48" /><div><strong>{user.username}</strong><p className="muted">Учётная запись ЗАРЯ</p></div></div>
      <section className="profile-section"><h3>Оформление интерфейса</h3><AppearancePicker /><p className="muted">Системное оформление следует настройкам устройства. Выбор сохраняется в этом браузере.</p></section>
      <section className="profile-section"><h3>Доступ с нескольких устройств</h3><p className="muted">Два и более участника могут войти с этим логином и паролем одновременно. Выход завершает только текущую сессию браузера.</p><p className="muted">Холсты хранятся отдельно в каждом браузере. Для передачи работы используйте JSON-экспорт и импорт.</p></section>
      <button className="primary wdeaf-button profile-logout" ref={logoutButton} disabled={busy} onClick={logout}><FigmaIcon name="log-out-01" />{busy ? 'Выход…' : 'Выйти из системы'}</button>
      {error && <p role="alert">Не удалось выйти. Проверьте соединение и повторите.</p>}
    </dialog></>;
}
