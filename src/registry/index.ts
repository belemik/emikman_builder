import seed from '../../components.seed.json';
import sprint02 from '../../components.sprint02.seed.json';

export type PropValue = string | boolean;
export type PropDefinition =
  | { type: 'enum'; values: string[]; default: string; note?: string }
  | { type: 'boolean'; default: boolean; note?: string }
  | { type: 'text'; default: string; note?: string };
export interface ComponentDefinition {
  id: string;
  label: string;
  figma: { pageNodeId: string; exampleComponentNodeId?: string; exampleFrameNodeId?: string; cellComponentNodeId?: string };
  kind?: string;
  previewData?: { columns: string[]; rows: string[][] };
  childComponentMetadata?: { component: string; variantProps: Record<string, { values: string[] }>; note: string };
  variantProps: Record<string, PropDefinition>;
  editorProps: Record<string, PropDefinition>;
}
// JSON imports widen literal property types; the bundled seed is the source of truth.
export const registry = [...seed.components, ...sprint02.components.filter(entry => !seed.components.some(original => original.id === entry.id))] as unknown as ComponentDefinition[];
export const origin = seed.origin;
export const figmaUrl = `https://www.figma.com/design/${origin.fileKey}/WDeaf-PRO-Design-System-2.0?node-id=2049-1688`;
export function definition(id: string) {
  const result = registry.find(component => component.id === id);
  if (!result) throw new Error(`Неизвестный компонент: ${id}`);
  return result;
}
export function defaults(props: Record<string, PropDefinition>): Record<string, PropValue> {
  return Object.fromEntries(Object.entries(props).map(([key, value]) => [key, value.default]));
}
