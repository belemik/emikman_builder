import type { CanvasElement } from '../canvas/model';
import matrix from '../../design-system/library-matrix.json';
export function libraryNode(e: CanvasElement): string | null {
 const rows = (matrix as Record<string, {nodeId:string;props:Record<string,unknown>}[]>)[e.component];
 return rows?.find(row => Object.entries(row.props).every(([k,v]) => e.variantProps[k] === v))?.nodeId ?? null;
}
