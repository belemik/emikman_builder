import { useEffect, useRef, type RefObject, type ReactNode } from 'react';
import { WEB_PAGE_ASSETS } from '../web-page/contract';
import { assetUrl } from '../runtime';
import { Glyph } from '../studio/Controls';
import { ChatComposer, Thread } from './ChatComposer';
import { scenarios, type ScenarioId, type WorkspaceState } from './model';

export function ProjectCovers({ eventRef, pilotRef, onEvent, onPilot, onBoard }: {
  eventRef: RefObject<HTMLButtonElement | null>; pilotRef: RefObject<HTMLButtonElement | null>;
  onEvent: () => void; onPilot: () => void; onBoard: () => void;
}) {
  return <div className="zs-covers">
    <button ref={eventRef} className="zs-project" aria-label="Страница события" onClick={onEvent}>
      <span className="zs-cover zs-event" aria-hidden="true"><b>Открытые<br />мастерские</b><img src={assetUrl(WEB_PAGE_ASSETS['event-mark'])} alt="" /></span>
      <span className="zs-card-meta"><strong>Страница события</strong><small>WebPage · Редактор страницы</small></span></button>
    <button ref={pilotRef} className="zs-project" aria-label="Открыть визуальный пилот EMIKMAN" onClick={onPilot}>
      <span className="zs-cover zs-emik" aria-hidden="true"><b>emikman</b></span>
      <span className="zs-card-meta"><strong>EMIKMAN</strong><small>Визуальный пилот · RU / EN</small></span></button>
    <button className="zs-project" aria-label="Открыть компонентную доску ZARYA DS" onClick={onBoard}>
      <span className="zs-cover zs-system" aria-hidden="true"><i/><i/><i/><i/></span>
      <span className="zs-card-meta"><strong>ZARYA DS</strong><small>Дизайн-система платформы</small></span></button>
  </div>;
}

export function StudioHome({ state, onDraft, onSend, onSource, onScenario, onExample, onAll, children, chatOnly, direction, onDirection }: {
  state: WorkspaceState; onDraft: (v: string) => void; onSend: () => void; onSource: (v: string) => void;
  onScenario: (v: ScenarioId) => void; onExample: () => void; onAll: () => void; children: ReactNode; chatOnly: boolean; direction: string; onDirection: (value: string) => void;
}) {
  const conversation = useRef<HTMLDivElement>(null);
  useEffect(() => { if (conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight; }, [state.thread.length]);
  const scenarioIcons = { scratch: 'page', figma: 'layers', redesign: 'controls', prototype: 'window' } as const;
  return <main className="zs-home">
    <div className="zs-chat-head"><div><p className="zs-kicker"><Glyph name="spark" /> AI-чат</p><h1>{state.thread.length ? 'Обсудим вашу идею' : 'Что создадим сегодня?'}</h1></div><div aria-hidden="true" className="zs-sun"/></div>
    {!!state.thread.length && <div ref={conversation} className="zs-conversation"><Thread messages={state.thread} /><button className="z-button" onClick={onExample}>Открыть пример в Canvas</button></div>}
    <ChatComposer context={direction} onDirection={onDirection} draft={state.draft} onDraft={onDraft} onSend={onSend} onSource={onSource} />
    {!chatOnly && <><div className="zs-shortcuts" aria-label="Сценарии создания">{scenarios.map(item => <button type="button" className="z-scenario" key={item.id} onClick={() => onScenario(item.id)} title={item.note}><Glyph name={scenarioIcons[item.id]} />{item.title}</button>)}</div>
    <section className="zs-work"><header><h2>Рабочие материалы</h2><button onClick={onAll}>Все проекты</button></header>{children}</section></>}
  </main>;
}
