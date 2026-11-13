/** A conformance profile only. Never a production deployment/principal policy. */
export const FOUNDATION_TEST_PROFILE = 'zarya.p04.a.foundation.test/v0';
export const A_TEST_RESTRICTIONS = Object.freeze({
  scope: 'A_TEST_ONLY', productionPrincipal: 'NOT_IMPLEMENTED',
  persistencePermission: 'NOT_GRANTED', executionPermission: 'NOT_GRANTED',
  trustedAdmission: 'NOT_IMPLEMENTED', productionConfiguration: 'BLOCKED_BY_OWNER_DECISIONS',
} as const);
export type TestFoundationPolicy = Readonly<{ kind:'test-foundation-policy' }>;
const policies = new WeakSet<object>();
/** Accept exactly an explicit primitive TEST profile ID. No defaults, object/property traversal or env fallback. */
export function inspectTestFoundationPolicy(profile:unknown):
  | Readonly<{kind:'test-policy-rejected'}>
  | Readonly<{kind:'test-policy-ready';policy:TestFoundationPolicy}> {
  if(typeof profile!=='string'||profile!==FOUNDATION_TEST_PROFILE)return Object.freeze({kind:'test-policy-rejected'});
  const policy:TestFoundationPolicy=Object.freeze({kind:'test-foundation-policy'});
  policies.add(policy);return Object.freeze({kind:'test-policy-ready',policy});
}
/** Identity check only: an equal literal/clone/cast is never a configured policy. */
export function isTestFoundationPolicy(value:unknown):value is TestFoundationPolicy {
  return typeof value==='object'&&value!==null&&policies.has(value);
}
