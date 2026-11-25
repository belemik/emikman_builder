import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { WebPageEditor, useEventSession } from '../../src/web-page/WebPageEditor';
import { BrandMark, Glyph } from '../../src/studio/Controls';
import { ThemeProvider, ThemeSelect, useWorkspaceTheme } from '../../src/studio/Theme';
import type { WebPageDocumentSummary } from '../../src/projects/web-page-repository.dto';
import type { WebPageV01 } from '../../src/web-page/contract';
import event from '../../tests/fixtures/web-page/event.valid.json';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '../../src/workspace/workspace.css';
import '../../src/studio/studio.css';
import '../../src/web-page/web-page.css';
import './pilot.css';
import {
  claimSession, confirmSave, createProject, dispatch, listDocuments, openPage, parseLocator, readPage, sameContext, savePage,
  type Command, type Confirmed, type Locator,
} from './client';

type DocumentList = { kind: 'idle' | 'loading' | 'error' } |
  { kind: 'ready'; documents: readonly WebPageDocumentSummary[]; truncated: boolean };
type Status = 'opened' | 'idle' | 'dirty' | 'busy' | 'saved' | 'invalid' | 'conflict' | 'write-rejected' | 'unknown' | 'denied';
const labels: Record<Status, string> = {
  opened: 'Открыта подтверждённая ревизия', idle: 'Синтетический режим', dirty: 'Изменено', busy: 'Выполняется запрос…',
  saved: 'Сохранено', invalid: 'Ошибка валидации', conflict: 'Конфликт ревизий',
  'write-rejected': 'Сохранение отклонено. Правки остались в редакторе.',
  unknown: 'Исход сохранения неизвестен. Проверьте исходный receipt.',
  denied: 'Не удалось открыть указанную ревизию.',
};

function AccessCodeForm({ label, action, disabled, className, onSubmit }: {
  label: string; action: string; disabled: boolean; className?: string; onSubmit: (code: string) => Promise<void>;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [invalidFormat, setInvalidFormat] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    if (!/^zc_[0-9a-f]{32}$/.test(code)) {
      setInvalidFormat(true);
      input.current?.focus();
      return;
    }
    setCode('');
    void onSubmit(code);
  }

  return <form className={className} onSubmit={submit} noValidate>
    <label htmlFor={id}>{label}</label>
    <input ref={input} id={id} type="password" autoComplete="off" autoCapitalize="none" spellCheck={false}
      required value={code} aria-invalid={invalidFormat || undefined}
      aria-describedby={invalidFormat ? id + '-format' : undefined} onChange={event => {
        setCode(event.target.value);
        setInvalidFormat(false);
      }} />
    {invalidFormat && <p id={id + '-format'} role="alert">
      Неверный формат кода. Введите код целиком из файла доступа, без пробелов. Он начинается с zc_.
    </p>}
    <button className={className ? 'z-button z-primary' : 'z-button'} type="submit" disabled={disabled}>{action}</button>
  </form>;
}

function CopyConflictEdits({ value }: { value: string }) {
  const id = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const current = useRef(value);
  const [copyResult, setCopyResult] = useState<{ value: string; copied: boolean }>();
  useEffect(() => { current.current = value; }, [value]);
  const feedback = copyResult?.value === value ? copyResult.copied
    ? 'Скопировано в буфер обмена.'
    : 'Не удалось скопировать. Выделите текст и скопируйте его вручную.' : '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      if (current.current === value) setCopyResult({ value, copied: true });
    } catch {
      if (current.current !== value) return;
      setCopyResult({ value, copied: false });
      field.current?.focus();
      field.current?.select();
    }
  }

  return <div className="live-conflict-field">
    <label htmlFor={id}>Все правки Hero</label>
    <textarea id={id} ref={field} value={value} readOnly />
    <button type="button" className="z-button" onClick={() => void copy()}>Скопировать все правки</button>
    <p role="status">{feedback}</p>
  </div>;
}

function ConflictRecovery({ heading, body, onBack }: { heading: string; body: string; onBack: () => void }) {
  const edits = 'Заголовок Hero\n' + heading + '\n\nОсновной текст Hero\n' + body;
  return <section className="live-conflict" aria-label="Восстановление после конфликта">
    <p>Документ был изменён в другой вкладке. Ваши правки сохранены в текущей вкладке. Перед выходом скопируйте их, откройте актуальную версию документа и перенесите изменения.</p>
    <details>
      <summary>Как продолжить работу</summary>
      <ol>
        <li>Скопируйте заголовок и текст одним действием «Скопировать все правки».</li>
        <li>Откройте актуальную версию из «Моих документов».</li>
        <li>Вставьте копию в текстовый редактор и перенесите нужные значения в Inspector.</li>
        <li>Нажмите «Применить».</li>
        <li>Нажмите «Сохранить».</li>
        <li>Дождитесь статуса «Сохранено» и подтверждённой ревизии.</li>
      </ol>
      <CopyConflictEdits value={edits} />
      <button type="button" className="z-button" onClick={onBack}>Перейти в «Мои документы»</button>
    </details>
  </section>;
}

function StudioEditor({ initial, onBack, controls, onDraftChange, onApply }: {
  initial: WebPageV01; onBack: () => void; controls: (session: ReturnType<typeof useEventSession>) => ReactNode;
  onDraftChange: (dirty: boolean) => void; onApply: (page: WebPageV01) => void;
}) {
  const session = useEventSession(initial, { onDraftChange, onApply });
  return <WebPageEditor session={session} onBack={onBack} storageControls={controls(session)} />;
}

function Pilot() {
  const [token, setToken] = useState('');
  const [loginState, setLoginState] = useState<'idle' | 'checking' | 'denied'>('idle');
  const [status, setStatus] = useState<Status>('idle');
  const [documentList, setDocumentList] = useState<DocumentList>({ kind: 'idle' });
  const [locatorText, setLocatorText] = useState('');
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);
  const [initial, setInitial] = useState<WebPageV01 | null>(null);
  const [accepted, setAccepted] = useState<WebPageV01 | null>(null);
  const [draft, setDraft] = useState(false);
  const [savedPayload, setSavedPayload] = useState<string>();
  const appliedPayload = accepted ? JSON.stringify(accepted) : undefined;
  const changed = appliedPayload !== savedPayload;
  const [pending, setPending] = useState<Command | null>(null);
  const [recovered, setRecovered] = useState(false);
  const [reauth, setReauth] = useState<'idle' | 'checking' | 'accepted' | 'denied'>('idle');

  useEffect(() => {
    if (!draft && !changed && !pending) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft, changed, pending]);

  async function authorize(code: string) {
    if (loginState === 'checking') return;
    setLoginState('checking');
    try {
      const handle = await claimSession(code);
      setToken(handle);
      setLoginState('idle');
      void refreshDocuments(handle);
    } catch { setLoginState('denied'); }
  }

  async function replaceSession(code: string) {
    if (!confirmed || status === 'busy' || reauth === 'checking') return;
    setReauth('checking');
    try {
      // A protected read of the already opened document proves the new lease
      // owns the same resource. Keep the original CAS and pending command.
      const candidate = await claimSession(code);
      const response = await openPage(await dispatch(candidate, readPage(confirmed)), confirmed);
      if (response.confirmed.revisionId !== confirmed.revisionId || response.confirmed.sha256 !== confirmed.sha256
        || !sameContext(response.confirmed.context, confirmed.context)) {
        throw Error('C_WEB_REAUTH');
      }
      setToken(candidate);
      setReauth('accepted');
    } catch {
      setReauth('denied');
    }
  }

  async function write(command: Command, reconcile = false) {
    setStatus('busy');
    setPending(command);
    setRecovered(false);
    try {
      const response = await dispatch(token, command, reconcile);
      if (response.kind === 'conflict') {
        setPending(null);
        setStatus(response.reason === 'EXPECTED_REVISION_MISMATCH' ? 'conflict' : 'write-rejected');
        return;
      }
      if (response.kind === 'invalid') { setPending(null); setStatus('invalid'); return; }
      const result = await confirmSave(response, command);
      if (confirmed && !sameContext(result.context, confirmed.context)) throw Error('C_WEB_CONTEXT_CHANGED');
      if (initial) {
        setConfirmed(result);
        setSavedPayload(JSON.parse(command.bytes).payload);
      } else {
        void refreshDocuments(token);
      }
      setPending(null);
      setStatus('saved');
      setRecovered(reconcile);
    } catch {
      setStatus('unknown');
    }
  }

  async function refreshDocuments(currentToken: string) {
    setDocumentList({ kind: 'loading' });
    try { setDocumentList({ kind: 'ready', ...await listDocuments(currentToken) }); }
    catch { setDocumentList({ kind: 'error' }); }
  }

  async function reopen(locator: Locator, listing?: WebPageDocumentSummary) {
    setStatus('busy');
    try {
      const result = await openPage(await dispatch(token, readPage(locator)), locator);
      if (listing && (result.confirmed.revisionId !== listing.revisionId || result.confirmed.sha256 !== listing.sha256)) {
        throw Error('C_WEB_LIST_REVISION');
      }
      setInitial(result.page); setAccepted(result.page); setSavedPayload(JSON.stringify(result.page));
      setConfirmed(result.confirmed); setStatus('opened');
      setRecovered(false);
    } catch { setStatus('denied'); }
  }

  function reopenReference(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const locator = parseLocator(locatorText);
    if (!locator) { setStatus('invalid'); return; }
    void reopen(locator);
  }

  function back() {
    if (status === 'busy' || reauth === 'checking') return;
    if (pending && !window.confirm('Вернуться без результата проверки receipt? Исход операции останется неизвестен.')) return;
    if ((draft || changed) && !window.confirm('Вернуться и удалить несохранённые правки?')) return;
    if (confirmed) setLocatorText(JSON.stringify({ revision: confirmed.revision, documentId: confirmed.documentId }));
    setPending(null); setInitial(null); setAccepted(null); setConfirmed(null); setDraft(false); setSavedPayload(undefined);
    setRecovered(false); setReauth('idle'); setStatus('idle');
    void refreshDocuments(token);
  }

  const edited = draft || changed;
  const display = edited && (status === 'saved' || status === 'opened') ? 'dirty' : status;
  const message = display === 'idle' ? null : <p role="status" data-testid="storage-status">
    {recovered ? (edited ? 'Изменено · предыдущая ревизия подтверждена по receipt' : 'Сохранено · результат восстановлен по receipt')
      : display === 'dirty' ? (draft ? 'Черновик' : 'Применено в сессии') : display === 'busy' && pending ? 'Сохранение…' : labels[display]}
  </p>;
  const reconciliation = pending && status === 'unknown'
    ? <button type="button" className="z-button" disabled={reauth === 'checking'} onClick={() => void write(pending, true)}>Проверить receipt</button> : null;
  if (!token) return <StudioDocumentWorkspace>
    <AccessCodeForm label="Одноразовый код доступа" action="Открыть Workspace" className="live-access"
      disabled={loginState === 'checking'} onSubmit={authorize} />
    {loginState === 'denied' && <p role="alert">Код недействителен или истёк. Выпустите новый код локально.</p>}
  </StudioDocumentWorkspace>;
  if (!initial) return <StudioDocumentWorkspace actions={<div className="zs-row live-actions">
    <button className="z-button z-primary" type="button" disabled={status === 'busy' || Boolean(pending)}
      onClick={() => void write(createProject(JSON.stringify(event)))}><Glyph name="plus" />Создать страницу события</button>
    {message}{reconciliation}
  </div>}>
    {documentList.kind === 'error' && !pending && <button className="z-button" type="button" onClick={() => {
      setToken(''); setDocumentList({ kind: 'idle' }); setStatus('idle');
    }}>Ввести новый код</button>}
    <section className="zs-work live-documents" aria-label="Мои документы" aria-busy={documentList.kind === 'loading'}>
      <header><h2>Мои документы</h2>
      <button className="z-button" type="button" disabled={documentList.kind === 'loading' || status === 'busy' || Boolean(pending)}
        onClick={() => void refreshDocuments(token)}>Обновить список</button></header>
      <div aria-live="polite">
        {documentList.kind === 'loading' && <p>Загружаем документы…</p>}
        {documentList.kind === 'error' && <p>Не удалось загрузить документы. Проверьте сессию и повторите чтение.</p>}
        {documentList.kind === 'ready' && (documentList.documents.length === 0
          ? <p>У вас пока нет документов.</p>
          : <ul className="live-document-cards">{documentList.documents.map(doc => <li key={doc.documentId}>
            <button className="z-button" type="button" disabled={status === 'busy' || Boolean(pending)} onClick={() => void reopen(doc, doc)}>
              <Glyph name="page" />{doc.title}
            </button>
          </li>)}</ul>)}
        {documentList.kind === 'ready' && documentList.truncated && <p>Показана часть документов. Доступ по сохранённой ссылке остаётся доступен.</p>}
      </div>
    </section>
    <details className="live-reference"><summary>Открыть историческую ревизию</summary><form onSubmit={reopenReference}>
      <label htmlFor="pilot-reopen">Ссылка на ревизию</label>
      <textarea id="pilot-reopen" maxLength={1024} value={locatorText} onChange={e => setLocatorText(e.target.value)} />
      <button type="submit" className="z-button" disabled={status === 'busy' || Boolean(pending)}>Открыть ревизию</button>
    </form></details>
  </StudioDocumentWorkspace>;

  return <StudioEditor initial={initial} onBack={back} {...{
    onDraftChange: setDraft,
    onApply: page => { setAccepted(page); setDraft(false); },
    controls: session => <div className="live-save">
      {message}{reconciliation}
      {status === 'conflict' && <ConflictRecovery heading={session.heading} body={session.body} onBack={back} />}
      <button type="button" className="z-button z-primary" disabled={!accepted || !confirmed || draft || !changed || Boolean(pending)
        || status === 'busy' || status === 'conflict' || status === 'write-rejected' || reauth === 'checking'}
        onClick={() => { if (confirmed && appliedPayload) void write(savePage(confirmed.revision, confirmed.documentId, appliedPayload)); }}>
        Сохранить
      </button>
      {draft && <p>Подтвердите локальную правку перед сохранением.</p>}
      {confirmed && <details>
        <summary>Повторная авторизация</summary>
        <AccessCodeForm label="Новый одноразовый код доступа" action="Проверить новую сессию"
          disabled={status === 'busy' || reauth === 'checking'} onSubmit={replaceSession} />
        <p aria-live="polite">{reauth === 'accepted' ? 'Сессия обновлена для владельца этой ревизии.'
          : reauth === 'denied' ? 'Сессию для этой ревизии подтвердить не удалось.'
            : reauth === 'checking' ? 'Проверка владельца…' : ''}</p>
      </details>}
      {confirmed && <details className="live-confirmation"><summary>Подтверждённая ревизия</summary><dl>
        <dt>DocumentRevision</dt><dd data-testid="pilot-revision">{confirmed.revisionId}</dd>
        <dt>SHA-256</dt><dd data-testid="pilot-digest">{confirmed.sha256}</dd>
        <dt><label htmlFor="pilot-reference">Ссылка на ревизию</label></dt>
        <dd><textarea id="pilot-reference" readOnly value={JSON.stringify({ revision: confirmed.revision, documentId: confirmed.documentId })} /></dd>
      </dl></details>}
    </div>,
  }} />;
}

function StudioDocumentWorkspace({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return <div className="z-main zs-live-workspace">
    <header className="z-header">
      <div><BrandMark /><strong>ЗАРЯ</strong><span className="zs-crumb">Workspace</span></div>
      <ThemeSelect />
    </header>
    <div className="z-content">
      <main className="zs-home">
        <div className="zs-chat-head">
          <div><p className="zs-kicker"><Glyph name="window" /> Синтетический режим</p><h1>Web Studio</h1></div>
          <div aria-hidden="true" className="zs-sun" />
        </div>
        {actions}
        {children}
      </main>
    </div>
  </div>;
}

function Surface() {
  const theme = useWorkspaceTheme();
  return <div className="zarya zs-platform" data-zarya-mode={theme.mode} data-zarya-scheme={theme.scheme}><Pilot /></div>;
}
createRoot(document.getElementById('root')!).render(<ThemeProvider><Surface /></ThemeProvider>);
