import { useEffect, useRef, useState } from 'react';
import { CanvasEditor } from '../canvas/CanvasEditor';
import { emptyDocument, type CanvasDocument } from '../canvas/model';
import { acceptEditorDocument, strictDocument } from '../renderer/boundary';
import { exportDocument } from '../storage';

export const PROJECT_WARNING = 'Тестовый проект — не сохраняется после обновления страницы';

export type PersonalProject = {
  name: string;
  type: 'web-application';
  document: CanvasDocument;
};

export type PersonalProjectsState = {
  project: PersonalProject | null;
  setProject: (project: PersonalProject) => void;
};

export function PersonalProjects({ mode, project, onCreate, onNavigate }: {
  mode: 'list' | 'create';
  project: PersonalProject | null;
  onCreate: (project: PersonalProject) => void;
  onNavigate: (view: 'list' | 'create' | 'canvas') => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState('');
  useEffect(() => { heading.current?.focus(); }, [mode]);

  if (mode === 'create' && !project) {
    return <main className="z-project z-personal">
      <h1 ref={heading} tabIndex={-1}>Новый проект</h1>
      <p>{PROJECT_WARNING}.</p>
      <form onSubmit={event => {
        event.preventDefault();
        if (!name.trim()) return;
        onCreate({ name: name.trim(), type: 'web-application', document: emptyDocument() });
      }}>
        <label>Название проекта<input value={name} onChange={event => setName(event.target.value)} required maxLength={100} /></label>
        <label>Тип проекта<select name="type" defaultValue="web-application"><option value="web-application">Веб-приложение</option></select></label>
        <p>Дизайн-система: WDeaf PRO 2.0</p>
        <div className="z-personal-actions">
          <button type="submit" className="z-button z-primary" disabled={!name.trim()}>Открыть Canvas</button>
          <button type="button" className="z-button" onClick={() => onNavigate('list')}>Отмена</button>
        </div>
      </form>
    </main>;
  }

  return <main className="z-project z-personal">
    <h1 ref={heading} tabIndex={-1}>Мои проекты</h1>
    {project ? <article className="z-notice">
      <h2>{project.name}</h2>
      <p>Веб-приложение · WDeaf PRO 2.0</p>
      <p>{PROJECT_WARNING}.</p>
      <div><button type="button" className="z-button z-primary" onClick={() => onNavigate('canvas')}>Открыть Canvas</button></div>
    </article> : <>
      <p>У вас пока нет тестового проекта.</p>
      <div><button type="button" className="z-button z-primary" onClick={() => onNavigate('create')}>Создать проект</button></div>
    </>}
  </main>;
}

export function PersonalProjectEditor({ project, onChange, onBack }: {
  project: PersonalProject;
  onChange: (project: PersonalProject) => void;
  onBack: () => void;
}) {
  const [strict, setStrict] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState('');
  const setDocument = (update: (current: CanvasDocument) => CanvasDocument) => {
    try {
      onChange({ ...project, document: acceptEditorDocument(update(project.document)) });
      setError('');
    } catch (error) {
      setError(`Изменение отклонено: ${error instanceof Error ? error.message : 'ошибка схемы'}`);
    }
  };
  const download = () => {
    try { exportDocument(strict ? strictDocument(project.document) : project.document); setError(''); }
    catch (error) { setError(`Экспорт заблокирован: ${error instanceof Error ? error.message : 'ошибка схемы'}`); }
  };
  return <>
    <header className="app-header project-editor-header">
      <button type="button" onClick={onBack}>Мои проекты</button>
      <p>{PROJECT_WARNING}.</p>
      <button type="button" onClick={download}>Экспорт JSON</button>
    </header>
    {error && <p className="notice" role="alert">{error}</p>}
    <CanvasEditor project title={project.name} document={project.document} setDocument={setDocument} strict={strict}
      setStrict={setStrict} selected={selected} setSelected={setSelected} />
  </>;
}
