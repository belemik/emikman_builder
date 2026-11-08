import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Avatar, CloseButton, Icon } from '../ui';
import { Popover, containDialogTab } from './Overlays';
import type { MockProject } from './model';

export function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 800px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)');
    const sync = () => setNarrow(media.matches); sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return narrow;
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true); const id = useId();
  return <section className="z-side-section">
    <button type="button" className="z-section-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <span>{title}</span><span className={open ? '' : 'z-folded'}><Icon name="arrow-down" /></span>
    </button>
    <div id={id} hidden={!open} className="z-side-list">{children}</div>
  </section>;
}

function ProfileMenu({ onSettings, onHelp }: { onSettings: () => void; onHelp: () => void }) {
  const [open, setOpen] = useState(false); const trigger = useRef<HTMLButtonElement>(null);
  return <div className="z-profile">
    {open && <Popover label="Меню пользователя" trigger={trigger} onClose={() => setOpen(false)}>
      <p className="z-popover-label">Демонстрационный профиль</p>
      <button type="button" onClick={() => { setOpen(false); onSettings(); }}><Icon name="settings-01" />Настройки</button>
      <button type="button" onClick={() => { setOpen(false); onHelp(); }}>Справка</button>
      <hr />
      <button type="button" disabled aria-describedby="z-logout-reason"><Icon name="log-out-01" />Выйти из системы</button>
      <p id="z-logout-reason" className="z-muted">Недоступно: Workspace demo не подтверждает серверную сессию. Выход из Builder выполняется в самом Builder.</p>
    </Popover>}
    <button type="button" className="z-profile-trigger" ref={trigger} data-profile-trigger aria-label="Открыть демонстрационный профиль" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
      <Avatar initials="Д" size="32" /><span><strong>Демо-профиль</strong><small>Без подтверждённой сессии</small></span><Icon name="arrow-up" />
    </button>
  </div>;
}

export function Sidebar({ mobile, allProjects, recentIds, currentProject, onHome, onAll, onProject, onToggle, onSettings, onHelp }: {
  mobile: boolean; allProjects: readonly MockProject[]; recentIds: readonly string[]; currentProject: string | null;
  onHome: () => void; onAll: () => void; onProject: (id: string) => void; onToggle: () => void;
  onSettings: () => void; onHelp: () => void;
}) {
  return <div className="z-side-content">
    <div className="z-side-head"><button type="button" className="z-brand" aria-label="ЗАРЯ — главная Workspace" onClick={onHome}>ЗАРЯ<span>demo</span></button>
      {mobile ? <CloseButton size="l" label="Закрыть меню" onClick={onToggle} /> : <button className="z-icon z-button" type="button" aria-label="Скрыть меню" onClick={onToggle}><Icon name="arrow-down" /></button>}
    </div>
    <button type="button" className="z-new-chat" onClick={onHome}><Icon name="plus" />Новый чат</button>
    <nav className="z-side-scroll" aria-label="Проекты и недавние">
      <SidebarSection title="Проекты"><button type="button" onClick={onAll}>Все проекты</button>
        {allProjects.map(project => <button type="button" key={project.id} aria-current={currentProject === project.id ? 'page' : undefined} onClick={() => onProject(project.id)}>{project.name}<small>mock</small></button>)}
      </SidebarSection>
      <SidebarSection title="Недавние"><p className="z-side-note">Примеры и открытия в этой демосессии</p>
        {recentIds.map(id => allProjects.find(project => project.id === id)).filter((item): item is MockProject => !!item).map(project => <button type="button" key={project.id} onClick={() => onProject(project.id)}>{project.name}<small>mock</small></button>)}
      </SidebarSection>
    </nav>
    <ProfileMenu onSettings={onSettings} onHelp={onHelp} />
  </div>;
}

/** Native modal navigation provides inert background and keyboard focus trapping. */
export function MobileNavigation({ open, onClose, content, children }: { open: boolean; onClose: () => void; content: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null); const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const dialog = ref.current; if (!open || !dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const bodyOverflow = document.body.style.overflow;
    const main = content.current; const mainOverflow = main?.style.overflow ?? ''; const top = main?.scrollTop ?? 0;
    const position = { x: window.scrollX, y: window.scrollY };
    document.body.style.overflow = 'hidden'; if (main) main.style.overflow = 'hidden';
    dialog.showModal(); dialog.querySelector<HTMLButtonElement>('[aria-label="Закрыть меню"]')?.focus();
    return () => {
      dialog.close(); document.body.style.overflow = bodyOverflow;
      if (main) { main.style.overflow = mainOverflow; main.scrollTop = top; }
      window.scrollTo(position.x, position.y);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>('[data-menu-trigger]')?.focus({ preventScroll: true });
    };
  }, [open, content]);
  return <dialog className="z-mobile-nav" ref={ref} aria-label="Мобильная навигация" onKeyDown={containDialogTab} onCancel={event => { event.preventDefault(); close.current(); }}>
    {open && children}
  </dialog>;
}
