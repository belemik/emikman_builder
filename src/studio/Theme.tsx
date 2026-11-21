import { createContext, useContext, type ReactNode } from 'react';
import { useThemePreference, type ThemeMode } from '../workspace/theme';
import { Glyph } from './Controls';

const ThemeContext = createContext<ReturnType<typeof useThemePreference>>({
  mode: 'dark', scheme: 'dark', choose: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useThemePreference();
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export const useWorkspaceTheme = () => useContext(ThemeContext);

export function ThemeSelect() {
  const { mode, choose } = useWorkspaceTheme();
  return <label className="zs-theme-select" title="Тема оболочки">
    <Glyph name="theme" />
    <select aria-label="Тема оболочки" value={mode} onChange={e => choose(e.target.value as ThemeMode)}>
      <option value="light">Светлая</option><option value="dark">Тёмная</option><option value="system">Системная</option>
    </select>
  </label>;
}
