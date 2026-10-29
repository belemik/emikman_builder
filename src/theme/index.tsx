import { useEffect, useState } from 'react';
import { verifiedTokens } from '../tokens';
import { editorDefaults, isHexColor, resolveTheme, type ThemeOverrides } from './model';
export type { ThemeOverrides } from './model';
export function ThemeEditor({ overrides, onChange }: { overrides: ThemeOverrides; onChange: (overrides: ThemeOverrides) => void }) {
  const resolved = resolveTheme(overrides);
  const [hex, setHex] = useState(resolved.primaryColor);
  const [font, setFont] = useState(resolved.fontFamily);
  useEffect(() => { setHex(resolved.primaryColor); setFont(resolved.fontFamily); }, [resolved.primaryColor, resolved.fontFamily]);
  const invalidColor = !isHexColor(hex);
  return <section className="theme-editor"><div className="section-title"><h2>Тема холста</h2><span className="badge">Локальные overrides</span></div>
    <p className="muted">Изменения применяются только к холсту. Проверенные токены Figma остаются неизменными.</p>
    <label>Основной цвет<div className="color-field"><input aria-label="Выбор основного цвета" type="color" value={resolved.primaryColor} onChange={e => { setHex(e.target.value); onChange({ ...overrides, primaryColor: e.target.value }); }} /><input aria-label="Основной цвет HEX" aria-invalid={invalidColor} aria-describedby={invalidColor ? 'hex-error' : undefined} value={hex} maxLength={7} onChange={e => { setHex(e.target.value); if (isHexColor(e.target.value)) onChange({ ...overrides, primaryColor: e.target.value }); }} /></div></label>
    {invalidColor && <p id="hex-error" role="alert">Введите HEX вида #0055ff. Пока применяется последний корректный цвет.</p>}
    <label>Радиус {overrides.radiusPx === undefined ? '· по компоненту' : `· ${overrides.radiusPx} px`}<input aria-label="Радиус холста" type="range" min="0" max="32" value={overrides.radiusPx ?? editorDefaults.radiusPx} onChange={e => onChange({ ...overrides, radiusPx: Number(e.target.value) })} /></label>
    <p className="muted">Без override каждый компонент использует свой радиус. radius-4 — частный токен, не глобальный радиус.</p>
    <label>Шрифт<input aria-label="Шрифт холста" maxLength={100} value={font} aria-invalid={!font.trim()} onChange={e => { setFont(e.target.value); if (e.target.value.trim()) onChange({ ...overrides, fontFamily: e.target.value }); }} /></label>
    {!font.trim() && <p role="alert">Название шрифта не должно быть пустым.</p>}
    <p className="muted">Manrope по умолчанию. Для недоступного шрифта используется системный fallback. Редактор темы не загружает шрифты и не делает сетевых запросов.</p>
    <div className="theme-actions"><button onClick={() => { setHex(editorDefaults.primaryColor); setFont(editorDefaults.fontFamily); onChange({ ...editorDefaults }); }}>Сбросить настройки</button><button onClick={() => { setHex(editorDefaults.primaryColor); setFont(editorDefaults.fontFamily); onChange({}); }}>Восстановить WDeaf</button></div>
    <p className="muted">«Сбросить» — дефолты редактора, радиус 8 px. «Восстановить WDeaf» — удалить все overrides.</p>
    <details><summary>Проверенные токены · {Object.keys(verifiedTokens).length}</summary><p className="muted">Частичная выборка, не полный экспорт Figma.</p>{Object.entries(verifiedTokens).map(([name, entry]) => <div className="token-row" key={name}><code>{name}</code><span>{String(entry.value)}</span></div>)}</details>
  </section>;
}
