import { useEffect, useId, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react';
import { Icon } from '../ui';
import { exportPilot, locales, MAX_HERO_TEXT, MAX_MENU, MAX_MENU_TEXT, moveMenu, targets, validatePilot,
  type changePilot, type initialHistory, type Locale, type PilotDocument } from './model';
import { discardCommittedTarget, discardInspectorDraft, discardLayerDrafts, editInspectorDraft, hasLayerDrafts, readInspectorDraft,
  type InspectorDrafts, type InspectorValue } from './inspector-drafts';

const modes = ['Desktop', 'Tablet', 'Mobile'] as const;
const panels = ['Properties', 'AI Chat', 'Comments', 'Code', 'History / QA'] as const;
const unavailableTools = ['Frame / Container', 'Shape', 'Image', 'Video', 'Component', 'Comment', 'Hand / Pan'];
const copy = {
  ru: { brand: 'ЭМИКМАН', contact: 'Обсудить проект', demo: 'Демонстрационный CTA' },
  en: { brand: 'EMIKMAN', contact: 'Discuss a project', demo: 'Demo CTA' },
};

function TextForm({ value, dirty, max, onEdit, onApply, onDiscard }: {
  value: InspectorValue; dirty: boolean; max: number;
  onEdit: (value: Partial<InspectorValue>) => void; onApply: () => boolean; onDiscard: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const errorId = useId();
  const [invalid, setInvalid] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    setInvalid(!onApply());
    input.current?.focus({ preventScroll: true });
  }
  return <form className="zp-fields" onSubmit={submit} noValidate>
    <label>Текст<textarea ref={input} required rows={3} maxLength={max} value={value.text}
      aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined}
      onChange={event => { setInvalid(false); onEdit({ text: event.currentTarget.value }); }} /></label>
    {invalid && <p id={errorId} role="alert">Не удалось применить. Проверьте, что текст заполнен и соответствует ограничению длины.</p>}
    {value.target !== undefined && <label>Цель ссылки<select value={value.target} onChange={event => {
      const next = targets.find(item => item === event.currentTarget.value);
      if (next) { setInvalid(false); onEdit({ target: next }); }
    }}>{targets.map(item => <option key={item}>{item}</option>)}</select></label>}
    <button className="z-button z-primary" type="submit" disabled={!dirty}>Применить</button>
    {dirty && <button className="z-button" type="button" onClick={() => {
      setInvalid(false); onDiscard(); input.current?.focus({ preventScroll: true });
    }}>Отменить изменения</button>}
  </form>;
}

export function PilotEditor({ history, dispatch, dirtyDrafts, setDrafts, onBack }: {
  history: typeof initialHistory; dispatch: Dispatch<Parameters<typeof changePilot>[1]>;
  dirtyDrafts: InspectorDrafts; setDrafts: Dispatch<SetStateAction<InspectorDrafts>>; onBack: () => void;
}) {
  const document = history.present;
  const [locale, setLocale] = useState<Locale>('ru');
  const [mode, setMode] = useState<typeof modes[number]>('Desktop');
  const [panel, setPanel] = useState<typeof panels[number]>('Properties');
  const [selected, setSelected] = useState('hero');
  const [status, setStatus] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const inspector = useRef<HTMLHeadingElement>(null);
  const focusInspector = useRef(false);
  const heroTarget = useRef<HTMLElement>(null);
  const contactTarget = useRef<HTMLElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const layers = [{ id: 'header', label: 'Header' }, { id: 'navigation', label: 'Navigation' },
    ...document.menu.map(item => ({ id: item.id, label: item.label[locale] })),
    { id: 'hero', label: 'Hero / Text' }, { id: 'image', label: 'Image' }, { id: 'contact', label: 'CTA' }];
  const current = layers.find(item => item.id === selected) ?? layers.find(item => item.id === 'hero')!;
  useEffect(() => {
    if (focusInspector.current) {
      focusInspector.current = false;
      inspector.current?.focus();
    }
  }, [current.id]);
  const item = document.menu.find(entry => entry.id === current.id);
  const index = item ? document.menu.indexOf(item) : -1;
  const commit = (next: PilotDocument) => { dispatch({ type: 'commit', document: next }); setStatus('Документ изменён.'); };
  function confirmRemoving(ids: string[]) {
    if (ids.some(id => hasLayerDrafts(dirtyDrafts, id))
      && !window.confirm('Это действие удалит слой и его несохранённые изменения на всех языках. Продолжить?')) return false;
    setDrafts(previous => discardLayerDrafts(previous, ids));
    return true;
  }
  function changeHistory(type: 'undo' | 'redo') {
    const next = type === 'undo' ? history.past.at(-1) : history.future[0];
    if (!next) return;
    const removed = document.menu.filter(entry => !next.menu.some(other => other.id === entry.id));
    if (!confirmRemoving(removed.map(entry => entry.id))) return;
    dispatch({ type });
    setStatus(type === 'undo' ? 'Изменение документа отменено.' : 'Изменение документа повторено.');
  }
  function textForm(committed: InspectorValue, max: number, toDocument: (value: InspectorValue) => PilotDocument) {
    const id = current.id;
    const draft = readInspectorDraft(dirtyDrafts, id, locale);
    const value = { ...committed, ...draft };
    const discard = () => setDrafts(previous => discardInspectorDraft(previous, id, locale));
    return <TextForm key={id + ':' + locale} value={value} dirty={draft !== undefined} max={max}
      onEdit={next => setDrafts(previous => editInspectorDraft(previous, id, locale, next, committed))}
      onApply={() => {
        const next = toDocument({ ...value, text: value.text.trim() });
        if (!validatePilot(next)) return false;
        commit(next);
        discard();
        const target = next.menu.find(entry => entry.id === id)?.target;
        if (item && target && target !== item.target) {
          setDrafts(previous => discardCommittedTarget(previous, id, target));
        }
        setStatus('Изменения применены к документу.');
        return true;
      }}
      onDiscard={() => { discard(); setStatus('Неприменённые изменения отменены.'); }} />;
  }
  const select = (id: string, properties = false) => {
    setSelected(id);
    if (properties) setPanel('Properties');
  };
  const selectionProps = (id: string) => ({
    className: 'zp-select', 'aria-pressed': current.id === id, onClick: () => select(id),
  });
  function addMenu() {
    if (document.menu.length >= MAX_MENU) return;
    const id = 'nav-' + crypto.randomUUID();
    commit({ ...document, menu: [...document.menu, { id, label: { ru: 'Новый пункт', en: 'New item' }, target: '#hero' }] });
    focusInspector.current = true;
    select(id, true);
  }
  function download() {
    try {
      const json = exportPilot(document);
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = window.document.createElement('a');
      link.href = url;
      link.download = 'zarya-ux-pilot.json';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('JSON подготовлен к скачиванию.');
    } catch {
      setStatus('Экспорт заблокирован: модель не прошла проверку.');
    }
  }
  let properties: ReactNode;
  if (current.id === 'hero') {
    properties = textForm({ text: document.hero[locale] }, MAX_HERO_TEXT,
      ({ text }) => ({ ...document, hero: { ...document.hero, [locale]: text } }));
  } else if (item) {
    properties = <>
      {textForm({ text: item.label[locale], target: item.target }, MAX_MENU_TEXT,
        ({ text, target }) => ({ ...document, menu: document.menu.map(other => other.id !== item.id ? other : {
          ...item, label: { ...item.label, [locale]: text }, target: target ?? item.target,
        }) }))}
      <button type="button" className="z-button" onClick={() => {
        const target = item.target === '#hero' ? heroTarget.current : contactTarget.current;
        select(item.target === '#hero' ? 'hero' : 'contact');
        target?.querySelector('button')?.focus();
      }}>Показать цель</button>
      <div className="zp-actions" role="group" aria-label="Порядок пунктов">
        <button type="button" className="z-button z-icon" aria-label="Переместить пункт выше" disabled={index < 1}
          onClick={() => commit({ ...document, menu: moveMenu(document.menu, item.id, -1) })}><Icon name="arrow-up" /></button>
        <button type="button" className="z-button z-icon" aria-label="Переместить пункт ниже" disabled={index >= document.menu.length - 1}
          onClick={() => commit({ ...document, menu: moveMenu(document.menu, item.id, 1) })}><Icon name="arrow-down" /></button>
        <button type="button" className="z-button" onClick={() => {
          if (!confirmRemoving([item.id])) return;
          commit({ ...document, menu: document.menu.filter(other => other.id !== item.id) });
          focusInspector.current = true;
          select('navigation', true);
        }}>Удалить пункт</button>
      </div>
    </>;
  } else if (current.id === 'navigation') {
    properties = <><p>{document.menu.length ? 'Выберите пункт на Canvas или в слоях.' : 'Меню пусто.'}</p>
      <button className="z-button" type="button" disabled={document.menu.length >= MAX_MENU} onClick={addMenu}>Добавить пункт</button></>;
  } else {
    properties = <p>Редактирование этого слоя в пилоте недоступно.</p>;
  }
  return <main className="zp-editor">
    <header className="zp-heading">
      <div><button className="z-button z-text-button" type="button" onClick={onBack}>К Workspace</button>
        <h1 ref={heading} tabIndex={-1}>EMIKMAN · первый экран</h1>
        <p className="z-muted">Локальный UX-прототип. Черновик сбрасывается при перезагрузке.</p></div>
      <div className="zp-actions">
        <button className="z-button" type="button" disabled={!history.past.length} onClick={() => changeHistory('undo')}>Отменить</button>
        <button className="z-button" type="button" disabled={!history.future.length} onClick={() => changeHistory('redo')}>Повторить</button>
        <button className="z-button" type="button" onClick={download}>Экспорт JSON</button>
      </div>
    </header>
    <p className="zp-status" role="status">{status}</p>
    <p className="zp-draft-status" role="status">{dirtyDrafts.size > 0 ? 'Есть несохранённые изменения' : ''}</p>
    <div className="zp-layout">
      <aside className="zp-panel" aria-label="Слои страницы">
        <div className="zp-title"><h2>Слои</h2><button className="z-button z-icon" type="button" aria-label="Добавить пункт меню"
          disabled={document.menu.length >= MAX_MENU} onClick={addMenu}><Icon name="plus" /></button></div>
        <div className="zp-layers">{layers.map(layer => <button type="button" key={layer.id} {...selectionProps(layer.id)}>{layer.label}</button>)}</div>
      </aside>
      <section className="zp-stage" aria-label="Canvas пилота">
        <div className="zp-tools">
          <div className="zp-actions" role="group" aria-label="Размер Canvas">{modes.map(value =>
            <button type="button" className="z-button" key={value} aria-pressed={value === mode} onClick={() => setMode(value)}>{value}</button>)}</div>
          <div className="zp-actions">
            <button className="z-button" type="button" onClick={() => setPanel('Properties')}>Select</button>
            <button className="z-button" type="button" onClick={() => select('hero', true)}>Text</button>
            <button className="z-button" type="button" onClick={() => dialog.current?.showModal()}>Инструменты</button>
            <dialog ref={dialog} aria-label="Доступность инструментов" className="zp-tools-dialog">
              <h2>Инструменты</h2><p>Select и Text доступны. Остальные инструменты пока недоступны.</p>
              <ul>{unavailableTools.map(tool => <li key={tool}>{tool}</li>)}</ul>
              <form method="dialog"><button className="z-button" type="submit">Закрыть</button></form>
            </dialog>
          </div>
          <div className="zp-actions" role="group" aria-label="Язык макета">{locales.map(value =>
            <button type="button" className="z-button" key={value} aria-pressed={value === locale} onClick={() => setLocale(value)}>{value.toUpperCase()}</button>)}</div>
        </div>
        <div className="zp-artboard" data-viewport={mode} lang={locale}>
          <header className="zp-site-head">
            <button type="button" {...selectionProps('header')}>{copy[locale].brand}</button>
            <nav aria-label={locale === 'ru' ? 'Меню макета' : 'Preview navigation'}>
              {document.menu.map(entry => <button type="button" key={entry.id} {...selectionProps(entry.id)}>{entry.label[locale]}</button>)}
            </nav>
          </header>
          <section className="zp-hero" ref={heroTarget}>
            <h2><button type="button" {...selectionProps('hero')}>{document.hero[locale]}</button></h2>
            <button type="button" {...selectionProps('image')} aria-label={locale === 'ru' ? 'Выбрать слой Image' : 'Select Image layer'}>
              <span className="zp-image" aria-hidden="true" /></button>
          </section>
          <section ref={contactTarget} className="zp-contact">
            <button type="button" {...selectionProps('contact')}>{copy[locale].contact}</button>
            <small>{copy[locale].demo}</small>
          </section>
        </div>
      </section>
      <aside className="zp-panel zp-inspector" aria-label="Инспектор пилота">
        <h2>Инспектор</h2>
        <div className="zp-actions" role="group" aria-label="Режим инспектора">{panels.map(value =>
          <button type="button" className="z-button" key={value} aria-pressed={value === panel} onClick={() => setPanel(value)}>{value}</button>)}</div>
        <h3 ref={inspector} tabIndex={-1}>{current.label}</h3><p className="z-muted">ID <code>{current.id}</code></p>
        {hasLayerDrafts(dirtyDrafts, current.id) && <p className="z-muted">Черновики слоя: {locales.filter(value =>
          readInspectorDraft(dirtyDrafts, current.id, value)).map(value => value.toUpperCase()).join(', ')}</p>}
        {panel === 'Properties' && properties}
        {panel === 'AI Chat' && <div className="zp-fields">
          <p>Тип: {item ? 'Navigation item' : current.label}. Доступные свойства: {item ? 'текст и ссылка' : current.id === 'hero' ? 'текст' : 'пока нет'}.</p>
          <label>Запрос к выбранному слою<textarea key={current.id} maxLength={500} rows={3} /></label>
          <button className="z-button" type="button" disabled>Отправить AI-запрос</button>
          <p>AI Proposal, Preview, Diff и Accept / Reject пока недоступны.</p>
        </div>}
        {panel === 'Comments' && <p>Комментарии к слою, ответы и Resolve запланированы. Обсуждение пока недоступно.</p>}
        {panel === 'Code' && <p>Код для этого адаптера недоступен. В лаборатории используется отдельная модель WDeaf.</p>}
        {panel === 'History / QA' && <p>Локальных изменений: {history.past.length}. При экспорте проверяется модель пилота. История ревизий и DS QA недоступны.</p>}
      </aside>
    </div>
  </main>;
}
