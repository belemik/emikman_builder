import { Icon } from '../ui';
import { definition, type PropDefinition, type PropValue } from '../registry';
import type { CanvasElement } from '../canvas/model';
const labels: Record<string, string> = { checked: 'Отмечен', indeterminate: 'Смешанное состояние', foldDirection: 'Направление раскрытия', labelText: 'Текст подписи', optionsText: 'Варианты списка', title: 'Заголовок таблицы', size: 'Размер', variant: 'Вариант', colorScheme: 'Цветовая схема', state: 'Состояние предпросмотра', placeholder: 'Показывать placeholder', label: 'Текст', placeholderText: 'Текст placeholder' };
export function Inspector({ element, onChange }: { element?: CanvasElement; onChange: (element: CanvasElement) => void }) {
  if (!element) return <div className="inspector-empty"><Icon name="settings-01" /><h3>Выберите элемент</h3><p className="muted">Его варианты и содержимое появятся здесь.</p></div>;
  const entry = definition(element.component);
  function field(key: string, prop: PropDefinition, group: 'variantProps' | 'editorProps') {
    const update = (value: PropValue) => onChange({ ...element!, [group]: { ...element![group], [key]: value } });
    return <label key={key} className={prop.type === 'boolean' ? 'checkbox-field' : ''}>
      <span>{key === 'label' && group === 'variantProps' ? 'Показывать подпись' : labels[key] ?? key} <code>{key}</code></span>
      {prop.type === 'enum' ? <select value={String(element![group][key])} onChange={e => update(e.target.value)}>{prop.values.map(value => <option key={value}>{value}</option>)}</select>
        : prop.type === 'boolean' ? <input type="checkbox" checked={Boolean(element![group][key])} onChange={e => update(e.target.checked)} />
        : key === 'optionsText' ? <textarea aria-label="Варианты списка optionsText" maxLength={2000} rows={5} value={String(element![group][key])} onChange={e => update(e.target.value)} /> : <input maxLength={2000} value={String(element![group][key])} onChange={e => update(e.target.value)} />}
      {prop.note && <small>{prop.note}</small>}
    </label>;
  }
  return <section className="inspector-fields"><div className="selected-title"><h3>{entry.label}</h3><span className="badge">Выбран</span></div>
    <h4>Варианты Figma</h4>{entry.kind === 'composite' && <p className="muted">Table — составной preview-паттерн. Варианты table-cell не являются свойствами корневой таблицы.</p>}{Object.entries(entry.variantProps).map(([key, prop]) => field(key, prop, 'variantProps'))}
    <h4>Содержимое редактора</h4><p className="muted">Отдельно от свойств, подтверждённых Figma.</p>{Object.entries(entry.editorProps).map(([key, prop]) => field(key, prop, 'editorProps'))}
    {element.component === 'select' && <p className="muted">Выбор пункта в preview временный. optionsText хранит варианты списка.</p>}
    {entry.childComponentMetadata && <details><summary>Метаданные table-cell</summary>{Object.entries(entry.childComponentMetadata.variantProps).map(([name, prop]) => <p className="muted" key={name}><code>{name}</code>: {prop.values.join(', ')}</p>)}</details>}
    {element.component === 'input' && <p className="muted">Для filled показан демонстрационный текст. Ввод на холсте не редактируется.</p>}
  </section>;
}
