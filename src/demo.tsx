import { useRef, useState, type ReactNode } from 'react';
import { AppearancePicker } from './appearance';
import { Avatar, CloseButton } from './ui';

export function DemoAccountButton({ onExit }: { onExit: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <><button className="avatar-trigger" aria-label="Настройки гостя" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}><Avatar initials="Гость" /></button>
    <dialog ref={dialog} className="profile-dialog" aria-labelledby="guest-title">
      <div className="dialog-heading"><h2 id="guest-title">Гостевая демоверсия</h2><CloseButton label="Закрыть настройки гостя" onClick={() => dialog.current?.close()} /></div>
      <p>Это публичная демонстрация без авторизации. Аккаунт и пароль не требуются.</p>
      <p>Холст сохраняется только в этом браузере. Другие посетители его не видят. На общем устройстве пользователи одного профиля браузера имеют доступ к одному холсту. Для переноса используйте JSON.</p>
      <AppearancePicker />
      <p className="muted">Выход завершает просмотр демоверсии. Сохранённый холст остаётся в браузере и не защищён паролем.</p>
      <button className="primary wdeaf-button profile-logout" onClick={onExit}>Выйти из системы</button>
    </dialog></>;
}

export function DemoGate({ children }: { children: (exit: () => void) => ReactNode }) {
  const [active, setActive] = useState(false);
  if (active) return children(() => setActive(false));
  return <main className="panel demo-welcome"><h1>WDeaf Builder</h1><h2>Публичная демоверсия</h2><p>Без аккаунта и пароля. Холст хранится только в этом браузере. Для переноса работы используйте JSON.</p><button className="primary" onClick={() => setActive(true)}>Открыть демоверсию</button></main>;
}
