import { CanvasEditor } from './canvas/CanvasEditor';
import { acceptEditorDocument, importEditorDocument, strictDocument } from './renderer/boundary';
import { isDemo, DEMO_STORAGE_KEY } from './runtime';
import { DemoAccountButton } from './demo';
import demoExample from './demo-editor-example.json?raw';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Icon, CloseButton } from './ui';
import './ui/styles.css';
import { exportDocument, exportRawDocument, loadDocument, saveDocument, migrationWarning, preserveRejectedDocument, listRecoveryBackups } from './storage';
import { generatePrompt, generateRendererPrompt } from './prompt';
import './styles.css';
import './appearance/appearance.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import './renderer/styles.css';
import { AccountButton, type User, type LogoutActions } from './account';
import { ApplicationShell } from './application/ApplicationShell';
import './workspace/workspace.css';
import './ux-pilot/pilot.css';

function LegacyBuilder({ user, onDemoExit, logoutActions }: { user: User; onDemoExit?: () => void; logoutActions?: LogoutActions }) {
  const storageKey = isDemo ? DEMO_STORAGE_KEY : `wdeaf.canvas.v1.${user.id}`;
  const [initial] = useState(() => loadDocument(storageKey, !isDemo && user.username === 'emikman'));
  const [document, setDocumentState] = useState(initial.document);
  const [strict, setStrict] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [paused, setPaused] = useState(Boolean(initial.error));
  const [saveStatus, setSaveStatus] = useState('');
  const [message, setMessage] = useState(initial.error ?? initial.warning ?? '');
  const [promptOpen, setPromptOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [backups, setBackups] = useState<ReturnType<typeof listRecoveryBackups>>([]);
  const importRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const setDocument = (next: typeof document | ((current: typeof document) => typeof document)) => {
    try { setDocumentState(acceptEditorDocument(typeof next === 'function' ? next(document) : next)); }
    catch (error) { setMessage(`Изменение отклонено: ${error instanceof Error ? error.message : 'ошибка схемы'}`); }
  };
  const preserveRecovery = () => {
    if (initial.recoveryRaw !== undefined) {
      preserveRejectedDocument(initial.recoveryRaw, storageKey);
      setBackups(listRecoveryBackups(storageKey));
    }
  };
  const importCanvas = (raw: string, confirmReplace: boolean) => {
    const imported = importEditorDocument(raw);
    if (confirmReplace && !window.confirm('Заменить текущий холст импортированным документом? При необходимости сначала экспортируйте текущий.')) return;
    if (paused) preserveRecovery();
    setDocument(imported.document); setSelected(undefined); setPaused(false);
    setMessage(migrationWarning(raw) ?? (imported.warnings.map(w => w.message).join(' ') || 'Документ импортирован.'));
  };
  const openDemoExample = () => {
    try {
      const hasLocalWork = paused || document.elements.length > 0 || document.tokenReferences.length > 0
        || Object.keys(document.themeOverrides).length > 0;
      importCanvas(demoExample, hasLocalWork);
    } catch (error) {
      setMessage(`Пример не открыт: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
    }
  };
  useEffect(() => {
    if (paused) { setSaveStatus('Автосохранение приостановлено'); return; }
    try { saveDocument(document, storageKey); setSaveStatus('Сохранено на устройстве'); }
    catch { setSaveStatus('Не удалось сохранить'); setMessage('localStorage недоступен или переполнен. Сохраните документ через JSON-экспорт.'); }
  }, [document, paused, storageKey]);
  useEffect(() => { if (promptOpen) dialogRef.current?.showModal(); else dialogRef.current?.close(); }, [promptOpen]);
  const prompt = (() => { try { return strict ? generateRendererPrompt(document) : generatePrompt(document); } catch (error) { return `Генерация заблокирована: ${error instanceof Error ? error.message : 'ошибка схемы'}`; } })();
  return <>
    <header className="app-header"><div className="brand"><span className="brand-mark">З</span><div><strong>ЗАРЯ</strong><small>Лаборатория компонентов</small></div><span className="badge">Legacy</span></div>
      <div className="header-actions"><button onClick={() => importRef.current?.click()}><Icon name="upload-01" /> Импорт JSON</button><button onClick={() => { try { exportDocument(strict ? strictDocument(document) : acceptEditorDocument(document)); } catch (error) { setMessage(`Экспорт заблокирован: ${error instanceof Error ? error.message : 'ошибка схемы'}`); } }}><Icon name="download-01" /> Экспорт JSON</button><button className="primary" onClick={() => { setCopied(false); setPromptOpen(true); }}>Сгенерировать промпт <Icon name="arrow-up-right" /></button>{isDemo ? <DemoAccountButton onExit={onDemoExit!} /> : <AccountButton user={user} logoutActions={logoutActions} />}</div>
    </header>
    {isDemo && <section className="notice" aria-label="Как попробовать редактор">
      <span>Изменения остаются в этом браузере. Рабочие проекты на сервере не сохраняются. Выберите элемент на холсте, измените его в инспекторе «Свойства», включите строгий DS Renderer для проверки и скачайте документ через «Экспорт JSON».</span>
      <button type="button" onClick={openDemoExample}>Загрузить пример</button>
    </section>}
    <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
      try {
        if (file.size > 2_000_000) throw new Error('Файл превышает 2 МБ.');
        const raw = await file.text();
        importCanvas(raw, document.elements.length > 0);
      } catch (error) { setMessage(`Импорт отклонён: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`); }
    }} />
    {(message || paused) && <div className="notice" role="status"><span>{message}</span>{paused && initial.recoveryRaw && <button onClick={()=>exportRawDocument(initial.recoveryRaw!)}>Скачать исходный JSON</button>}{paused && <button onClick={() => { try { preserveRecovery();setPaused(false);setMessage('Исходный проект сохранён отдельно в браузере.'); } catch { setMessage('Не удалось сохранить резервную копию. Скачайте исходный JSON; автосохранение остаётся приостановленным.'); } }}>Продолжить с текущим холстом</button>}<CloseButton label="Закрыть сообщение" size="s" onClick={() => setMessage('')} /></div>}
    <details className="notice" onToggle={event => { if (event.currentTarget.open) { try { setBackups(listRecoveryBackups(storageKey)); } catch { setMessage('Не удалось прочитать резервные копии. Исходники не изменены.'); } } }}>
      <summary>Резервные копии JSON</summary>
      {backups.length ? backups.map((backup, index) => <button key={backup.key} onClick={() => exportRawDocument(backup.raw)}>Скачать копию {index + 1}</button>) : <span>Сохранённых копий нет.</span>}
    </details>
    <CanvasEditor document={document} setDocument={setDocument} strict={strict} setStrict={setStrict} selected={selected} setSelected={setSelected} saveStatus={saveStatus} />
    <dialog ref={dialogRef} onCancel={() => setPromptOpen(false)} onClose={() => setPromptOpen(false)}><div className="dialog-heading"><div><h2>Задание для AI-редактора</h2><p className="muted">Codex · Cursor · Claude Code</p></div><CloseButton label="Закрыть промпт" onClick={() => setPromptOpen(false)} /></div><textarea aria-label="Сгенерированный промпт" readOnly value={prompt} /><div className="dialog-footer"><span className="muted" role="status">{copied ? 'Текст скопирован' : 'Генерация локальная, без обращения к AI'}</span><button className="primary" onClick={async () => { try { await navigator.clipboard.writeText(prompt); setCopied(true); } catch { setCopied(false); setMessage('Буфер обмена недоступен. Выделите текст промпта и нажмите ⌘C.'); dialogRef.current?.querySelector('textarea')?.select(); } }}>Скопировать текст</button></div></dialog>
  </>;
}
createRoot(window.document.getElementById('root')!).render(<React.StrictMode><ApplicationShell renderLaboratory={(user, exit, logoutActions) => <LegacyBuilder key={user.id} user={user} onDemoExit={exit} logoutActions={logoutActions} />} /></React.StrictMode>);
