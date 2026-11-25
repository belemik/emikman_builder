import { randomBytes } from 'node:crypto';
import type { CTestSessions } from '../../server/projects/c-test-sessions';

const ttl = 60_000;
const opaque = (prefix: string) => prefix + randomBytes(16).toString('hex');

export function createBrowserAccess(sessions: CTestSessions, now = Date.now) {
  const codes = new Map<string, { account: string; expires: number }>();
  const handles = new Map<string, string>();
  function issue(account: string) {
    for (const [code, grant] of codes) if (now() >= grant.expires) codes.delete(code);
    if (codes.size >= 64) throw Error('C_BROWSER_CODE_BUDGET');
    const code = opaque('zc_');
    codes.set(code, { account, expires: now() + ttl });
    return code;
  }
  return {
    issue,
    claim(code: string): string | null {
      const grant = codes.get(code);
      if (!grant) return null;
      codes.delete(code);
      if (now() >= grant.expires) return null;
      for (const [handle, token] of handles) if (!sessions.get(token)) handles.delete(handle);
      if (handles.size >= 64) return null;
      const token = sessions.issue(grant.account, ttl);
      const handle = opaque('zb_');
      handles.set(handle, token);
      return handle;
    },
    resolve(handle: string): string | null {
      const token = handles.get(handle);
      return token && sessions.get(token) ? token : null;
    },
  };
}
