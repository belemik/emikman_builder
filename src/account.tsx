import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppearancePicker } from './appearance';
import { Avatar, CloseButton } from './ui';
export interface User { id: string; username: string }
export function AccountGate({ children }: { children: (user: User) => ReactNode }) {
  const [user, setUser] = useState<User>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    const check = async () => {
      try {
        const response = await fetch('/api/me');
        if (response.status === 401) { location.replace('/'); return; }
        if (!response.ok) throw new Error();
        const account = await response.json();
        if (live) { setUser(account); setFailed(false); }
      } catch { if (live) { setUser(undefined); setFailed(true); } }
    };
    void check(); const timer = setInterval(check, 60000);
    window.addEventListener('focus', check);
    return () => { live = false; clearInterval(timer); window.removeEventListener('focus', check); };
  }, []);
  if (!user) return <main className="panel"><h1>{failed ? 'Нет соединения с сервером' : 'Проверка входа…'}</h1>{failed && <button onClick={() => location.reload()}>Повторить</button>}</main>;
  return children(user);
}
function FigmaIcon({ name }: { name: 'user-circle' | 'log-out-01' }) {
  return <span className="wdeaf-icon-slot"><img className="wdeaf-icon" src={`/icons/${name}.svg`} width="24" height="24" alt="" /></span>;
}
export function AccountButton({ user }: { user: User }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  return <><button className="avatar-trigger" aria-label={`Открыть профиль ${user.username}`} title={user.username} aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}><Avatar initials={user.username} /></button>
    <dialog ref={dialog} className="profile-dialog" aria-labelledby="profile-title">
      <div className="dialog-heading"><h2 id="profile-title">Личный кабинет</h2><CloseButton label="Закрыть профиль" onClick={() => dialog.current?.close()} /></div>
      <div className="profile-identity"><Avatar initials={user.username} size="48" /><div><strong>{user.username}</strong><p className="muted">Учётная запись WDeaf Builder</p></div></div>
      <section className="profile-section"><h3>Оформление интерфейса</h3><AppearancePicker /><p className="muted">Системное оформление следует настройкам устройства. Выбор сохраняется в этом браузере.</p></section>
      <section className="profile-section"><h3>Доступ с нескольких устройств</h3><p className="muted">Два и более участника могут войти с этим логином и паролем одновременно. Выход завершает только текущую сессию браузера.</p><p className="muted">Холсты хранятся отдельно в каждом браузере. Для передачи работы используйте JSON-экспорт и импорт.</p></section>
      <button className="primary wdeaf-button profile-logout" disabled={busy} onClick={async () => {
        setBusy(true); setError(false);
        try { const response = await fetch('/api/logout', { method: 'POST' }); if (!response.ok) throw new Error(); location.replace('/'); }
        catch { setError(true); setBusy(false); }
      }}><FigmaIcon name="log-out-01" />{busy ? 'Выход…' : 'Выйти из системы'}</button>
      {error && <p role="alert">Не удалось выйти. Проверьте соединение и повторите.</p>}
    </dialog></>;
}
