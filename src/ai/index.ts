import type { CanvasElement, CanvasDocument } from '../canvas/model';
import type { ThemeOverrides } from '../theme/model';
/** Контракт для следующего спринта. Исполнителя команд и подключения LLM пока нет. */
export type ChatAction =
  | { type: 'add'; element: CanvasElement }
  | { type: 'update'; id: string; variantProps?: CanvasElement['variantProps']; editorProps?: CanvasElement['editorProps'] }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; toIndex: number }
  | { type: 'theme'; themeOverrides: ThemeOverrides };
export interface ChatCommand { action: ChatAction }
export interface ChatCommandProvider { propose(message: string, document: CanvasDocument): Promise<ChatCommand[]> }
