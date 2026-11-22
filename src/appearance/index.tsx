import { useWorkspaceTheme } from '../studio/Theme';
import type { ThemeMode } from '../workspace/theme';

export function AppearancePicker() {
  const { mode, choose } = useWorkspaceTheme();
  return <label className="appearance-picker">Оформление<select aria-label="Оформление интерфейса" value={mode} onChange={e => choose(e.target.value as ThemeMode)}>
    <option value="light">Светлое</option><option value="system">Системное</option><option value="dark">Тёмное</option>
  </select></label>;
}
