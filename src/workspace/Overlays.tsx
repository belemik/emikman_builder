import { useEffect, useId, useRef, type ReactNode, type RefObject, type KeyboardEvent } from 'react';
import { CloseButton } from '../ui';
import type { ThemeMode } from './theme';

/** Keep Tab within the visible dialog controls, including nested popovers. */
export function containDialogTab(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return;
  const dialog = event.currentTarget;
  const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')]
    .filter(control => control.getClientRects().length > 0 && getComputedStyle(control).visibility !== 'hidden');
  const first = controls[0]; const last = controls[controls.length - 1];
  if (!first) { event.preventDefault(); return; }
  if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
    event.preventDefault(); first.focus();
  }
}

type ModalProps = {
  title: string; open: boolean; onClose: () => void; children: ReactNode;
  dismissLabel?: string; returnFocusRef?: RefObject<HTMLElement | null>; returnFocusSelector?: string;
};
export function Modal({ title, open, onClose, children, dismissLabel, returnFocusRef, returnFocusSelector = '[data-profile-trigger], [data-menu-trigger]' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const active = document.activeElement;
    const previous = active instanceof HTMLElement && active !== document.body && active !== document.documentElement ? active : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close(); document.body.style.overflow = overflow;
      if (returnFocusRef?.current?.isConnected) returnFocusRef.current.focus({ preventScroll: true });
      else if (previous?.isConnected) previous.focus({ preventScroll: true });
      else (document.querySelector<HTMLElement>(returnFocusSelector) ?? document.querySelector<HTMLElement>('[data-menu-trigger]'))?.focus({ preventScroll: true });
    };
  }, [open, returnFocusRef, returnFocusSelector]);
  return <dialog className="z-modal" ref={ref} aria-labelledby={id} onKeyDown={containDialogTab} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="z-modal-head"><h2 id={id}>{title}</h2>{dismissLabel
      ? <button type="button" className="z-button" onClick={onClose}>{dismissLabel}</button>
      : <CloseButton label={`Закрыть: ${title}`} onClick={onClose} />}</div>
    {open && children}
  </dialog>;
}

/** Non-modal popover: outside click/Escape dismiss, keyboard arrows traverse actions. */
export function Popover({ label, trigger, onClose, children }: { label: string; trigger: RefObject<HTMLButtonElement | null>; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const pointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close.current();
    };
    document.addEventListener('pointerdown', pointer);
    return () => document.removeEventListener('pointerdown', pointer);
  }, [trigger]);
  return <div className="z-popover" role="dialog" aria-label={label} ref={ref} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); trigger.current?.focus(); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      const items = [...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      event.preventDefault(); items[next]?.focus();
    }
  }}>{children}</div>;
}

export function WorkspaceSettings({ mode, onTheme }: { mode: ThemeMode; onTheme: (mode: ThemeMode) => void }) {
  return <section className="z-modal-body"><h3>Внешний вид</h3><p>Выберите тему Workspace и панелей Editor.</p>
    <div className="z-theme-options" role="group" aria-label="Оформление">{([
      ['light', 'Светлая'], ['dark', 'Тёмная'], ['system', 'Системная'],
    ] as const).map(([id, label]) => <button type="button" className="z-button" key={id} aria-pressed={mode === id} onClick={() => onTheme(id)}>{label}</button>)}</div>
    <p className="z-muted">Настройка темы действует в этом браузере.</p>
  </section>;
}

export function WorkspaceHelp() {
  return <div className="z-modal-body z-help">
    <section><h3>Как создать проект</h3><p>Откройте «Новый чат», выберите сценарий и заполните форму. Результат — локальный mock, исчезающий после обновления страницы.</p></section>
    <section><h3>Как подключить дизайн-систему</h3><p>Подключение источников пока недоступно. WDeaf PRO 2.0 в форме — метаданные демонстрации, не live-подключение.</p></section>
    <section><h3>Как использовать Canvas</h3><p>Откройте «Страница события» и выберите Hero на холсте. Измените текст в Inspector, нажмите «Применить» и откройте Preview.</p></section>
    <section><h3>Горячие клавиши</h3><p>Enter отправляет mock-сообщение; Shift+Enter добавляет строку. Escape закрывает меню и диалоги. Tab перемещает фокус.</p></section>
    <section><h3>Ограничения демонстрационного режима</h3><p>Чат использует демонстрационный ответ. Правки страницы события действуют в текущей сессии. На Pages нет серверной сессии. На сервере вход подтверждает существующий AccountGate; выход доступен через меню профиля ЗАРЯ Workspace и существующий профиль лаборатории.</p></section>
  </div>;
}
