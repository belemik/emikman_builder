import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import eventTemplate from '../../tests/fixtures/web-page/event.valid.json';
import { WebPageRenderer } from './WebPageRenderer';
import { validateWebPage, type WebPageIssue } from './validate';
import type { WebPageV01 } from './contract';

function HeroEditor({ page, accept }: { page: WebPageV01; accept: (page: WebPageV01) => void }) {
  const [heading, setHeading] = useState(page.hero.heading);
  const [body, setBody] = useState(page.hero.body.text);
  const [issue, setIssue] = useState<WebPageIssue>();
  const id = useId();
  const headingId = id + '-heading';
  const bodyId = id + '-body';
  const errorId = id + '-error';

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = validateWebPage(JSON.stringify({
      ...page, hero: { ...page.hero, heading, body: { ...page.hero.body, text: body } },
    }));
    if (!candidate.valid) {
      setIssue(candidate.issue);
      return;
    }
    accept(candidate.value);
    setIssue(undefined);
  }

  return <form onSubmit={apply} className="zwp-fields">
    <label htmlFor={headingId}>Заголовок</label>
    <input id={headingId} value={heading} onChange={event => { setHeading(event.currentTarget.value); setIssue(undefined); }}
      aria-invalid={issue?.path === '/hero/heading' || undefined}
      aria-describedby={issue?.path === '/hero/heading' ? errorId : undefined} />
    <label htmlFor={bodyId}>Основной текст</label>
    <textarea id={bodyId} value={body} rows={3} onChange={event => { setBody(event.currentTarget.value); setIssue(undefined); }}
      aria-invalid={issue?.path === '/hero/body/text' || undefined}
      aria-describedby={issue?.path === '/hero/body/text' ? errorId : undefined} />
    {issue && <p id={errorId} role="alert"><code>{issue.path || '/'}</code> — {issue.message}</p>}
    <button type="submit" className="z-button z-primary">Подтвердить локальную правку</button>
  </form>;
}

export function WebPageEditor({ onBack }: { onBack: () => void }) {
  const [accepted, setAccepted] = useState(() => validateWebPage(JSON.stringify(eventTemplate)));
  const [viewport, setViewport] = useState<'Desktop' | 'Mobile'>('Desktop');
  const [selected, setSelected] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const inspector = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); }, []);
  useEffect(() => { if (selected) inspector.current?.focus(); }, [selected]);

  return <main className="zwp-editor">
    <button type="button" className="z-button" onClick={onBack}>К Workspace</button>
    <h1 ref={title} tabIndex={-1}>Страница события</h1>
    {accepted.valid ? <>
      <p>Локальный черновик. Правки не сохраняются.</p>
      <div className="zwp-controls" role="group" aria-label="Размер страницы">
        {(['Desktop', 'Mobile'] as const).map(value => <button key={value} type="button" className="z-button"
          aria-pressed={viewport === value} onClick={() => setViewport(value)}>{value}</button>)}
      </div>
      <section aria-label="Canvas WebPage">
        <h2>Canvas</h2>
        <button type="button" className="z-button" aria-pressed={selected} onClick={() => {
          if (selected) inspector.current?.focus();
          else setSelected(true);
        }}>Выбрать Hero</button>
        <div className="zwp-viewport" data-viewport={viewport}><WebPageRenderer page={accepted.value} /></div>
      </section>
      {selected && <aside aria-label="Inspector WebPage">
        <h2 tabIndex={-1} ref={inspector}>Inspector · Hero</h2>
        <HeroEditor page={accepted.value} accept={value => setAccepted({ valid: true, value })} />
      </aside>}
      <section aria-label="Preview WebPage">
        <h2>Preview</h2>
        <div className="zwp-viewport" data-viewport={viewport}><WebPageRenderer page={accepted.value} /></div>
      </section>
    </> : <p role="alert"><code>{accepted.issue.path || '/'}</code> — {accepted.issue.message}</p>}
  </main>;
}
