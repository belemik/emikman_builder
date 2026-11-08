import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppearancePicker } from './appearance';
import { Avatar, CloseButton } from './ui';

export function DemoAccountButton({ onExit }: { onExit: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <><button className="avatar-trigger" aria-label="Настройки гостя" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}><Avatar initials="Гость" /></button>
    <dialog ref={dialog} className="profile-dialog" aria-labelledby="guest-title">
      <div className="dialog-heading"><h2 id="guest-title">Демо-профиль ЗАРЯ</h2><CloseButton label="Закрыть настройки гостя" onClick={() => dialog.current?.close()} /></div>
      <p>Это публичная демонстрация без авторизации. Аккаунт и пароль не требуются.</p>
      <p>Холст сохраняется только в этом браузере. Другие посетители его не видят. На общем устройстве пользователи одного профиля браузера имеют доступ к одному холсту. Для переноса используйте JSON.</p>
      <AppearancePicker />
      <p className="muted">Завершение демо закрывает просмотр. Сохранённый холст остаётся в браузере и не защищён паролем.</p>
      <button className="primary wdeaf-button profile-logout" onClick={onExit}>Завершить демо</button>
    </dialog></>;
}

export function DemoGate({ children, initiallyActive = false, workspace = false }: { children: (exit: () => void) => ReactNode; initiallyActive?: boolean; workspace?: boolean }) {
  const [active, setActive] = useState(initiallyActive);
  const enter = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!active) enter.current?.focus(); }, [active]);
  if (active) return children(() => setActive(false));
  return <main className="panel demo-welcome"><h1>{workspace ? 'ЗАРЯ Workspace' : 'ЗАРЯ'}</h1><h2>Публичная демоверсия</h2><p>{workspace ? 'Без аккаунта и пароля. Проекты и диалоги Workspace — mock в памяти, исчезающие после перезагрузки. Экспериментальный холст лаборатории хранится отдельно в этом браузере.' : 'Без аккаунта и пароля. Холст хранится только в этом браузере. Для переноса работы используйте JSON.'}</p><button className="primary" ref={enter} onClick={() => setActive(true)}>Открыть демоверсию</button></main>;
}
