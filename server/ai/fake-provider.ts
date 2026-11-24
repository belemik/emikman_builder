import { HERO_HEADING, type HeadingProvider } from './gateway';

/** Deterministic fixture for the synthetic event page. */
export function fakeHeadingProvider(value: string): HeadingProvider {
  return { async suggest() { return JSON.stringify({ path: HERO_HEADING, value }); } };
}
