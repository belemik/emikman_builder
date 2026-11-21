import { useState } from 'react';
import { WebPageLayers, type Layer, layers } from '../web-page/WebPageLayers';
import { Modal } from '../workspace/Overlays';
import { Glyph, PanelHeading, Status } from './Controls';

const colors = ['background', 'surface', 'raised', 'border', 'text', 'muted', 'action', 'success', 'error', 'focus', 'input', 'disabled'];
export function ComponentBoard() {
  const [dialog, setDialog] = useState(false);
  const [tab, setTab] = useState('Основы');
  const [layer, setLayer] = useState<Layer | null>('hero');
  const [sample, setSample] = useState('Готово');
  return <section className="zs-board" aria-label="Компонентная доска ZARYA DS">
    <header><span className="zs-kicker">Интерфейс платформы</span><h1>ZARYA DS</h1><p>Компонентная доска Workspace и Editor.</p></header>
    <div className="zs-switch" role="group" aria-label="Раздел доски">{['Основы', 'Компоненты', 'Состояния'].map(value =>
      <button key={value} aria-pressed={value === tab} onClick={() => setTab(value)}>{value}</button>)}</div>
    {tab === 'Основы' && <div className="zs-board-grid"><section><PanelHeading icon="grid">Цвет</PanelHeading><div className="zs-swatches">{colors.map(name =>
      <div key={name}><i style={{ background: 'var(--zs-' + name + ')' }} /><code>{name}</code></div>)}</div></section>
      <section><PanelHeading icon="type">Типографика</PanelHeading><strong className="zs-type-sample">Аа Бб</strong><p>Manrope · Заголовки и текст</p><code>12 / 14 / 16 / 24 / 48 px</code></section>
      <section><PanelHeading icon="layers">Сетка и поверхности</PanelHeading><p>Отступы</p><div className="zs-scale">{[4, 8, 12, 16, 24, 32].map(size => <span key={size}><i style={{ width: size }} />{size}</span>)}</div><p>Панели · радиус 8 px. Карточки · 12 px.</p></section></div>}
    {tab === 'Компоненты' && <div className="zs-board-grid"><section><PanelHeading icon="controls">Элементы управления</PanelHeading>
      <label>Название<input defaultValue="Страница события" /></label><label>Устройство<select><option>Desktop</option><option>Tablet</option><option>Mobile</option></select></label>
      <div className="zs-row"><button className="z-button z-primary" onClick={() => setDialog(true)}>Открыть диалог</button><button className="z-button" disabled>Недоступно</button></div></section>
      <section><PanelHeading icon="layers">Слои и панели</PanelHeading><WebPageLayers selected={layer} onSelect={setLayer} /><Status>Выбран слой · {layers.find(row => row.id === layer)?.title}</Status></section></div>}
    {tab === 'Состояния' && <div className="zs-board-grid"><section><PanelHeading icon="window">Состояние панели</PanelHeading>
      <label>Образец<select value={sample} onChange={e => setSample(e.target.value)}>{['Готово', 'Черновик', 'Ошибка', 'Загрузка', 'Пусто'].map(s => <option key={s}>{s}</option>)}</select></label>
      <Status tone={sample === 'Ошибка' ? 'error' : sample === 'Черновик' ? 'draft' : sample === 'Готово' ? 'ok' : 'neutral'}>{sample}</Status>
      {sample === 'Загрузка' && <progress aria-label="Образец загрузки" />}
      {sample === 'Пусто' && <p>В этом списке пока нет элементов.</p>}
      {sample === 'Ошибка' && <p>Введите текст заголовка.</p>}</section></div>}
    <Modal title="Пример диалога" open={dialog} onClose={() => setDialog(false)}><div className="z-modal-body"><p>Образец модального окна платформы.</p><button className="z-button z-primary" onClick={() => setDialog(false)}><Glyph name="back" />К доске</button></div></Modal>
  </section>;
}
