import { definition } from '../registry';
import type { CanvasElement } from './model';
export function TablePreview({ element }: { element: CanvasElement }) {
  const data = definition('table').previewData!;
  return <div className="ds-table-wrap"><table className="ds-table"><caption>{element.editorProps.title}</caption><thead><tr>{data.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{data.rows.map((row, index) => <tr key={index}>{row.map((cell, col) => <td key={col}>{col === 2 ? <span className="table-action-preview">{cell}</span> : cell}</td>)}</tr>)}</tbody></table><p className="muted">Демонстрационные данные · действия в строках — предпросмотр</p></div>;
}
