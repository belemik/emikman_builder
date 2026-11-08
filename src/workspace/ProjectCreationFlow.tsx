import { useState } from 'react';
import { scenarios, type MockProjectBrief, type ScenarioId } from './model';

export function ProjectCreationFlow({ scenarioId, onCreate, onCancel }: { scenarioId: ScenarioId; onCreate: (brief: MockProjectBrief) => void; onCancel: () => void }) {
  const scenario = scenarios.find(item => item.id === scenarioId)!;
  const [brief, setBrief] = useState<MockProjectBrief>({ scenario: scenarioId, name: '', category: scenarioId === 'prototype' ? 'Веб' : 'Лендинг', description: '', source: '', references: '', library: 'wdeaf' });
  const field = <K extends keyof MockProjectBrief>(key: K, value: MockProjectBrief[K]) => setBrief(previous => ({ ...previous, [key]: value }));
  return <section className="z-flow z-page">
    <button type="button" className="z-button z-text-button" onClick={onCancel}>Назад к новому чату</button>
    <p className="z-eyebrow">Подготовка проекта · mock</p><h1>{scenario.title}</h1><p className="z-muted">Заполните описание. Откроется заранее заданный экран, не результат AI. Всё останется только в React state.</p>
    <form className="z-flow-form" onSubmit={event => { event.preventDefault(); onCreate(brief); }}>
      <label>Название проекта<input className="wdeaf-input" required maxLength={120} value={brief.name} onChange={event => field('name', event.target.value)} placeholder="Например, личный кабинет" /></label>
      {scenarioId === 'scratch' && <label>Тип сайта<select value={brief.category} onChange={event => field('category', event.target.value)}><option>Лендинг</option><option>Корпоративный сайт</option><option>Веб-сервис</option></select></label>}
      {scenarioId === 'prototype' && <label>Платформа<select value={brief.category} onChange={event => field('category', event.target.value)}><option>Веб</option><option>Android · только описание</option><option>iOS · только описание</option></select></label>}
      {(scenarioId === 'figma' || scenarioId === 'redesign') && <label>{scenarioId === 'figma' ? 'Ссылка на Figma' : 'URL существующего сайта'}<input className="wdeaf-input" type="url" required value={brief.source} onChange={event => field('source', event.target.value)} placeholder="https://…" /><small>Ссылка сохраняется только как текст в памяти. Источник не читается.</small></label>}
      <label>{scenarioId === 'redesign' ? 'Что требуется изменить' : scenarioId === 'figma' ? 'Описание ожидаемой реализации' : scenarioId === 'prototype' ? 'Описание сценария' : 'Описание задачи'}<textarea required maxLength={2000} value={brief.description} onChange={event => field('description', event.target.value)} rows={4} /></label>
      {(scenarioId === 'redesign' || scenarioId === 'prototype') && <label>Референсы<textarea value={brief.references} maxLength={2000} onChange={event => field('references', event.target.value)} rows={2} /><small>Не загружаются и не анализируются.</small></label>}
      <label>Дизайн-система<select value={brief.library} onChange={event => field('library', event.target.value as MockProjectBrief['library'])}><option value="wdeaf">WDeaf PRO 2.0 · пример</option><option value="none">Без подключения</option></select><small>Метаданные demo; подключение и контрактная проверка не выполняются.</small></label>
      <div className="z-flow-footer"><span className="z-muted">Без LLM, импорта, Apply и постоянного хранения</span><button type="submit" className="z-button z-primary" disabled={!brief.name.trim() || !brief.description.trim()}>Открыть демонстрационный проект</button></div>
    </form>
  </section>;
}
