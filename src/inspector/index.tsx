import { Icon } from '../ui';
import { definition, type PropDefinition, type PropValue } from '../registry';
import { createElement, type CanvasElement } from '../canvas/model';
import { slotRules } from '../design-system/composition';
import { syncComposition } from '../canvas/composition';
const labels: Record<string, string> = { checked: 'Отмечен', indeterminate: 'Смешанное состояние', foldDirection: 'Направление раскрытия', labelText: 'Текст подписи', optionsText: 'Варианты списка', title: 'Заголовок таблицы', size: 'Размер', variant: 'Вариант', colorScheme: 'Цветовая схема', state: 'Состояние предпросмотра', placeholder: 'Показывать placeholder', label: 'Текст', placeholderText: 'Текст placeholder' };
export function Inspector({ element, onChange }: { element?: CanvasElement; onChange: (element: CanvasElement) => void }) {
  if (!element) return <div className="inspector-empty"><Icon name="settings-01" /><h3>Выберите элемент</h3><p className="muted">Его варианты и содержимое появятся здесь.</p></div>;
  const entry = definition(element.component);
  function field(key: string, prop: PropDefinition, group: 'variantProps' | 'editorProps') {
    const update = (value: PropValue) => onChange(syncComposition({ ...element!, [group]: { ...element![group], [key]: value } }));
    return <label key={key} className={prop.type === 'boolean' ? 'checkbox-field' : ''}>
      <span>{key === 'label' && group === 'variantProps' ? 'Показывать подпись' : labels[key] ?? key} <code>{key}</code></span>
      {prop.type === 'enum' ? <select value={String(element![group][key])} onChange={e => update(e.target.value)}>{prop.values.map(value => <option key={value}>{value}</option>)}</select>
        : prop.type === 'boolean' ? <input type="checkbox" checked={Boolean(element![group][key])} onChange={e => update(e.target.checked)} />
        : key === 'optionsText' ? <textarea aria-label="Варианты списка optionsText" maxLength={2000} rows={5} value={String(element![group][key])} onChange={e => update(e.target.value)} /> : <input maxLength={2000} value={String(element![group][key])} onChange={e => update(e.target.value)} />}
      {prop.note && <small>{prop.note}</small>}
    </label>;
  }
  return <section className="inspector-fields"><div className="selected-title"><h3>{entry.label}</h3><span className="badge">Выбран</span></div>
    <a href={`https://www.figma.com/design/wiJYO9bWctpEiq2STFkNYU?node-id=${entry.figma.componentSetNodeId ?? entry.figma.exampleComponentNodeId ?? entry.figma.exampleFrameNodeId}`} target="_blank" rel="noreferrer">Оригинал компонента в Figma</a><h4>Варианты Figma</h4>{entry.kind === 'composite' && <p className="muted">Table — составной preview-паттерн. Варианты table-cell не являются свойствами корневой таблицы.</p>}{Object.entries(entry.variantProps).map(([key, prop]) => field(key, prop, 'variantProps'))}
    <h4>Содержимое редактора</h4><p className="muted">Текст и переключатели содержимого. Для новых семейств — подтверждённые свойства Figma; legacy editorProps описаны отдельно в реестре.</p>{Object.entries(entry.editorProps).map(([key, prop]) => field(key, prop, 'editorProps'))}
    {element.component === 'select' && <div><p className="muted">Выбрано: {element.interactionState?.selectedValue ?? 'не выбрано'}. Выбор сохраняется в JSON как состояние лаборатории, не свойство Figma.</p><button onClick={()=>onChange({...element,interactionState:{selectedValue:null}})}>Сбросить выбор Select</button></div>}
    {entry.childComponentMetadata && <details><summary>Метаданные table-cell</summary>{Object.entries(entry.childComponentMetadata.variantProps).map(([name, prop]) => <p className="muted" key={name}><code>{name}</code>: {prop.values.join(', ')}</p>)}</details>}
    {Object.entries(slotRules[element.component] ?? {}).map(([slot, rule]) => {
      const key=slot as keyof NonNullable<CanvasElement['slots']>, children=element.slots?.[key];
      return <fieldset key={slot}><legend>{slot} · {definition(rule.component).label}</legend>{children ? <><button onClick={()=>{const slots={...element.slots};delete slots[key];onChange({...element,slots});}}>Убрать настройку слота</button>{children.map((child,index)=><Inspector key={child.id} element={child} onChange={next=>onChange({...element,slots:{...element.slots,[key]:children.map((item,i)=>i===index?next:item)}})} />)}</> : <button onClick={()=>onChange(syncComposition({...element,slots:{...element.slots,[key]:[createElement(rule.component)]}}))}>Настроить {definition(rule.component).label}</button>}</fieldset>;
    })}
    {element.component === 'input' && <p className="muted">Для filled показан демонстрационный текст. Ввод в строгом renderer временный. Hint/Label подтверждены для l/default/placeholder=false.</p>}
  </section>;
}
