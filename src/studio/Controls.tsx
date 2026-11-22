import type { ReactNode } from 'react';

const paths = {
  theme: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 3v18 M15 6v12 M18 9v6',
  ruler: 'M3 6h18v12H3z M7 6v5 M11 6v3 M15 6v5',
  home: 'm3 10 9-7 9 7v10h-6v-6H9v6H3z',
  folder: 'M3 6h6l2 3h10v11H3z',
  chat: 'M4 4h16v12H9l-5 4z',
  layers: 'm12 3 9 5-9 5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5',
  history: 'M3 11a9 9 0 1 1 2.5 7 M3 4v7h7 M12 7v5l3 2',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  page: 'M5 3h9l5 5v13H5z M14 3v6h5',
  type: 'M3 6V4h18v2 M12 4v16 M8 20h8',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.1 M3 12h.1 M3 18h.1',
  desktop: 'M2 4h20v13H2z M12 17v4 M8 21h8',
  tablet: 'M5 2h14v20H5z M11 19h2',
  mobile: 'M7 2h10v20H7z M11 19h2',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  back: 'm14 5-7 7 7 7', plus: 'M12 4v16 M4 12h16',
  window: 'M3 4h18v16H3z M3 9h18', controls: 'M3 7h5m5 0h8M3 17h10m5 0h3 M8 4h5v6H8z M13 14h5v6h-5z',
  spark: 'm12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z',
  panel: 'M3 4h18v16H3z M9 4v16',
} as const;

export function Glyph({ name }: { name: keyof typeof paths }) {
  return <svg aria-hidden="true" className="zs-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

export function BrandMark() {
  return <i className="zs-mark" aria-hidden="true" />;
}

export function PanelHeading({ icon, children }: { icon: keyof typeof paths; children: ReactNode }) {
  return <h2 className="zs-panel-heading"><Glyph name={icon} />{children}</h2>;
}

export function Status({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'draft' | 'ok' | 'error' }) {
  return <span className="zs-status" data-tone={tone} role="status">{children}</span>;
}
