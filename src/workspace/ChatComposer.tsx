import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '../ui';
import { Popover } from './Overlays';
import type { MockMessage } from './model';

const sources = ['Прикрепить файл', 'Добавить макет Figma', 'Выбрать дизайн-систему', 'Добавить ссылку на сайт', 'Добавить референс'] as const;
export function ChatComposer({ draft, onDraft, onSend, onSource, compact = false }: {
  draft: string; onDraft: (value: string) => void; onSend: () => void; onSource: (source: string) => void; compact?: boolean;
}) {
  const id = useId(); const area = useRef<HTMLTextAreaElement>(null); const trigger = useRef<HTMLButtonElement>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  useLayoutEffect(() => {
    if (!area.current) return;
    area.current.style.height = 'auto';
    area.current.style.height = `${Math.min(area.current.scrollHeight, 240)}px`;
  }, [draft]);
  const keyboard = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault(); if (draft.trim()) onSend();
    }
  };
  return <form className={`z-composer ${compact ? 'z-composer-compact' : ''}`} onSubmit={event => { event.preventDefault(); if (draft.trim()) onSend(); }}>
    <label className="z-sr" htmlFor={id}>{compact ? 'Сообщение к макету' : 'Запрос'}</label>
    <textarea id={id} ref={area} value={draft} maxLength={4000} rows={compact ? 2 : 3} placeholder="Опишите, что хотите создать…" onChange={event => onDraft(event.target.value)} onKeyDown={keyboard} aria-describedby={`${id}-note`} />
    <div className="z-composer-tools"><div className="z-source-anchor">
      <button type="button" className="z-button z-icon" data-source-trigger aria-label="Добавить источник" aria-haspopup="dialog" aria-expanded={sourcesOpen} ref={trigger} onClick={() => setSourcesOpen(!sourcesOpen)}><Icon name="plus" /></button>
      {sourcesOpen && <Popover label="Добавление источников" trigger={trigger} onClose={() => setSourcesOpen(false)}>{sources.map(source => <button type="button" key={source} onClick={() => { setSourcesOpen(false); onSource(source); }}>{source}</button>)}<p className="z-muted">Все подключения пока недоступны. Откроется объяснение, без импорта.</p></Popover>}
    </div><span className="z-composer-hint">Enter — отправить · Shift+Enter — строка</span>
      <button className="z-button z-primary z-icon" type="submit" aria-label="Отправить mock-сообщение" disabled={!draft.trim()}><Icon name="arrow-up" /></button>
    </div><p id={`${id}-note`} className="z-composer-note">Mock-диалог · без модели, генерации и сохранения</p>
  </form>;
}
export function Thread({ messages }: { messages: readonly MockMessage[] }) {
  return <div className="z-thread" aria-live="polite">{messages.map((message, i) => <article key={i} className={`z-message z-message-${message.role}`}><small>{message.role === 'user' ? 'Вы' : 'ЗАРЯ · mock'}</small><p>{message.text}</p></article>)}</div>;
}
