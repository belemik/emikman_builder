export type ApplicationRoute = 'workspace' | 'laboratory' | 'unknown';
export type KnownApplicationRoute = Exclude<ApplicationRoute, 'unknown'>;

/** Query routing needs no server rewrite and preserves the GitHub Pages base. */
export function resolveApplicationRoute(search: string): ApplicationRoute {
  const view = new URLSearchParams(search).get('view');
  if (view === null || view === 'workspace') return 'workspace';
  return view === 'laboratory' ? 'laboratory' : 'unknown';
}
export function applicationHref(route: KnownApplicationRoute): string {
  return `?view=${route}`;
}
/** Existing public Workspace demo shortcut; never a server-auth switch. */
export function isWorkspaceDemoShortcut(search: string): boolean {
  return new URLSearchParams(search).get('demo') === 'workspace' && resolveApplicationRoute(search) === 'workspace';
}
