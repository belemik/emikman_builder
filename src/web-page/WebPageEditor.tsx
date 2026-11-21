import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import eventTemplate from '../../tests/fixtures/web-page/event.valid.json';
import { WebPageRenderer } from './WebPageRenderer';
import { validateWebPage, type WebPageIssue } from './validate';
import { BrandMark, Glyph, PanelHeading, Status } from '../studio/Controls';
import { ThemeSelect } from '../studio/Theme';
import { Modal } from '../workspace/Overlays';
import { WebPageLayers, layers, type Layer } from './WebPageLayers';
import { useNarrow } from '../workspace/Navigation';

export function useEventSession() {
  const [accepted, setAccepted] = useState(() => validateWebPage(JSON.stringify(eventTemplate)));
  const [heading, setHeading] = useState(eventTemplate.hero.heading);
  const [body, setBody] = useState(eventTemplate.hero.body.text);
  const [issue, setIssue] = useState<WebPageIssue>();
  const [feedback, setFeedback] = useState('Локальный шаблон');
  const dirty = accepted.valid && (heading !== accepted.value.hero.heading || body !== accepted.value.hero.body.text);

  function apply(event: FormEvent) {
    event.preventDefault();
    if (!accepted.valid) return false;
    const page = accepted.value;
    const candidate = validateWebPage(JSON.stringify({
      ...page, hero: { ...page.hero, heading, body: { ...page.hero.body, text: body } },
    }));
    if (!candidate.valid) { setIssue(candidate.issue); return false; }
    setAccepted(candidate); setHeading(candidate.value.hero.heading); setBody(candidate.value.hero.body.text);
    setIssue(undefined); setFeedback('Применено в сессии');
    return true;
  }
  function cancel() {
    if (!accepted.valid) return;
    setHeading(accepted.value.hero.heading); setBody(accepted.value.hero.body.text); setIssue(undefined);
    setFeedback('Черновик отменён');
  }
  return { accepted, heading, body, issue, dirty, feedback, apply, cancel,
    editHeading: (value: string) => { setIssue(undefined); setHeading(value); },
    editBody: (value: string) => { setIssue(undefined); setBody(value); } };
}

type Session = ReturnType<typeof useEventSession>;
const widths = { Desktop: 1080, Tablet: 768, Mobile: 390 };
type Device = keyof typeof widths | 'Custom';
const deviceIcons = { Desktop: 'desktop', Tablet: 'tablet', Mobile: 'mobile', Custom: 'ruler' } as const;

function CustomWidth({ width, onWidth }: { width: number; onWidth: (value: number) => void }) {
  const [draft, setDraft] = useState(String(width));
  return <form className="ze-custom" onSubmit={event => {
    event.preventDefault();
    const value = Number(draft);
    if (Number.isInteger(value) && value >= 320 && value <= 1920) onWidth(value);
  }}>
    <label>Ширина <input aria-label="Ширина Custom в пикселях" type="number" min={320} max={1920} step={1}
      required value={draft} onChange={event => setDraft(event.target.value)} /> px</label>
    <button className="z-button" type="submit" disabled={String(width) === draft}>Задать</button>
  </form>;
}
function Inspector({ layer, session, onPreview }: { layer: Layer | null; session: Session; onPreview?: () => void }) {
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const previewAction = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (session.issue) form.current?.querySelector<HTMLTextAreaElement>('[aria-invalid=true]')?.focus();
  }, [session.issue]);
  if (!layer || !session.accepted.valid) return <p className="ze-empty">Выберите блок на холсте или в списке слоёв.</p>;
  const page = session.accepted.value;
  if (layer === 'program' || layer === 'image' || layer === 'cta') {
    const details: [string, string][] = layer === 'program' ? page.program.items.map((item, i) => [String(i + 1), item.text])
      : layer === 'image' ? [['Ассет', page.hero.image.assetId], ['Альтернативный текст', page.hero.image.alt]] : [['Подпись', page.hero.cta.label], ['Цель', '#' + page.hero.cta.targetId]];
    return <div className="ze-inspector-content"><h3>{layers.find(row => row.id === layer)?.title}</h3><p className="zs-kicker">Только просмотр</p><dl className="ze-props">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>;
  }
  const { issue } = session;
  const mobileStatus = session.dirty ? 'Есть черновик. В Preview видны применённые правки.' : session.feedback;
  return <form ref={form} onSubmit={event => {
    if (session.apply(event)) previewAction.current?.focus();
  }} className="ze-fields" data-property={layer}>
    <div className="ze-inspector-inputs">
      <div className="ze-inspector-title"><span className="ze-node"><Glyph name="layers" /></span><div><h3>Hero</h3><small>{layer === 'heading' ? 'Заголовок' : layer === 'body' ? 'Основной текст' : 'Первый экран'}</small></div></div>
      <label htmlFor={id + 'heading'}>Заголовок <small>{session.heading.length}/100</small></label>
      <textarea rows={2} id={id + 'heading'} value={session.heading} onChange={e => session.editHeading(e.target.value)}
        aria-invalid={issue?.path === '/hero/heading' || undefined} aria-describedby={issue?.path === '/hero/heading' ? id + 'error' : undefined} />
      <label htmlFor={id + 'body'}>Основной текст <small>{session.body.length}/500</small></label>
      <textarea rows={4} id={id + 'body'} value={session.body} onChange={e => session.editBody(e.target.value)}
        aria-invalid={issue?.path === '/hero/body/text' || undefined} aria-describedby={issue?.path === '/hero/body/text' ? id + 'error' : undefined} />
      {issue && <p id={id + 'error'} role="alert"><code>{issue.path || '/'}</code><br/>{issue.message}</p>}
    </div>
    <div className="ze-inspector-footer"><div className="zs-row">
      <button type="submit" className="z-button z-primary" disabled={!session.dirty}>Применить</button>
      <button type="button" className="z-button" disabled={!session.dirty} onClick={() => {
        session.cancel();
        form.current?.querySelector<HTMLTextAreaElement>(layer === 'body' ? 'textarea:last-of-type' : 'textarea')?.focus();
      }}>Отменить</button>
      {onPreview && <button ref={previewAction} type="button" className="z-button" aria-label="Открыть Preview" onClick={onPreview}>Preview</button>}
    </div>
    <p className="ze-note" role={onPreview ? 'status' : undefined}>{onPreview ? mobileStatus : 'Правки действуют в текущей сессии.'}</p></div>
  </form>;
}

export function WebPageEditor({ session, onBack }: { session: Session; onBack: () => void }) {
  const narrow = useNarrow();
  const [device, setDevice] = useState<Device>(() => window.innerWidth < 550 ? 'Mobile' : window.innerWidth <= 800 ? 'Tablet' : 'Desktop');
  const [preview, setPreview] = useState(false);
  const [customWidth, setCustomWidth] = useState(1024);
  const [zoom, setZoom] = useState('fit');
  const [available, setAvailable] = useState(0);
  const [selected, setSelected] = useState<Layer | null>(session.dirty ? 'hero' : null);
  const [panel, setPanel] = useState<'layers' | 'inspector' | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const inspectorTitle = useRef<HTMLHeadingElement>(null);
  const inspectorTrigger = useRef<HTMLButtonElement>(null);
  const previewTrigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement>(null);
  const shell = useRef<HTMLElement>(null);
  const width = device === 'Custom' ? customWidth : widths[device];
  const scale = zoom === 'fit' ? Math.min(1, available / width) : Number(zoom);
  const { accepted } = session;
  useEffect(() => { title.current?.focus(); }, []);
  useEffect(() => { if (!narrow) setPanel(null); }, [narrow]);
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const element = shell.current;
    if (!panel || !viewport || !element) return;
    // Mobile keyboards can shrink the visual viewport while the layout viewport stays tall.
    const positionSheet = () => {
      const bottom = Math.max(0, document.documentElement.clientHeight - viewport.height - viewport.offsetTop);
      element.style.setProperty('--ze-sheet-bottom', bottom + 'px');
      element.style.setProperty('--ze-visible-height', viewport.height + 'px');
    };
    positionSheet();
    viewport.addEventListener('resize', positionSheet);
    viewport.addEventListener('scroll', positionSheet);
    return () => {
      viewport.removeEventListener('resize', positionSheet);
      viewport.removeEventListener('scroll', positionSheet);
    };
  }, [panel]);
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const styles = getComputedStyle(element);
    setAvailable(element.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight));
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [accepted.valid, preview, narrow]);
  function select(layer: Layer, reveal = false) {
    setSelected(layer);
    if (narrow) {
      returnFocus.current = inspectorTrigger.current;
      setPanel('inspector');
    }
    else inspectorTitle.current?.focus({ preventScroll: true });
    if (reveal) paper.current?.querySelector(layers.find(row => row.id === layer)!.selector)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  const status = session.dirty ? 'Есть черновик' : session.feedback;
  const tree = <WebPageLayers selected={selected} onSelect={layer => select(layer, true)} />;
  return <main ref={shell} className="ze-shell" data-preview={preview}>
    <header className="ze-toolbar"><div className="ze-identity"><button onClick={onBack} className="ze-back" aria-label="К Workspace"><BrandMark /><Glyph name="back" /></button>
      <div><small>Открытые мастерские · Шаблон</small><h1 ref={title} tabIndex={-1}>Страница события</h1></div></div>
      <div className="zs-switch ze-devices" role="group" aria-label="Размер страницы">{(Object.keys(deviceIcons) as Device[]).map(value =>
        <button key={value} aria-label={value} title={value} aria-pressed={device === value} onClick={() => setDevice(value)}><Glyph name={deviceIcons[value]} /></button>)}</div>
      <div className="ze-actions"><ThemeSelect /><Status tone={session.dirty ? 'draft' : session.feedback === 'Применено в сессии' ? 'ok' : 'neutral'}>{status}</Status>
        <button ref={previewTrigger} className="z-button" onClick={() => setPreview(!preview)} aria-label={preview ? 'В редактор' : 'Preview'}><Glyph name={preview ? 'back' : 'eye'} /><span>{preview ? 'В редактор' : 'Preview'}</span></button></div>
    </header>
    {!accepted.valid ? <p role="alert">{accepted.issue.path} · {accepted.issue.message}</p> : <div className="ze-layout">
      {!preview && !narrow && <aside className="ze-side"><PanelHeading icon="layers">Слои</PanelHeading>{tree}</aside>}
      <section className="ze-stage" aria-label={preview ? 'Preview WebPage' : 'Canvas WebPage'}>
        <div className="ze-stagebar"><span><Glyph name={preview ? 'eye' : 'window'} />{preview ? 'Preview' : 'Canvas'}{preview && session.dirty && <small>Подтверждённая версия</small>}</span>
          <label>Масштаб <select value={zoom} onChange={e => setZoom(e.target.value)} aria-label="Масштаб"><option value="fit">Вписать</option>{[0.5, 0.75, 1].map(z => <option key={z} value={z}>{z * 100}%</option>)}</select></label></div>
        {device === 'Custom' && <CustomWidth width={customWidth} onWidth={setCustomWidth} />}
        <div className="ze-scroll" ref={stage}><div className="ze-workarea" style={{ width: Math.max(available, width * scale) }}>
          <div className="ze-paper-label"><span>{device}</span><code>{width} px · {Math.round(scale * 100)}%</code></div>
          <div ref={paper} className="zwp-viewport" data-viewport={device} data-selection={preview ? undefined : selected}
            style={{ width, zoom: scale || 1 }} onClick={event => {
              if (preview || !(event.target instanceof Element)) return;
              if (event.target.closest('a')) event.preventDefault();
              const target = event.target;
              const hit = layers.find(row => row.id !== 'hero' && target.closest(row.selector));
              select(hit?.id ?? 'hero');
            }}><WebPageRenderer page={accepted.value} /></div></div></div>
        {narrow && !preview && <div className="ze-mobile-tools"><button aria-haspopup="dialog" onClick={e => {
          returnFocus.current = e.currentTarget; setPanel('layers');
        }}><Glyph name="layers" />Слои</button>
          <button ref={inspectorTrigger} aria-haspopup="dialog" onClick={e => {
            returnFocus.current = e.currentTarget; setPanel('inspector');
          }}><Glyph name="controls" />Inspector</button></div>}
      </section>
      {!preview && !narrow && <aside className="ze-side ze-right" aria-label="Inspector WebPage"><h2 ref={inspectorTitle} tabIndex={-1} className="zs-panel-heading"><Glyph name="controls" />Inspector</h2><Inspector session={session} layer={selected} /></aside>}
    </div>}
    <Modal key={panel === 'layers' ? 'layers' : 'inspector'} title={panel === 'layers' ? 'Слои' : 'Inspector'}
      open={narrow && !!panel} onClose={() => setPanel(null)} dismissLabel="На холст" returnFocusRef={returnFocus} returnFocusSelector=".ze-identity h1">
      {panel === 'layers' ? tree : <Inspector layer={selected} session={session} onPreview={() => {
        returnFocus.current = previewTrigger.current;
        setPanel(null); setPreview(true);
      }} />}</Modal>
  </main>;
}
