import { useEffect, useState } from 'react';
export type Appearance = 'light' | 'system' | 'dark';
export const APPEARANCE_KEY = 'wdeaf.appearance';
export function AppearancePicker() {
  const [mode, setMode] = useState<Appearance>(() => {
    try { const saved = localStorage.getItem(APPEARANCE_KEY); return saved === 'light' || saved === 'dark' ? saved : 'system'; } catch { return 'system'; }
  });
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.appearance = mode === 'system' ? media.matches ? 'dark' : 'light' : mode; };
    apply(); media.addEventListener('change', apply);
    try { localStorage.setItem(APPEARANCE_KEY, mode); } catch { /* Still usable without persistence. */ }
    return () => media.removeEventListener('change', apply);
  }, [mode]);
  return <label className="appearance-picker">Оформление<select aria-label="Оформление интерфейса" value={mode} onChange={e => setMode(e.target.value as Appearance)}><option value="light">Светлое</option><option value="system">Системное</option><option value="dark">Тёмное</option></select></label>;
}
