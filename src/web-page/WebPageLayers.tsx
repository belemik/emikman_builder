import { useState, type KeyboardEvent } from 'react';
import { Glyph } from '../studio/Controls';

export const layers = [
  { id: 'hero', title: 'Hero', icon: 'layers', selector: '.zwp-hero' },
  { id: 'heading', title: 'Заголовок', icon: 'type', selector: '.zwp-hero h3' },
  { id: 'body', title: 'Текст', icon: 'type', selector: '.zwp-hero p' },
  { id: 'image', title: 'Знак мероприятия', icon: 'grid', selector: '.zwp-poster' },
  { id: 'cta', title: 'Кнопка', icon: 'window', selector: '.zwp-cta' },
  { id: 'program', title: 'Программа', icon: 'list', selector: '.zwp-program' },
] as const;
export type Layer = typeof layers[number]['id'];

export function WebPageLayers({ selected, onSelect }: { selected: Layer | null; onSelect: (layer: Layer) => void }) {
  const [expanded, setExpanded] = useState(true);
  function moveFocus(event: KeyboardEvent<HTMLElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'));
    const index = rows.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    let next = index + (event.key === 'ArrowDown' ? 1 : -1);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = rows.length - 1;
    rows[Math.max(0, Math.min(next, rows.length - 1))].focus();
  }
  const row = (layer: typeof layers[number]) => <button type="button" aria-pressed={selected === layer.id}
    onClick={() => onSelect(layer.id)}><Glyph name={layer.icon} />{layer.title}</button>;
  return <nav onKeyDown={moveFocus} aria-label="Слои страницы" className="ze-tree">
    <div><Glyph name="page" />Страница события</div>
    <ul><li><div className="ze-tree-branch">{row(layers[0])}
      <button type="button" className="ze-expand" aria-expanded={expanded} aria-label="Дочерние слои Hero"
        onClick={() => setExpanded(!expanded)}><Glyph name="back" /></button></div>
      {expanded && <ul>{layers.slice(1,-1).map(layer => <li key={layer.id} data-child="true">{row(layer)}</li>)}</ul>}
    </li><li>{row(layers[layers.length - 1])}</li></ul>
  </nav>;
}
