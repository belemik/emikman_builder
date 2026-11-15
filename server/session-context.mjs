import { types } from 'node:util';

/** Private trusted server bootstrap only. A separately created context cannot mint
 * leases in an installed server boundary. This is not a network decoder/issuer.
 * @param {(key:string)=>Promise<{identity:object,accountId:string,expiresAt:number}|null>} resolve
 */
export function createSessionContext(resolve) {
  /** @type {WeakMap<object,object>} */ const requests = new WeakMap();
  /** @type {WeakMap<object,{request:object,key:string,identity:object,accountId:string,expiresAt:number}>} */
  const leases = new WeakMap();
  return Object.freeze({
    /** Called exclusively by actual verified server guard; binding never comes from DTO.
     * @param {object} request
     * @param {{key:string,identity:object,accountId:string,expiresAt:number}} binding */
    bind(request, binding) {
      if (!request || typeof request !== 'object' || types.isProxy(request) || requests.has(request)) return;
      const lease = Object.freeze(Object.create(null));
      leases.set(lease, Object.freeze({request, key:binding.key, identity:binding.identity,
        accountId:binding.accountId, expiresAt:binding.expiresAt}));
      requests.set(request, lease);
    },
    /** @param {object} request */
    lease(request) { return requests.get(request) ?? null; },
    /** Fresh async lookup includes live users/session state; compare exact original lease.
     * No raw token/session/account object is returned.
     * @param {object} lease @param {object} request */
    async current(lease, request) {
      const saved = leases.get(lease);
      if (!saved || saved.request !== request || requests.get(request) !== lease) return null;
      try {
        if (!Number.isSafeInteger(saved.expiresAt) || Date.now() >= saved.expiresAt) return null;
        const live = await resolve(saved.key);
        if (!live || live.identity !== saved.identity || live.accountId !== saved.accountId ||
            live.expiresAt !== saved.expiresAt || Date.now() >= saved.expiresAt ||
            !/^[0-9a-f]{32}$/.test(saved.accountId)) return null;
        return saved.accountId;
      } catch { return null; }
    },
  });
}
