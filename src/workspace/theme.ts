import { useEffect, useState } from 'react';

export const THEME_STORAGE_KEY = 'zarya-workspace-theme';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ColorScheme = 'light' | 'dark';

export type ThemeStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type MediaQuery = {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
};

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function readThemeMode(storage: ThemeStorage | null): ThemeMode {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY) ?? null;
    return isThemeMode(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function writeThemeMode(storage: ThemeStorage | null, mode: ThemeMode): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* Настройка оформления недоступна. Остаётся текущий режим на время сессии. */
  }
}

export function resolvedScheme(mode: ThemeMode, systemDark: boolean): ColorScheme {
  if (mode === 'light' || mode === 'dark') return mode;
  return systemDark ? 'dark' : 'light';
}

export function watchSystemScheme(media: MediaQuery, getMode: () => ThemeMode, onScheme: (scheme: ColorScheme) => void): () => void {
  const emit = () => onScheme(resolvedScheme(getMode(), media.matches));
  emit();
  media.addEventListener('change', emit);
  return () => media.removeEventListener('change', emit);
}

export function browserStorage(): ThemeStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function systemPrefersDark(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function useWorkspaceTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => readThemeMode(browserStorage()));
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const scheme = resolvedScheme(mode, systemDark);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    return watchSystemScheme(media, () => mode, next => {
      setSystemDark(media.matches);
      document.documentElement.dataset.zaryaScheme = next;
    });
  }, [mode]);

  useEffect(() => {
    document.documentElement.dataset.zaryaMode = mode;
    document.documentElement.dataset.zaryaScheme = scheme;
  }, [mode, scheme]);

  const choose = (next: ThemeMode) => {
    setMode(next);
    writeThemeMode(browserStorage(), next);
  };

  return { mode, scheme, choose };
}
